/**
 * Give one existing account the admin role, from this PC. For setting up the
 * owner after the data move, or recovering if nobody is an admin any more.
 *
 *   npm run account:make-admin -- --email owner@example.com
 *   ... --allow-remote <host>    needed for the cloud database
 *
 * The account must already exist (the person has signed up, or was brought
 * across from the old app). Their email is also marked as confirmed: running
 * this is the owner vouching for that address.
 */
import { eq } from 'drizzle-orm';
import { connect, databaseUrl } from '../src/server/db/client';
import { accounts } from '../src/server/db/schema';
import { argValue, checkTarget } from '../src/server/db/remote-guard';
import { normaliseEmail } from '../src/server/auth/accounts';
import { ADMIN_ROLE } from '../src/server/access/policy';
import { lockDocuments, readDocs, writeChanges } from '../src/server/sync/documents';

async function main() {
  const email = normaliseEmail(argValue(process.argv, '--email'));
  if (!email) throw new Error('say who: --email someone@example.com');
  const url = databaseUrl();
  if (!url) throw new Error('DATABASE_URL is not set');
  const { host } = checkTarget(url, argValue(process.argv, '--allow-remote'));

  const { db, pool } = connect(url);
  try {
    const [account] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
    if (!account) throw new Error(`no account for ${email} on ${host}. They need to sign up first.`);
    await db.transaction(async (tx) => {
      await lockDocuments(tx);
      const path = `userRoles/${account.id}`;
      const existing = (await readDocs(tx, [path], true)).get(path) ?? {};
      await writeChanges(tx, [{ path, data: { ...existing, roleId: ADMIN_ROLE, email } }]);
      await tx.update(accounts).set({ emailVerified: true }).where(eq(accounts.id, account.id));
    });
    console.log(`${email} is now an admin on ${host}.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[make-admin] stopped:', e instanceof Error ? e.message : e);
  process.exit(1);
});
