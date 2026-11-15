/**
 * Read-only look at whichever database the environment names: version,
 * collation, tables and record counts. Writes nothing.
 *
 *   npx tsx --env-file=.env.local scripts/dev/inspect-db.ts          (local)
 *   npx tsx --env-file=.env.cloud.local scripts/dev/inspect-db.ts    (cloud)
 */
import { sql } from 'drizzle-orm';
import { connect, databaseUrl } from '../../src/server/db/client';

async function main() {
  const url = databaseUrl();
  if (!url) throw new Error('no database configured');
  const { db, pool } = connect(url);
  const rows = async (query: string) => ((await db.execute(sql.raw(query))) as unknown as [Record<string, unknown>[]])[0];
  try {
    console.log('host:', new URL(url).hostname);
    console.log('version:', (await rows('SELECT VERSION() AS v'))[0].v);
    console.log('database:', JSON.stringify((await rows('SELECT SCHEMA_NAME AS name, DEFAULT_COLLATION_NAME AS collation FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()'))[0]));
    console.log('tables:', (await rows('SHOW TABLES')).map((r) => Object.values(r)[0]).join(', '));
    console.log('path collation:', JSON.stringify((await rows("SELECT COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'path'"))[0]));
    console.log('transaction mode:', JSON.stringify((await rows("SHOW VARIABLES LIKE 'tidb_txn_mode'"))[0] ?? 'not TiDB'));
    console.log('last version handed out:', (await rows("SELECT value FROM counters WHERE name = 'documents'"))[0]?.value);
    console.table(await rows('SELECT collection, COUNT(*) AS records, SUM(deleted) AS deleted FROM documents GROUP BY collection ORDER BY collection'));
    console.log('accounts:', JSON.stringify((await rows('SELECT COUNT(*) AS total, SUM(email_verified) AS verified, SUM(password_hash IS NOT NULL) AS with_password FROM accounts'))[0]));
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[inspect] failed:', e instanceof Error ? e.message.split('params:')[0] : e);
  process.exit(1);
});
