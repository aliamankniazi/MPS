/**
 * Read-only: how many accounts exist, and whether any are locked or have
 * recent wrong-password attempts. Prints no emails and no passwords.
 *
 *   npx tsx --env-file=.env.cloud.local scripts/dev/account-health.ts
 */
import { sql } from 'drizzle-orm';
import { connect, databaseUrl } from '../../src/server/db/client';

async function main() {
  const url = databaseUrl();
  if (!url) throw new Error('no database configured');
  const { db, pool } = connect(url);
  try {
    const [rows] = (await db.execute(
      sql`SELECT COUNT(*) AS accounts, SUM(password_hash IS NOT NULL) AS with_password, SUM(email_verified) AS confirmed, SUM(failed_sign_ins) AS wrong_password_tries, SUM(locked_until IS NOT NULL AND locked_until > NOW(3)) AS locked_now FROM accounts`,
    )) as unknown as [Record<string, unknown>[]];
    console.log('host:', new URL(url).hostname);
    console.log(JSON.stringify(rows[0]));
    const [sessions] = (await db.execute(sql`SELECT COUNT(*) AS live_sessions FROM sessions WHERE expires_at > NOW(3)`)) as unknown as [Record<string, unknown>[]];
    console.log(JSON.stringify(sessions[0]));
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[account-health] failed:', e instanceof Error ? e.message.split('params:')[0] : e);
  process.exit(1);
});
