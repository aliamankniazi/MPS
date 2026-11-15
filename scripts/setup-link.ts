/**
 * Print a one-time link where a person chooses their own password on the
 * site. Use it while the site cannot send email, or when someone cannot use
 * the terminal. The link works once and expires in one hour; treat it like a
 * password and give it only to the person it is for.
 *
 *   npm run account:setup-link -- --email someone@example.com --site http://localhost:3000
 *   npm run cloud:setup-link -- --email someone@example.com --site https://<the live address> --allow-remote <host>
 */
import { connect, databaseUrl } from '../src/server/db/client';
import { argValue, checkTarget } from '../src/server/db/remote-guard';
import { createPasswordSetupLink, normaliseEmail } from '../src/server/auth/accounts';

async function main() {
  const email = normaliseEmail(argValue(process.argv, '--email'));
  if (!email) throw new Error('say who: --email someone@example.com');
  const site = argValue(process.argv, '--site');
  if (!site || !/^https?:\/\//.test(site)) throw new Error('say which site the link is for: --site https://...');
  const url = databaseUrl();
  if (!url) throw new Error('no database configured');
  const { host } = checkTarget(url, argValue(process.argv, '--allow-remote'));

  const { db, pool } = connect(url);
  try {
    const link = await createPasswordSetupLink(db, email, site.replace(/\/+$/, ''));
    if (!link) throw new Error(`no link made: there is no account for ${email} on ${host}, or a link was made less than a minute ago`);
    console.log(`One-time link for ${email} (works once, expires in 1 hour):\n${link}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[setup-link] stopped:', e instanceof Error ? e.message : e);
  process.exit(1);
});
