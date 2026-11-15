/**
 * Loads a backup of the old Firebase project into the new database.
 *
 * The rules, in order of importance:
 *   1. Every record goes in under its original path, unchanged.
 *   2. A record already in the database is never altered. If it differs from
 *      the backup the run stops, unless told to keep what is there.
 *   3. Running it twice adds nothing the second time.
 *   4. Afterwards every record is read back and compared with the backup.
 */
import { eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { accounts, documents } from '../db/schema';
import { lockDocuments, writeChanges } from '../sync/documents';
import { splitPath, type DocData } from '../../data/apply-op';
import { canonical, decodeValue, readExportFile, readManifest, totals, type ExportedRecord, type ExportedUser, type Manifest } from './export-format';

const CHUNK = 500;

export type ImportPlan = {
  manifest: Manifest;
  records: ExportedRecord[];
  users: ExportedUser[];
  /** Per collection. */
  summary: Record<string, { inBackup: number; toAdd: number; identical: number; different: number }>;
  toAdd: ExportedRecord[];
  different: string[];
  notNumbers: number;
  unsupported: number;
  badPaths: string[];
};

async function existing(db: Db, paths: string[]): Promise<Map<string, { dataRaw: string; deleted: boolean }>> {
  const found = new Map<string, { dataRaw: string; deleted: boolean }>();
  for (let i = 0; i < paths.length; i += CHUNK) {
    const rows = await db
      .select({ path: documents.path, dataRaw: documents.dataRaw, deleted: documents.deleted })
      .from(documents)
      .where(inArray(documents.path, paths.slice(i, i + CHUNK)));
    for (const row of rows) found.set(row.path, row);
  }
  return found;
}

/** Reads the backup and works out what loading it would do. Writes nothing. */
export async function planImport(db: Db, dir: string): Promise<ImportPlan> {
  const manifest = readManifest(dir);
  const counts = { notNumbers: 0, unsupported: 0 };
  const records: ExportedRecord[] = [];
  const badPaths: string[] = [];
  for (const file of Object.keys(manifest.files).filter((f) => f !== 'users.ndjson')) {
    for (const row of readExportFile<ExportedRecord>(dir, manifest, file)) {
      if (!splitPath(row.path)) badPaths.push(row.path);
      else records.push({ path: row.path, data: decodeValue(row.data, counts) as DocData });
    }
  }
  const users = manifest.files['users.ndjson'] ? readExportFile<ExportedUser>(dir, manifest, 'users.ndjson') : [];

  const inDb = await existing(db, records.map((r) => r.path));
  const plan: ImportPlan = { manifest, records, users, summary: {}, toAdd: [], different: [], badPaths, ...counts };
  for (const record of records) {
    const collection = splitPath(record.path)!.collection;
    const entry = (plan.summary[collection] ??= { inBackup: 0, toAdd: 0, identical: 0, different: 0 });
    entry.inBackup++;
    const row = inDb.get(record.path);
    if (!row) {
      entry.toAdd++;
      plan.toAdd.push(record);
    } else if (!row.deleted && canonical(JSON.parse(row.dataRaw)) === canonical(record.data)) {
      entry.identical++;
    } else {
      entry.different++;
      plan.different.push(record.path);
    }
  }
  return plan;
}

export type ImportOutcome = {
  added: number;
  accountsAdded: number;
  verified: number;
  /** Emails in the backup that already belong to a DIFFERENT account here. Their old role record has no owner: an admin must sort these out by hand. */
  emailClashes: string[];
};

/**
 * Carries out a plan. `keepExisting` = where the database already holds a
 * different version of a record, leave the database's version alone.
 */
export async function applyImport(db: Db, plan: ImportPlan, options: { keepExisting?: boolean } = {}): Promise<ImportOutcome> {
  if (plan.badPaths.length) throw new Error(`the backup holds ${plan.badPaths.length} record(s) with a path the app cannot store, e.g. ${plan.badPaths[0]}`);
  if (plan.unsupported) throw new Error(`the backup holds ${plan.unsupported} value(s) of a kind the app never used (see the manifest warnings); stopping rather than dropping them`);
  if (plan.different.length && !options.keepExisting) {
    throw new Error(`${plan.different.length} record(s) already in the database differ from the backup, e.g. ${plan.different[0]}. Nothing was written. Re-run with --keep-existing to leave those as they are.`);
  }

  for (let i = 0; i < plan.toAdd.length; i += CHUNK) {
    const part = plan.toAdd.slice(i, i + CHUNK);
    await db.transaction(async (tx) => {
      await lockDocuments(tx);
      // Someone may have created one of these since the plan was made: never overwrite.
      const now = await tx.select({ path: documents.path }).from(documents).where(inArray(documents.path, part.map((r) => r.path))).for('update');
      const taken = new Set(now.map((r) => r.path));
      await writeChanges(tx, part.filter((r) => !taken.has(r.path)).map((r) => ({ path: r.path, data: r.data })));
    });
  }

  let accountsAdded = 0;
  const emailClashes: string[] = [];
  for (const user of plan.users) {
    const email = user.email?.trim().toLowerCase();
    if (!email || user.disabled) continue;
    const [holder] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, email)).limit(1);
    if (holder && holder.id !== user.uid) {
      emailClashes.push(email);
      continue;
    }
    // No password is moved; the person sets one with "Forgot password".
    const [result] = await db.execute(
      sql`INSERT IGNORE INTO accounts (id, email, password_hash, email_verified, failed_sign_ins, created_at) VALUES (${user.uid}, ${email}, NULL, ${user.emailVerified}, 0, ${new Date()})`,
    );
    accountsAdded += (result as unknown as { affectedRows: number }).affectedRows;
  }

  // Read everything back and compare with the backup.
  const after = await existing(db, plan.records.map((r) => r.path));
  const skip = new Set(options.keepExisting ? plan.different : []);
  let verified = 0;
  for (const record of plan.records) {
    if (skip.has(record.path)) continue;
    const row = after.get(record.path);
    if (!row || row.deleted || canonical(JSON.parse(row.dataRaw)) !== canonical(record.data)) {
      throw new Error(`verification failed: ${record.path} in the database does not match the backup`);
    }
    verified++;
  }
  return { added: plan.toAdd.length, accountsAdded, verified, emailClashes };
}

/** Totals of what the database now holds for the backup's records, for comparing with totals(plan.records). */
export async function databaseTotals(db: Db, plan: ImportPlan) {
  const rows = await existing(db, plan.records.map((r) => r.path));
  return totals([...rows].filter(([, row]) => !row.deleted).map(([path, row]) => ({ path, data: JSON.parse(row.dataRaw) as DocData })));
}

export async function accountCount(db: Db): Promise<number> {
  const [{ total }] = await db.select({ total: sql<number>`COUNT(*)` }).from(accounts);
  return Number(total);
}
