import { writeFileSync } from 'node:fs';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (url || key) {
  if (!url || !key || !key.startsWith('sb_publishable_') || new URL(url).protocol !== 'https:') {
    throw new Error(
      'Supply HTTPS SUPABASE_URL and sb_publishable_ SUPABASE_PUBLISHABLE_KEY together.',
    );
  }
  writeFileSync(
    'src/environments/environment.ts',
    `export const environment = ${JSON.stringify({ supabaseUrl: url, supabasePublishableKey: key })};\n`,
  );
}
