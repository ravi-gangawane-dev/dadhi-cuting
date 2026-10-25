// One-off TOTP code generator for local testing sessions.
// Usage: node scripts/totp.mjs <base32-secret>
// The secret is passed per-invocation and is never stored or committed.
import crypto from 'node:crypto';

const secret = process.argv[2] ?? '';
if (!secret) {
  console.error('Usage: node scripts/totp.mjs <base32-secret>');
  console.error('(the enrollment secret is shown once by the platform portal)');
  process.exit(1);
}
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
let bits = 0, value = 0;
const bytes = [];
for (const ch of secret.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')) {
  const idx = B32.indexOf(ch);
  if (idx === -1) continue;
  value = (value << 5) | idx;
  bits += 5;
  if (bits >= 8) bytes.push((value >>> (bits -= 8)) & 0xff);
}
if (!bytes.length) {
  console.error('Not a valid Base32 secret.');
  process.exit(1);
}
const counter = Math.floor(Date.now() / 1000 / 30);
const buf = Buffer.alloc(8);
buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
buf.writeUInt32BE(counter >>> 0, 4);
const hmac = crypto.createHmac('sha1', Buffer.from(bytes)).update(buf).digest();
const o = hmac[hmac.length - 1] & 0x0f;
const code = String((((hmac[o] & 0x7f) << 24) | (hmac[o + 1] << 16) | (hmac[o + 2] << 8) | hmac[o + 3]) % 1_000_000)
  .padStart(6, '0');
console.log(code);
