/**
 * The whole database. Business records keep the shape they had in Firestore:
 * one row per document, keyed by its original path ('transactions/abc'), with
 * the document stored as the exact JSON text the app reads and writes. Nothing
 * is reshaped, so every total the screens calculate comes out the same.
 */
import { bigint, boolean, datetime, index, int, longtext, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';

const at = (name: string) => datetime(name, { mode: 'date', fsp: 3 });

/** Every business record. */
export const documents = mysqlTable(
  'documents',
  {
    /** 'customers/abc' — unchanged from Firestore. */
    path: varchar('path', { length: 512 }).primaryKey(),
    /** 'customers' — the path without its last part. */
    collection: varchar('collection', { length: 384 }).notNull(),
    docId: varchar('doc_id', { length: 255 }).notNull(),
    /** The document as JSON text. Money is always read from here, never recalculated. */
    dataRaw: longtext('data_raw').notNull(),
    /** Position in the change history; a device asks for "everything after N". */
    version: bigint('version', { mode: 'number', unsigned: true }).notNull(),
    /** A deleted record stays as an empty marker so other devices learn it is gone. */
    deleted: boolean('deleted').notNull().default(false),
    updatedAt: at('updated_at').notNull(),
  },
  (t) => [index('documents_pull').on(t.version), index('documents_collection').on(t.collection)],
);

/**
 * Named numbers. 'documents' is the last version handed out; 'epoch' changes
 * only if the database is rebuilt, telling every device to load afresh.
 */
export const counters = mysqlTable('counters', {
  name: varchar('name', { length: 64 }).primaryKey(),
  value: bigint('value', { mode: 'number', unsigned: true }).notNull(),
});

/** Who may sign in. Passwords are stored only as salted hashes and never leave the server. */
export const accounts = mysqlTable(
  'accounts',
  {
    /** Also the id of the person's 'userRoles/<id>' record. Migrated people keep their Firebase id. */
    id: varchar('id', { length: 64 }).primaryKey(),
    /** Always lower case. */
    email: varchar('email', { length: 320 }).notNull(),
    /** Empty for a migrated person who has not set a password yet. */
    passwordHash: varchar('password_hash', { length: 255 }),
    emailVerified: boolean('email_verified').notNull().default(false),
    failedSignIns: int('failed_sign_ins').notNull().default(0),
    lockedUntil: at('locked_until'),
    createdAt: at('created_at').notNull(),
  },
  (t) => [uniqueIndex('accounts_email').on(t.email)],
);

/** Signed-in browsers. Only the SHA-256 of the cookie value is stored. */
export const sessions = mysqlTable(
  'sessions',
  {
    tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
    accountId: varchar('account_id', { length: 64 }).notNull(),
    expiresAt: at('expires_at').notNull(),
    createdAt: at('created_at').notNull(),
  },
  (t) => [index('sessions_account').on(t.accountId)],
);

/** One-time links sent by email: 'verify' an address or 'reset' a password. */
export const emailTokens = mysqlTable('email_tokens', {
  tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
  accountId: varchar('account_id', { length: 64 }).notNull(),
  purpose: varchar('purpose', { length: 16 }).notNull(),
  expiresAt: at('expires_at').notNull(),
  usedAt: at('used_at'),
});

/** Changes already applied, so a change sent twice (a retry on a bad connection) counts once. */
export const appliedOps = mysqlTable('applied_ops', {
  opId: varchar('op_id', { length: 64 }).primaryKey(),
  createdAt: at('created_at').notNull(),
});
