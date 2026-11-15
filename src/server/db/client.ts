/**
 * The connection pool. The address comes from the environment only, never
 * from a committed file:
 *
 *   DATABASE_URL                     mysql://user:pass@host:port/db, or
 *   TIDB_HOST / TIDB_PORT / TIDB_USER / TIDB_PASSWORD / TIDB_DATABASE
 *                                    as the TiDB Cloud Vercel integration sets them.
 *
 * Any database that is not on this machine is reached over TLS with the
 * server's certificate checked.
 */
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';

export type Db = MySql2Database<typeof schema>;
/** What a transaction callback receives; services take this so they can join one. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export const LOCAL_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export const DEFAULT_DATABASE = 'mps';

/** The server's own databases; the app's tables must never be put in one. */
const SYSTEM_DATABASES = new Set(['', 'sys', 'mysql', 'test', 'information_schema', 'performance_schema', 'metrics_schema']);

export function isSystemDatabase(name: string | null | undefined): boolean {
  return SYSTEM_DATABASES.has((name ?? '').toLowerCase());
}

/** The database address from the environment, in either of the two forms above. */
export function databaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.TIDB_HOST && env.TIDB_USER) {
    const u = new URL('mysql://placeholder');
    u.hostname = env.TIDB_HOST;
    u.port = env.TIDB_PORT ?? '4000';
    u.username = encodeURIComponent(env.TIDB_USER);
    u.password = encodeURIComponent(env.TIDB_PASSWORD ?? '');
    u.pathname = `/${isSystemDatabase(env.TIDB_DATABASE) ? DEFAULT_DATABASE : env.TIDB_DATABASE}`;
    return u.toString();
  }
  return undefined;
}

/** How to reach the database at `url`: TLS for anything not on this machine. */
export function connectionOptions(url: string): mysql.ConnectionOptions {
  const u = new URL(url);
  const remote = !LOCAL_HOSTS.has(u.hostname);
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, '') || undefined,
    ssl: remote ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
    // Dates are written and read as UTC.
    timezone: 'Z',
    supportBigNumbers: true,
    // Keeps an idle connection from being silently cut on a long network path.
    enableKeepAlive: true,
    keepAliveInitialDelay: 30_000,
  };
}

export function connect(url: string | undefined = databaseUrl()): { db: Db; pool: mysql.Pool } {
  if (!url) throw new Error('DATABASE_URL (or the TIDB_* settings) is not set');
  const pool = mysql.createPool({
    ...connectionOptions(url),
    // On Vercel each running copy of the app has its own pool; a small one
    // keeps many copies from exhausting the database's connection limit.
    connectionLimit: process.env.VERCEL ? 3 : 10,
  });
  return { db: drizzle(pool, { schema, mode: 'default' }), pool };
}
