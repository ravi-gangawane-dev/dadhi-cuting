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

function password(length = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function fail(message: string, status = 403) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid request body', 400);
  }
  const action = body.action as string;
  const salonId = body.salonId as string | undefined;
  if (action !== 'create' && action !== 'reset_password') return fail('Unknown action', 400);
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
    new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });

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

  return fail('Unknown action', 400);
});