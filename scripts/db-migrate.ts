/**
 * Bring the database named by the environment up to the current schema.
 * Run by the Vercel build before `next build`, so every deploy finds its
 * tables in place; safe to run again (applied migrations are skipped).
 *
 * With no database configured it says so and stops without failing the build.
 * On this PC it refuses a non-local database unless the command names it:
 *   npm run db:migrate -- --allow-remote <host>
 */
import { connect, databaseUrl } from '../src/server/db/client';
import { ensureDatabase, migrateDatabase } from '../src/server/db/migrate';
import { argValue, checkTarget } from '../src/server/db/remote-guard';

async function main() {
  const url = databaseUrl();
  if (!url) {
    console.log('[db-migrate] no database configured; skipping');
    return;
  }
  // On Vercel the deploy itself is the owner's go-ahead for that project's database.
  const { host } = process.env.VERCEL ? { host: new URL(url).hostname } : checkTarget(url, argValue(process.argv, '--allow-remote'));
  await ensureDatabase(url);
  const { db, pool } = connect(url);
  try {
    await migrateDatabase(db);
    console.log(`[db-migrate] schema is up to date on ${host}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[db-migrate] failed:', e instanceof Error ? e.message.split('params:')[0] : e);
  process.exit(1);
});
