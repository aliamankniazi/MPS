/**
 * The two things a device does with the server: PUSH its changes, PULL
 * everyone else's.
 *
 * Every saved change gets the next number in one shared sequence ("version").
 * A device remembers the last number it has seen and asks for everything
 * after it. All writers queue on one database lock, so numbers are handed out
 * in the same order changes become visible: a device can never skip one.
 *
 * Inside a write, every read is a LOCKING read (`FOR UPDATE`). On TiDB an
 * ordinary read sees the database as it was when the transaction began, which
 * is BEFORE it waited for the lock; a locking read sees what the writer ahead
 * of it just saved. Without this, two people saving the same record a moment
 * apart could silently lose one of the two changes.
 */
import { asc, gt, inArray, sql } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { appliedOps, counters, documents } from '../db/schema';
import { withRetry } from '../db/retry';
import { applyOp, invalidReason, splitPath, type DocData, type Op } from '../../data/apply-op';
import { canWrite, type Actor } from '../access/policy';

const CHUNK = 200;
/** Firestore's own limit for one record is 1 MB; stay inside it. */
const MAX_DOC_BYTES = 900_000;
export const MAX_OPS_PER_PUSH = 500;

const chunks = <T>(items: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Takes the single write lock. Held until the transaction ends. Returns the last version handed out. */
export async function lockDocuments(tx: Tx): Promise<number> {
  const [rows] = (await tx.execute(sql`SELECT value FROM counters WHERE name = 'documents' FOR UPDATE`)) as unknown as [{ value: number | string }[]];
  if (!rows[0]) throw new Error("the 'documents' counter is missing; run the database migration");
  return Number(rows[0].value);
}

export type Change = { path: string; data: DocData | null };

/** Saves records (data: null = deleted), giving each the next version. The caller must hold the lock. */
export async function writeChanges(tx: Tx, changes: Change[], now = new Date()): Promise<void> {
  if (changes.length === 0) return;
  let version = await lockDocuments(tx);
  await tx.update(counters).set({ value: version + changes.length }).where(sql`name = 'documents'`);
  const rows = changes.map((c) => {
    const parts = splitPath(c.path);
    if (!parts) throw new Error(`not a record path: ${c.path}`);
    return {
      path: c.path,
      collection: parts.collection,
      docId: parts.docId,
      dataRaw: c.data === null ? '{}' : JSON.stringify(c.data),
      version: ++version,
      deleted: c.data === null,
      updatedAt: now,
    };
  });
  for (const part of chunks(rows)) {
    await tx
      .insert(documents)
      .values(part)
      .onDuplicateKeyUpdate({
        set: {
          dataRaw: sql`VALUES(data_raw)`,
          version: sql`VALUES(version)`,
          deleted: sql`VALUES(deleted)`,
          updatedAt: sql`VALUES(updated_at)`,
        },
      });
  }
}

/**
 * Current records at `paths`; a missing or deleted one is absent from the map.
 * `locking` must be true inside a write (see the note at the top of the file).
 */
export async function readDocs(tx: Tx | Db, paths: string[], locking = false): Promise<Map<string, DocData>> {
  const found = new Map<string, DocData>();
  for (const part of chunks([...new Set(paths)])) {
    const query = tx
      .select({ path: documents.path, dataRaw: documents.dataRaw, deleted: documents.deleted })
      .from(documents)
      .where(inArray(documents.path, part));
    const rows = locking ? await query.for('update') : await query;
    for (const row of rows) if (!row.deleted) found.set(row.path, JSON.parse(row.dataRaw) as DocData);
  }
  return found;
}

export type OpResult = { opId: string; status: 'applied' | 'duplicate' | 'missing' | 'rejected' | 'exists'; reason?: string };

export type PushOutcome = {
  results: OpResult[];
  /**
   * For every record where a change was NOT taken as sent, what the server
   * holds now (null = no such record), so the device can show the truth.
   */
  truth: Record<string, DocData | null>;
};

/**
 * Applies a device's changes, in order, all or nothing.
 *   applied    saved
 *   duplicate  already saved earlier (the device retried after a dropped connection)
 *   exists     a "create only" change for a record that already exists: the existing one is kept
 *   missing    an edit to a record that no longer exists
 *   rejected   not allowed, malformed, or too large
 */
export async function pushChanges(db: Db, actor: Actor, rawOps: unknown[], now = new Date()): Promise<PushOutcome> {
  if (rawOps.length > MAX_OPS_PER_PUSH) throw new Error(`too many changes in one request (max ${MAX_OPS_PER_PUSH})`);
  const nowIso = now.toISOString();
  const ownRolePath = `userRoles/${actor.accountId}`;

  return withRetry(() =>
    db.transaction(async (tx) => {
      await lockDocuments(tx);
      const results: OpResult[] = new Array(rawOps.length);
      const accepted: { index: number; op: Op }[] = [];
      const truthPaths = new Set<string>();

      rawOps.forEach((raw, index) => {
        const opId = typeof (raw as { opId?: unknown })?.opId === 'string' ? (raw as { opId: string }).opId : '';
        const reason = invalidReason(raw);
        if (reason) return void (results[index] = { opId, status: 'rejected', reason });
        const op = raw as Op;
        const refuse = (why: string) => {
          truthPaths.add(op.path);
          results[index] = { opId, status: 'rejected', reason: why };
        };
        if (!canWrite(actor, splitPath(op.path)!.root)) return refuse('not allowed');
        // Nobody removes or changes their own role: an admin cannot lock the business out by accident.
        if (op.path === ownRolePath) return refuse('you cannot change your own role');
        accepted.push({ index, op });
      });

      const seen = new Set<string>();
      for (const part of chunks(accepted.map((a) => a.op.opId))) {
        const rows = await tx.select({ opId: appliedOps.opId }).from(appliedOps).where(inArray(appliedOps.opId, part)).for('update');
        for (const row of rows) seen.add(row.opId);
      }

      const state = new Map<string, DocData | null>(await readDocs(tx, accepted.map((a) => a.op.path), true));
      const changed = new Set<string>();
      const appliedIds: string[] = [];

      for (const { index, op } of accepted) {
        if (seen.has(op.opId)) {
          results[index] = { opId: op.opId, status: 'duplicate' };
          continue;
        }
        seen.add(op.opId);
        const before = state.get(op.path) ?? null;
        const result = applyOp(before, op, nowIso);
        if (result.status !== 'applied') {
          truthPaths.add(op.path);
          results[index] = { opId: op.opId, status: result.status };
          continue;
        }
        if (result.data !== null && Buffer.byteLength(JSON.stringify(result.data)) > MAX_DOC_BYTES) {
          truthPaths.add(op.path);
          results[index] = { opId: op.opId, status: 'rejected', reason: 'record too large' };
          continue;
        }
        // Deleting something that is not there changes nothing.
        if (!(result.data === null && before === null)) {
          state.set(op.path, result.data);
          changed.add(op.path);
        }
        appliedIds.push(op.opId);
        results[index] = { opId: op.opId, status: 'applied' };
      }

      await writeChanges(tx, [...changed].map((path) => ({ path, data: state.get(path) ?? null })), now);
      for (const part of chunks(appliedIds)) {
        await tx.insert(appliedOps).values(part.map((opId) => ({ opId, createdAt: now }))).onDuplicateKeyUpdate({ set: { opId: sql`op_id` } });
      }

      const unread = [...truthPaths].filter((path) => !state.has(path));
      const extra = await readDocs(tx, unread, true);
      const truth: Record<string, DocData | null> = {};
      for (const path of truthPaths) truth[path] = state.get(path) ?? extra.get(path) ?? null;
      return { results, truth };
    }),
  );
}

/** As pushChanges, returning only the per-change results. */
export async function pushOps(db: Db, actor: Actor, rawOps: unknown[], now = new Date()): Promise<OpResult[]> {
  return (await pushChanges(db, actor, rawOps, now)).results;
}

export type Pull = {
  epoch: number;
  /** The last version the server has handed out. A device further along than this holds a copy from a different database. */
  head: number;
  cursor: number;
  more: boolean;
  docs: { path: string; version: number; dataRaw: string | null }[];
};

/**
 * Everything saved after `since`, oldest first, in pages small enough for one
 * response. `more` says to ask again from `cursor`. A deleted record arrives
 * with `dataRaw: null`.
 */
export async function pullChanges(db: Db, since: number, limit = 5000, maxBytes = 3_000_000): Promise<Pull> {
  const named = await db.select({ name: counters.name, value: counters.value }).from(counters);
  const counter = (name: string) => Number(named.find((row) => row.name === name)?.value ?? 0);
  const rows = await db
    .select({ path: documents.path, dataRaw: documents.dataRaw, version: documents.version, deleted: documents.deleted })
    .from(documents)
    .where(gt(documents.version, since))
    .orderBy(asc(documents.version))
    .limit(limit + 1);

  const docs: Pull['docs'] = [];
  let bytes = 0;
  for (const row of rows.slice(0, limit)) {
    // Real bytes, not characters: Urdu text takes two or three bytes a letter.
    bytes += Buffer.byteLength(row.dataRaw) + Buffer.byteLength(row.path) + 32;
    if (docs.length > 0 && bytes > maxBytes) break;
    docs.push({ path: row.path, version: Number(row.version), dataRaw: row.deleted ? null : row.dataRaw });
  }
  return {
    epoch: counter('epoch'),
    // Read before the rows, so it can only be behind them, never ahead.
    head: Math.max(counter('documents'), docs.length ? docs[docs.length - 1].version : 0),
    cursor: docs.length ? docs[docs.length - 1].version : since,
    more: docs.length < rows.length,
    docs,
  };
}

/** The pull as JSON text. Records are spliced in exactly as stored: no parse-and-reprint that could alter a number. */
export function pullToJson(pull: Pull): string {
  const docs = pull.docs.map((d) => `{"p":${JSON.stringify(d.path)},"v":${d.version},"d":${d.dataRaw ?? 'null'}}`);
  return `{"epoch":${pull.epoch},"head":${pull.head},"cursor":${pull.cursor},"more":${pull.more},"docs":[${docs.join(',')}]}`;
}
