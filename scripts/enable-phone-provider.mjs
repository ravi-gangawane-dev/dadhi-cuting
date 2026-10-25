/**
 * Brings SMS password reset to a working state on the linked Supabase project.
 *
 * Needs a personal access token (sbp_...) saved to `.supabase-token.local`
 * (gitignored). The token and the service-role key are read/derived at runtime
 * and never printed.
 *
 * Steps: read auth config -> enable the phone provider if it is off -> attach
 * and confirm the mobile number on the owner account -> send a real OTP with the
 * same call the app makes, so the SMS lands on the phone.
 */
import { readFileSync, existsSync } from 'node:fs';

const TOKEN_FILES = ['.supabase-token.local', 'supabase-token.txt'];
const ACCOUNT_EMAIL = process.env.OTP_ACCOUNT_EMAIL || 'dadhicutting.owner@mailinator.com';
const MOBILE = process.env.OTP_MOBILE || '9130451715';
const phone = `+91${MOBILE.replace(/\D/g, '').slice(-10)}`;

const tokenFile = TOKEN_FILES.find(
  (f) => existsSync(f) && readFileSync(f, 'utf8').trim().startsWith('sbp_'),
);
if (!tokenFile) {
  console.error(`No Supabase personal access token found. Save it to one of: ${TOKEN_FILES.join(', ')}`);
  process.exit(1);
}
const token = readFileSync(tokenFile, 'utf8').trim();
console.log(`using token from ${tokenFile}`);

const env = readFileSync('src/environments/environment.ts', 'utf8');
const ref = /supabaseUrl:\s*'https:\/\/([^.]+)\.supabase\.co'/.exec(env)?.[1];
if (!ref) {
  console.error('Could not read the project ref from src/environments/environment.ts');
  process.exit(1);
}

const api = 'https://api.supabase.com/v1';
const project = `https://${ref}.supabase.co`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const summarise = (config) => ({
  external_phone_enabled: config.external_phone_enabled,
  external_email_enabled: config.external_email_enabled,
  sms_provider: config.sms_provider,
  twilio_sid_set: !!config.sms_twilio_account_sid,
  twilio_token_set: !!config.sms_twilio_auth_token,
  twilio_messaging_sid_set: !!config.sms_twilio_message_service_sid,
  otp_length: config.sms_otp_length,
  otp_expiry: config.sms_otp_exp,
});

const fail = async (label, res) => {
  console.error(`${label} failed: HTTP ${res.status} ${(await res.text()).slice(0, 400)}`);
  process.exit(1);
};

// 1. Auth configuration
const before = await fetch(`${api}/projects/${ref}/config/auth`, { headers });
if (!before.ok) await fail('Reading auth config', before);
console.log('1. auth config before:', summarise(await before.json()));

const patch = await fetch(`${api}/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ external_phone_enabled: true }),
});
if (!patch.ok) await fail('Enabling the phone provider', patch);
const after = await fetch(`${api}/projects/${ref}/config/auth`, { headers });
console.log('   auth config after: ', summarise(await after.json()));

// 2. Project keys (service role is needed for the auth admin API)
const keysRes = await fetch(`${api}/projects/${ref}/api-keys?reveal=true`, { headers });
if (!keysRes.ok) await fail('Reading project API keys', keysRes);
const keys = await keysRes.json();
const serviceKey = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey =
  keys.find((k) => k.name === 'anon')?.api_key ||
  /sb_publishable_[A-Za-z0-9_-]+/.exec(env)?.[0];
if (!serviceKey) {
  console.error('No service_role key returned for this project.');
  process.exit(1);
}
console.log('2. project keys: service_role present, anon present:', !!anonKey);

const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

// 3. Attach and confirm the mobile number on the account
const listRes = await fetch(`${project}/auth/v1/admin/users?page=1&per_page=200`, { headers: admin });
if (!listRes.ok) await fail('Listing auth users', listRes);
const { users = [] } = await listRes.json();
const user = users.find((u) => (u.email || '').toLowerCase() === ACCOUNT_EMAIL.toLowerCase());
if (!user) {
  console.error(`3. no auth user with email ${ACCOUNT_EMAIL}; found ${users.length} user(s).`);
  process.exit(1);
}
console.log(`3. account found: ${user.email} | phone before: ${user.phone || 'none'} | confirmed: ${!!user.phone_confirmed_at}`);

if (user.phone !== phone || !user.phone_confirmed_at) {
  const update = await fetch(`${project}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers: admin,
    body: JSON.stringify({ phone, phone_confirm: true }),
  });
  if (!update.ok) await fail('Attaching the mobile number', update);
  const updated = await update.json();
  console.log(`   attached: phone ${updated.phone} | confirmed: ${!!updated.phone_confirmed_at}`);
} else {
  console.log('   already verified; nothing to attach.');
}

// 4. Send the code exactly as the app does
const otp = await fetch(`${project}/auth/v1/otp`, {
  method: 'POST',
  headers: { apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone, create_user: false }),
});
const body = await otp.text();
if (!otp.ok) {
  console.error(`4. OTP send failed: HTTP ${otp.status} ${body.slice(0, 400)}`);
  process.exit(1);
}
console.log(`4. OTP send: HTTP ${otp.status} — check ${phone} for the 6-digit code.`);
