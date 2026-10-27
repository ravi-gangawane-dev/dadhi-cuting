// Reads the disposable mailbox and prints the first message's invite link.
// Credentials are supplied per invocation via env vars (MAIL_ADDRESS, MAIL_PASSWORD).
// Usage: node scripts/read-mail.mjs [--wait]
import process from 'node:process';

const address = process.env.MAIL_ADDRESS ?? '';
const password = process.env.MAIL_PASSWORD ?? '';
const wait = process.argv.includes('--wait');
if (!address || !password) {
  console.error('MAIL_ADDRESS and MAIL_PASSWORD env vars required (disposable mail.tm inbox).');
  process.exit(1);
}
const auth = { Authorization: `Bearer ${await tokenFor(address, password)}` };
let id = null;
for (let i = 0; i < (wait ? 9 : 1); i++) {
  if (i) await new Promise((r) => setTimeout(r, 8000));
  const list = await fetch('https://api.mail.tm/messages', { headers: auth }).then((r) => r.json());
  const first = list['hydra:member']?.[0];
  if (first) { id = first.id; break; }
}
if (!id) {
  console.log(JSON.stringify({ inbox: 'empty' }));
  process.exit(0);
}
const full = await fetch(`https://api.mail.tm/messages/${id}`, { headers: auth }).then((r) => r.json());
const text = full.text ?? '';
console.log(JSON.stringify(
  {
    from: full.from?.address,
    subject: full.subject,
    link: (text.match(/https:\/\/[^\s"']+/) ?? [])[0] ?? null,
  },
  null,
  2,
));

async function tokenFor(address, password) {
  const r = await fetch('https://api.mail.tm/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  }).then((r) => r.json());
  return r.token;
}
