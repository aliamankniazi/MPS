/**
 * The database the integration tests use. It must be on this PC and its name
 * must end in `_e2e_test`; anything else is refused, so a test can never
 * empty a real database.
 */
import { existsSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { connect, type Db } from '../../src/server/db/client';
import { ensureDatabase, migrateDatabase } from '../../src/server/db/migrate';

if (!process.env.TEST_DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see .env.local)');
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) throw new Error(`tests refuse a database that is not this PC: ${parsed.hostname}`);
  if (!parsed.pathname.endsWith('_e2e_test')) throw new Error('tests refuse a database whose name does not end in _e2e_test');
  return url;
}

let connection: ReturnType<typeof connect> | undefined;

/** A migrated, EMPTY test database. Call in beforeEach. */
export async function freshTestDb(): Promise<Db> {
  const url = testDatabaseUrl();
  if (!connection) {
    await ensureDatabase(url);
    connection = connect(url);
    await migrateDatabase(connection.db);
  }
  const { db } = connection;
  for (const table of ['documents', 'accounts', 'sessions', 'email_tokens', 'applied_ops']) {
    await db.execute(sql.raw(`TRUNCATE TABLE \`${table}\``));
  }
  await db.execute(sql`UPDATE counters SET value = 0 WHERE name = 'documents'`);
  return db;
}

export async function closeTestDb(): Promise<void> {
  await connection?.pool.end();
  connection = undefined;
}
