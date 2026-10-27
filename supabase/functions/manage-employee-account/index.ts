// Supabase Edge Function: manage-employee-account
// Owner-controlled employee login provisioning and password resets.
// Runs with the service-role key server side; the browser never obtains it.
//
// Deploy: supabase functions deploy manage-employee-account
// Secrets (set once): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are provided by
// the platform automatically; nothing else is required.
//
// Security design:
// - The caller's own access token (Authorization header) is used to verify the
//   session; every privileged database read/write then runs under service role
//   but only after the caller was proven to be an active `owner` of the salon.
// - Passwords are generated server side (CSPRNG), stored only inside Supabase
//   Auth, returned exactly once in this response, never persisted in tables.
// - Suspension is additionally possible from the owner UI via the audited
//   set_member_active RPC.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ROLES = new Set(['manager', 'receptionist', 'employee', 'accountant']);

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

function password(length = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
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
  const salonId = body.salonId as string | undefined;
  if (!['create', 'reset_password', 'revoke_session'].includes(action)) {
    return fail('Unknown action', 400);
  }
  if (!salonId) return fail('Salon is required', 400);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return fail('Sign in required', 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  // Verifying client: resolves the caller with their own token.
  const verifier = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: identity, error: identityError } = await verifier.auth.getUser();
  if (identityError || !identity?.user) return fail('Sign in required', 401);
  const callerId = identity.user.id;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Only an active owner of THIS salon may manage its logins.
  const { data: callerRole, error: roleError } = await admin
    .from('salon_members')
    .select('role,active')
    .eq('salon_id', salonId)
    .eq('user_id', callerId)
    .single();
  if (roleError || !callerRole?.active || callerRole.role !== 'owner') {
    return fail('Not authorized');
  }

  const respond = (payload: unknown) =>
    new Response(JSON.stringify(payload), { headers: corsHeaders() });

  const audit = (entityType: string, entityId: string, actionText: string) =>
    admin.from('audit_logs').insert({ salon_id: salonId, actor_user_id: callerId, action: actionText, entity_type: entityType, entity_id: entityId });

  if (action === 'create') {
    const employeeId = body.employeeId as string | undefined;
    const email = String(body.email ?? '').trim().toLowerCase();
    const role = body.role as string | undefined;
    if (!employeeId || !email.includes('@') || !role || !ALLOWED_ROLES.has(role)) {
      return fail('Provide the employee, a valid email and an allowed role', 400);
    }
    const { data: employee, error: employeeError } = await admin
      .from('employees')
      .select('id,full_name,user_id')
      .eq('salon_id', salonId)
      .eq('id', employeeId)
      .single();
    if (employeeError || !employee) return fail('Employee not found', 404);
    if (employee.user_id) return fail('This employee already has a login');

    // Email already known to Auth? Reuse it instead of duplicating accounts.
    let userId: string | null = null;
    let created = false;
    let temporaryPassword = '';
    let page = 1;
    while (userId === null && !created) {
      const { data: users, error: listError } = await admin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (listError) return fail(String(listError.message));
      const match = users.users.find((u) => (u.email ?? '').toLowerCase() === email);
      if (match) {
        userId = match.id;
        break;
      }
      if (!users.users.length || users.users.length < 200) break;
      page++;
    }
    if (!userId) {
      temporaryPassword = password();
      const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: employee.full_name, must_change_password: true },
      });
      if (createError) return fail(String(createError.message));
      userId = createdUser.user?.id ?? null;
      created = true;
    }
    if (!userId) return fail('Could not resolve the auth account');

    const { error: profileError } = await admin
      .from('user_profiles')
      .upsert({ id: userId, full_name: employee.full_name }, { onConflict: 'id' });
    if (profileError) return fail(String(profileError.message));
    const { error: memberError } = await admin
      .from('salon_members')
      .upsert(
        { salon_id: salonId, user_id: userId, role, active: true },
        { onConflict: 'salon_id,user_id' },
      );
    if (memberError) return fail(String(memberError.message));
    const { error: linkError } = await admin
      .from('employees')
      .update({ user_id: userId })
      .eq('id', employeeId);
    if (linkError) return fail(String(linkError.message));
    await audit('employees', employeeId, 'CREATE_LOGIN');
    return respond({ ok: true, temporaryPassword: created ? temporaryPassword : null, reusedAccount: !created && !temporaryPassword });
  }

  if (action === 'reset_password') {
    const userId = body.userId as string | undefined;
    if (!userId) return fail('User is required', 400);
    const { data: member, error: memberError } = await admin
      .from('salon_members')
      .select('id,role,active')
      .eq('salon_id', salonId)
      .eq('user_id', userId)
      .single();
    if (memberError || !member) return fail('Member not found', 404);
    if (member.role === 'owner') return fail('Platform involvement is required to reset an owner');
    const temporaryPassword = password();
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: temporaryPassword,
    });
    if (updateError) return fail(String(updateError.message));
    await audit('salon_members', member.id, 'RESET_PASSWORD');
    return respond({ ok: true, temporaryPassword });
  }

  if (action === 'revoke_session') {
    // Suspends a revoked staff login immediately: kills every refresh token
    // the member holds, not just the row visibility (RLS remains the
    // backstop for access, this removes open browsing sessions). GoTrue
    // exposes the per-user logout in different shapes across versions, so
    // each candidate is attempted in order and the outcome is audited.
    const userId = body.userId as string | undefined;
    if (!userId) return fail('User is required', 400);
    const { data: member, error: memberError } = await admin
      .from('salon_members')
      .select('id,role,active')
      .eq('salon_id', salonId)
      .eq('user_id', userId)
      .single();
    if (memberError || !member) return fail('Member not found', 404);
    if (member.role === 'owner') return fail('Platform involvement is required to revoke an owner');
    const adminHeader = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
    const attempts: Array<{ variant: string; status: number | string; detail: string }> = [];
    let sessionsRevoked = false;
    for (const variant of [
      { name: 'DELETE /admin/sessions/{userId}', method: 'DELETE', path: `/auth/v1/admin/sessions/${userId}`, body: undefined as string | undefined },
      { name: 'DELETE /admin/sessions?user_id', method: 'DELETE', path: `/auth/v1/admin/sessions?user_id=${userId}`, body: undefined as string | undefined },
      { name: 'POST /admin/logout?scope=global', method: 'POST', path: '/auth/v1/admin/logout?scope=global', body: JSON.stringify({ userId }) },
    ]) {
      try {
        const revocation = await fetch(`${url}${variant.path}`, {
          method: variant.method,
          headers: { ...adminHeader, 'Content-Type': 'application/json' },
          body: variant.body,
        });
        const detail = revocation.ok ? '' : (await revocation.text()).slice(0, 160);
        attempts.push({ variant: variant.name, status: revocation.status, detail });
        if (revocation.ok) {
          sessionsRevoked = true;
          break;
        }
      } catch (e) {
        attempts.push({ variant: variant.name, status: 'network', detail: String(e).slice(0, 160) });
      }
    }
    if (!sessionsRevoked) {
      // Hosts whose GoTrue has no per-userId logout shape: rotating the
      // password to a random server-held secret invalidates every refresh
      // token (empirically verified: `refresh_token_not_found` afterwards).
      // Nobody receives the rotated secret; after a restore the owner issues
      // a fresh temporary password through the normal reset flow.
      const rotated = password(16);
      const { error: rotationError } = await admin.auth.admin.updateUserById(userId, { password: rotated });
      attempts.push({
        variant: 'admin password rotation',
        status: rotationError ? 'auth-error' : 'ok',
        detail: rotationError ? String(rotationError.message).slice(0, 160) : '',
      });
      if (!rotationError) sessionsRevoked = true;
    }
    await admin.from('audit_logs').insert({
      salon_id: salonId,
      actor_user_id: callerId,
      action: 'REVOKE_SESSION',
      entity_type: 'salon_members',
      entity_id: member.id,
    });
    console.log('revoke_session attempts', JSON.stringify({ user: userId, revocationsRevoked: sessionsRevoked, attempts }));
    return respond({ ok: true, sessionsRevoked, attempts });
  }

  return fail('Unknown action', 400);
});