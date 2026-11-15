/**
 * Confirm someone's email address by hand, for while the site cannot send
 * email. After this the person shows up in Role Management, where an admin
 * gives them a role; they sign in with the password they chose at sign-up.
 *
 *   npm run account:confirm -- --email someone@example.com             (local)
 *   npm run cloud:confirm -- --email someone@example.com --allow-remote <host>
 *
 * Only run this for an address you know belongs to that person.
 */
import { connect, databaseUrl } from '../src/server/db/client';
import { argValue, checkTarget } from '../src/server/db/remote-guard';
import { confirmAccountByOwner, normaliseEmail } from '../src/server/auth/accounts';

async function main() {
  const email = normaliseEmail(argValue(process.argv, '--email'));
  if (!email) throw new Error('say who: --email someone@example.com');
  const url = databaseUrl();
  if (!url) throw new Error('no database configured');
  const { host } = checkTarget(url, argValue(process.argv, '--allow-remote'));

  const { db, pool } = connect(url);
  try {
    if (!(await confirmAccountByOwner(db, email))) throw new Error(`no account for ${email} on ${host}. They need to sign up on the site first.`);
    console.log(`${email} is confirmed on ${host}. Now give them a role in Role Management.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[confirm-account] stopped:', e instanceof Error ? e.message : e);
  process.exit(1);
});
