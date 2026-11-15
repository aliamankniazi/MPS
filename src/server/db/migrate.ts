/**
 * Brings a database up to the current schema.
 *
 * The collation is set on the database itself first, so every table inherits
 * it. Firestore ids are case-sensitive; MySQL's default collation is not, and
 * under it 'customers/Abc' and 'customers/abc' would be the SAME row, so
 * importing the second would silently overwrite the first. `utf8mb4_0900_bin`
 * compares bytes, as Firestore does.
 */
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';
import { connectionOptions, isSystemDatabase, type Db } from './client';

export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'src/server/db/migrations');
export const COLLATION = 'utf8mb4_0900_bin';

const quoted = (name: string) => `\`${name.replace(/`/g, '')}\``;

/** Creates the database `url` names if it is not there yet, with the right collation from the start. */
export async function ensureDatabase(url: string): Promise<void> {
  const options = connectionOptions(url);
  const name = options.database;
  if (!name || isSystemDatabase(name)) throw new Error(`refusing to use the server's own database "${name ?? ''}"; name a database of the app's own`);
  const admin = await mysql.createConnection({ ...options, database: undefined });
  try {
    await admin.query(`CREATE DATABASE IF NOT EXISTS ${quoted(name)} CHARACTER SET utf8mb4 COLLATE ${COLLATION}`);
  } finally {
    await admin.end();
  }
}

export async function migrateDatabase(db: Db): Promise<void> {
  const [rows] = (await db.execute(
    sql`SELECT SCHEMA_NAME AS name, DEFAULT_COLLATION_NAME AS collation FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()`,
  )) as unknown as [{ name: string; collation: string }[]];
  const current = rows[0];
  if (!current) throw new Error('the connection URL must name a database');
  if (isSystemDatabase(current.name)) throw new Error(`refusing to put the app's tables in the server's own database "${current.name}"`);
  if (current.collation !== COLLATION) {
    await db.execute(sql.raw(`ALTER DATABASE ${quoted(current.name)} CHARACTER SET utf8mb4 COLLATE ${COLLATION}`));
  }
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  // The two named numbers every database needs. Existing values are left alone.
  await db.execute(sql`INSERT IGNORE INTO counters (name, value) VALUES ('documents', 0)`);
  await db.execute(sql`INSERT IGNORE INTO counters (name, value) VALUES ('epoch', ${Date.now()})`);
}
