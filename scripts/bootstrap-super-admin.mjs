// One-time, operator-controlled provisioning of a platform administrator
// (Super Admin). Run on a trusted machine — NEVER in a browser bundle.
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role key> \
//   npm run bootstrap:admin
//
// The script is interactive (readline): it asks for the administrator's email
// and requires the operator to type the project ref as confirmation, so a key
// lying around in an environment cannot provision aimlessly. Idempotent:
// running it twice with the same email leaves exactly one admin row.
// Everything it does is written to platform_audit_logs.
//
// There is deliberately no public signup for this role, and no automatic
// promotion of a first registered user.
import { createClient } from '@supabase/supabase-js';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import crypto from 'node:crypto';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    'Provide SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as environment variables. ' +
      'The service-role key must never be committed or shown in browser bundles.',
  );
  process.exit(1);
}

const fetchUrl = new URL(url);
const projectRef = fetchUrl.hostname.split('.')[0];
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const rl = readline.createInterface({ input: stdin, output: stdout });
const email = (await rl.question('Administrator email (a real, accessible mailbox): ')).trim();
const argvPassword = process.argv.includes('--password');
const newPassword = argvPassword ? password() : null;

if (!email.includes('@')) {
  console.error('A valid email address is required.');
  process.exit(1);
}

console.log(`\nTarget project ref: ${projectRef}`);
const confirm = (await rl.question(`Type "${projectRef}" to confirm provisioning in THIS project: `)).trim();
rl.close();
if (confirm !== projectRef) {
  console.error('Aborted: confirmation did not match the project ref. Nothing was changed.');
  process.exit(1);
}

// 1. Resolve or create the auth user (never stored in app tables).
let userId = null;
let page = 1;
while (true) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error('Admin listing failed:', error.message);
    process.exit(1);
  }
  const match = data.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
  if (match) {
    userId = match.id;
    break;
  }
  if (data.users.length < 200) break;
  page++;
}
let generatedPassword = null;
if (!userId) {
  generatedPassword = newPassword ?? password();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: generatedPassword,
    email_confirm: true,
    user_metadata: { platform_admin: true },
  });
  if (error) {
    console.error('Could not create the auth user:', error.message);
    process.exit(1);
  }
  userId = data.user?.id ?? null;
}
if (!userId) {
  console.error('Could not resolve the auth user id.');
  process.exit(1);
}

// 2. Grant the platform role.
const { data: existingAdmin } = await admin
  .from('platform_admins')
  .select('user_id')
  .eq('user_id', userId)
  .maybeSingle();

if (!existingAdmin) {
  const { error } = await admin
    .from('platform_admins')
    .insert({ user_id: userId, granted_by: null, note: 'operator bootstrap script' })
    .select('user_id')
    .single();
  if (error) {
    console.error('Could not write the platform admin row:', error.message);
    process.exit(1);
  }
}

// 3. Profile row (optional identity display data).
await admin.from('user_profiles').upsert({ id: userId }, { onConflict: 'id' });

// 4. Audit trail.
const { error: auditError } = await admin.from('platform_audit_logs').insert({
  actor_user_id: userId,
  action: existingAdmin ? 'BOOTSTRAP_IDEMPOTENT' : 'BOOTSTRAP_PLATFORM_ADMIN',
  entity_type: 'platform_admins',
  entity_id: userId,
  details: { granted_by: 'operator script', project_ref: projectRef },
});
if (auditError) {
  console.error('Warning: the audit row could not be written:', auditError.message);
  process.exit(1);
}

console.log('\nDone. Platform administrator ready.');
console.log(`Email: ${email}`);
if (generatedPassword) {
  console.log(`Temporary password (shown once; enforce change at first login): ${generatedPassword}`);
}
console.log('The administrator must enroll MFA at /platform-admin/mfa before the portal opens.');

function password(length = 12) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(length), (b) => chars[b % chars.length]).join('');
}