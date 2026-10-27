// Supabase Edge Function: platform-admin-ops
// Super-Admin-only operations that require service-role privileges:
// invite owners for a salon, create a salon with its owner, and suspend or
// restore any membership centrally. Every action is written to
// platform_audit_logs.
//
// Deploy: supabase functions deploy platform-admin-ops
import { createClient } from 'jsr:@supabase/supabase-js@2';

function password(length = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/**
 * Browser CORS: the deployed site and local dev origin are the only ones that
 * may call this function from JS. Browsers preflight every Edge call; without
 * these headers the request is blocked before the function body ever runs.
 */
const ALLOWED_ORIGINS = new Set(['https://dadhi-cuting.netlify.app', 'http://localhost:4200']);

// Reflect per request (set at the top of the serve handler).
let requestOrigin: string | null = null;

function corsHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json', vary: 'Origin' };
  if (requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)) {
    headers['access-control-allow-origin'] = requestOrigin;
  }
  return headers;
}

function fail(message: string, status = 403) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsHeaders(),
  });
}

Deno.serve(async (req) => {
  requestOrigin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(),
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
        'access-control-max-age': '86400',
      },
    });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid request body', 400);
  }
  const action = body.action as string;
  if (!['invite_owner', 'create_salon', 'set_member'].includes(action)) {
    return fail('Unknown action', 400);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return fail('Sign in required', 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const verifier = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: identity, error: identityError } = await verifier.auth.getUser();
  if (identityError || !identity?.user) return fail('Sign in required', 401);
  const callerId = identity.user.id;

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Browser sessions can never self-elevate: the platform_admins allow list is
  // checked server side with the service role.
  const { data: adminRow, error: adminError } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', callerId)
    .maybeSingle();
  if (adminError || !adminRow) return fail('Not authorized');

  const respond = (payload: unknown) =>
    new Response(JSON.stringify(payload), { headers: corsHeaders() });

  const platformAudit = (actionText: string, entityType: string, entityId: string, details: unknown) =>
    admin.from('platform_audit_logs').insert({
      actor_user_id: callerId,
      action: actionText,
      entity_type: entityType,
      entity_id: entityId,
      details: details as object,
    });

  /** Finds the auth user id for an email (inviting when absent). */
  async function resolveUser(email: string, invite: boolean): Promise<{ id: string; invite: boolean; error?: string }> {
    let page = 1;
    while (true) {
      const { data: users, error: listError } = await admin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (listError) return { id: '', invite, error: String(listError.message) };
      const match = users.users.find((u) => (u.email ?? '').toLowerCase() === email);
      if (match) return { id: match.id, invite };
      const exhausted = users.users.length < 200;
      if (exhausted) break;
      page++;
    }
    if (!invite) return { id: '', invite, error: 'No account found for that email' };
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      user_metadata: { must_change_password: true },
    });
    if (inviteError) {
      if (/already registered|email exists/i.test(String(inviteError.message))) {
        return { id: '', invite, error: 'Account exists but could not be located; confirm membership provisioning' };
      }
      return { id: '', invite, error: String(inviteError.message) };
    }
    return { id: invited.user?.id ?? '', invite: true };
  }

  if (action === 'invite_owner') {
    const salonId = body.salonId as string | undefined;
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!salonId || !email.includes('@')) return fail('Salon and email are required', 400);
    const { data: salon } = await admin.from('salons').select('id').eq('id', salonId).single();
    if (!salon) return fail('Unknown salon', 404);
    const resolved = await resolveUser(email, true);
    if (resolved.error || !resolved.id) return fail(resolved.error ?? 'Could not resolve the account');
    const { data: existing } = await admin
      .from('salon_members')
      .select('id,role')
      .eq('salon_id', salonId)
      .eq('user_id', resolved.id)
      .maybeSingle();
    if (existing) return respond({ already_owner: true });
    const { error: memberError } = await admin
      .from('salon_members')
      .insert({ salon_id: salonId, user_id: resolved.id, role: 'owner', active: true });
    if (memberError) return fail(String(memberError.message));
    const { error: profileError } = await admin
      .from('user_profiles')
      .upsert({ id: resolved.id }, { onConflict: 'id' });
    if (profileError) return fail(String(profileError.message));
    await platformAudit('GRANT_OWNER', 'salon_members', salonId, { email, userId: resolved.id });
    return respond({ ok: true, invited: resolved.invite });
  }

  if (action === 'create_salon') {
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!name || !email.includes('@')) return fail('Salon name and owner email are required', 400);
    const resolved = await resolveUser(email, true);
    if (resolved.error || !resolved.id) return fail(resolved.error ?? 'Could not resolve the account');
    // provision_salon is a server-validated definer RPC granted to service_role;
    // it creates the salon, the ownership and the starter categories.
    const { data: salonId, error: provisionError } = await admin.rpc('provision_salon', {
      p_owner: resolved.id,
      p_name: name,
    });
    if (provisionError) return fail(String(provisionError.message));
    await platformAudit('CREATE_SALON', 'salons', String(salonId), { name, ownerEmail: email });
    return respond({ ok: true, salonId, invited: resolved.invite });
  }

  if (action === 'set_member') {
    const salonId = body.salonId as string | undefined;
    const userId = body.userId as string | undefined;
    const active = body.active as boolean | undefined;
    const role = body.role as string | undefined;
    if (!salonId || !userId || active === undefined) return fail('Salon, user and active flag are required', 400);
    const { data: member } = await admin
      .from('salon_members')
      .select('id,role')
      .eq('salon_id', salonId)
      .eq('user_id', userId)
      .single();
    if (!member) return fail('Member not found', 404);
    const { error: updateError } = await admin
      .from('salon_members')
      .update({
        ...(active !== undefined ? { active } : {}),
        ...(role && ['owner', 'manager', 'receptionist', 'employee', 'accountant'].includes(role)
          ? { role }
          : {}),
      })
      .eq('id', member.id);
    if (updateError) return fail(String(updateError.message));
    // A centrally suspended member must lose their open sessions as well.
    let sessionsRevoked = false;
    if (active === false) {
      try {
        const revocation = await fetch(`${url}/auth/v1/admin/logout?scope=global`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId }),
        });
        sessionsRevoked = revocation.ok;
      } catch {
        /* RLS containment already applies; revocation is belt-and-braces */
      }
    }
    await platformAudit('SET_MEMBER', 'salon_members', member.id, { active, role });
    return respond({ ok: true, sessionsRevoked });
  }

  return fail('Unknown action', 400);
});