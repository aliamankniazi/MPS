/**
 * The browser's own copy of the business records.
 *
 * Every screen reads from this copy, so the app opens instantly and keeps
 * working with no internet. A change is applied here first, queued in an
 * "outbox", and sent to the server in the background; other people's changes
 * are fetched every few seconds. This is the job Firestore's offline cache
 * used to do.
 *
 * Two promises this file keeps:
 *   - A change is never thrown away quietly. If the server will not take it,
 *     it is moved to a "failed" list on the device and the person is told.
 *   - Screens are never shown a half-loaded copy. While the copy is being
 *     (re)loaded nothing is announced, because the app treats "record not
 *     there" as "create it with defaults".
 *
 * Runs in the browser only.
 */
import Dexie, { type Table } from 'dexie';
import { applyOp, invalidReason, splitPath, type DocData, type Op } from './apply-op';

type DocRow = { path: string; collection: string; data: DocData };
type OutboxRow = { seq?: number; opId: string; op: Op; account: string };
type FailedRow = { opId: string; op: Op; account: string; reason: string; at: string };
type MetaRow = { key: string; value: number };
type PulledDoc = { p: string; v: number; d: DocData | null };
type PullPage = { epoch: number; head: number; cursor: number; more: boolean; docs: PulledDoc[] };
type PushResult = { opId: string; status: 'applied' | 'duplicate' | 'missing' | 'rejected' | 'exists'; reason?: string };
type PushReply = { results: PushResult[]; truth?: Record<string, DocData | null> };

class LocalDb extends Dexie {
  docs!: Table<DocRow, string>;
  outbox!: Table<OutboxRow, number>;
  failed!: Table<FailedRow, string>;
  meta!: Table<MetaRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ docs: 'path, collection', outbox: '++seq, opId', meta: 'key' });
    this.version(2).stores({ docs: 'path, collection', outbox: '++seq, opId', failed: 'opId', meta: 'key' });
  }
}

export type StoreOptions = {
  /** How often to look for other people's changes. */
  pollMs?: number;
  fetch?: typeof fetch;
  dbName?: string;
};

export type SyncProblem = { title: string; detail: string };

const PUSH_BATCH = 200;
const REQUEST_TIMEOUT_MS = 60_000;
const collectionKey = (path: string) => `c:${path}`;
const docKey = (path: string) => `d:${path}`;
const newCopyId = () => Math.floor(Math.random() * 2 ** 48) + 1;

export class NotFoundError extends Error {
  readonly code = 'not-found';
  constructor(path: string) {
    super(`No record to update at ${path}`);
  }
}

/** Another tab reset the saved copy; this tab must re-read it before writing to it. */
class CopyChanged extends Error {}

export class LocalStore {
  ready = false;

  private readonly collections = new Map<string, Map<string, DocData>>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly problemListeners = new Set<(problem: SyncProblem) => void>();
  /** Paths with changes not yet confirmed by the server -> how many. */
  private readonly pending = new Map<string, number>();
  private outbox: OutboxRow[] = [];
  private readyWaiters: (() => void)[] = [];
  private cursor = 0;
  private epoch = 0;
  /** Identifies this saved copy; changes whenever it is emptied and reloaded. */
  private copyId = 0;
  /** True once everything has been fetched at least once since the copy was last emptied. */
  private complete = false;
  private account = '';
  private running = false;
  private inFlight: Promise<void> | null = null;
  private syncAgain = false;
  private generation = 0;
  private loading: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setInterval> | undefined;
  private db: LocalDb | null = null;
  private readonly pollMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly dbName: string;
  private readonly wake = () => void this.syncNow();
  private readonly warnBeforeLeaving = (event: BeforeUnloadEvent) => {
    // Only when changes exist nowhere but this page's memory.
    if (!this.db && this.outbox.length > 0) event.preventDefault();
  };

  constructor(options: StoreOptions = {}) {
    this.pollMs = options.pollMs ?? 5000;
    this.fetchFn = options.fetch ?? ((...args) => fetch(...args));
    this.dbName = options.dbName ?? 'mps-local';
  }

  /** Begin for the signed-in account: load the saved copy, then keep in step with the server. */
  async start(account: string): Promise<void> {
    if (this.running && this.account === account) return;
    if (this.running) this.stop();
    this.running = true;
    this.account = account;
    const generation = ++this.generation;
    this.loading = this.loadSaved(generation);
    await this.loading;
    if (generation !== this.generation) return; // stopped while loading
    if (this.complete) this.markReady();
    this.timer = setInterval(this.wake, this.pollMs);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.wake);
      window.addEventListener('beforeunload', this.warnBeforeLeaving);
      document.addEventListener('visibilitychange', this.wake);
    }
    await this.syncNow();
  }

  /** Stop (sign-out). The saved copy and any unsent changes stay on the device for that account. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.generation++;
    clearInterval(this.timer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.wake);
      window.removeEventListener('beforeunload', this.warnBeforeLeaving);
      document.removeEventListener('visibilitychange', this.wake);
    }
    this.ready = false;
    this.complete = false;
    this.collections.clear();
    this.pending.clear();
    this.outbox = [];
    this.cursor = 0;
    this.account = '';
    this.db?.close();
    this.db = null;
  }

  whenReady(): Promise<void> {
    return this.ready ? Promise.resolve() : new Promise((resolve) => this.readyWaiters.push(resolve));
  }

  getDoc(path: string): DocData | undefined {
    const parts = splitPath(path);
    return parts ? this.collections.get(parts.collection)?.get(parts.docId) : undefined;
  }

  getCollection(path: string): ReadonlyMap<string, DocData> {
    return this.collections.get(path) ?? new Map();
  }

  subscribe(kind: 'collection' | 'doc', path: string, listener: () => void): () => void {
    const key = kind === 'collection' ? collectionKey(path) : docKey(path);
    let set = this.listeners.get(key);
    if (!set) this.listeners.set(key, (set = new Set()));
    set.add(listener);
    return () => void set.delete(listener);
  }

  /** Be told when a change could not be saved, so the person can be shown. */
  onProblem(listener: (problem: SyncProblem) => void): () => void {
    this.problemListeners.add(listener);
    return () => void this.problemListeners.delete(listener);
  }

  /** Apply changes here and now, remember them for the server, and send them soon. */
  async write(ops: Op[]): Promise<void> {
    if (!this.running) throw new Error('You are signed out. Sign in to save changes.');
    const generation = this.generation;
    await this.loading;
    if (generation !== this.generation) throw new Error('You are signed out. Sign in to save changes.');

    const nowIso = new Date().toISOString();
    // Work everything out first so a failing change leaves nothing half done.
    const next = new Map<string, DocData | null>();
    const accepted: Op[] = [];
    for (const op of ops) {
      const bad = invalidReason(op);
      if (bad) throw new Error(`This change cannot be saved (${bad}).`);
      const before = next.has(op.path) ? next.get(op.path)! : (this.getDoc(op.path) ?? null);
      const result = applyOp(before, op, nowIso);
      if (result.status === 'missing') throw new NotFoundError(op.path);
      if (result.status === 'exists') continue; // "create only" and it is already here: nothing to do
      next.set(op.path, result.data);
      accepted.push(op);
    }
    if (accepted.length === 0) return;

    const rows: OutboxRow[] = accepted.map((op) => ({ opId: op.opId, op, account: this.account }));
    const touched = new Set<string>();
    for (const [path, data] of next) this.setLocal(path, data, touched);
    for (const op of accepted) this.pending.set(op.path, (this.pending.get(op.path) ?? 0) + 1);
    this.outbox.push(...rows);
    this.emit(touched);

    await this.save(async (db) => {
      await db.transaction('rw', db.docs, db.outbox, async () => {
        for (const [path, data] of next) {
          if (data === null) await db.docs.delete(path);
          else await db.docs.put({ path, collection: splitPath(path)!.collection, data });
        }
        // Dexie fills in `seq` on these same objects.
        await db.outbox.bulkAdd(rows);
      });
    });
    setTimeout(this.wake, 0);
  }

  /**
   * Send what is waiting, then fetch what is new. Rounds never overlap: a call
   * made while one is running asks for one more afterwards, and resolves when
   * that one has finished too.
   */
  syncNow(): Promise<void> {
    if (!this.running) return Promise.resolve();
    if (this.inFlight) {
      this.syncAgain = true;
      return this.inFlight;
    }
    this.inFlight = (async () => {
      do {
        this.syncAgain = false;
        await this.round();
      } while (this.syncAgain && this.running);
    })().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Changes the server has not confirmed yet. */
  get unsentCount(): number {
    return this.outbox.length;
  }

  // ----- one round -----

  private async round(): Promise<void> {
    const generation = this.generation;
    const stillCurrent = () => this.running && generation === this.generation;
    try {
      await this.loading;
      if (!stillCurrent()) return;
      if (!(await this.pushOutbox(stillCurrent))) return;
      if (!(await this.pullAll(stillCurrent))) return;
      this.markReady();
    } catch (e) {
      if (e instanceof CopyChanged && stillCurrent()) {
        // Another tab emptied the saved copy. Take up what it has saved.
        this.ready = false;
        await this.loadSaved(generation);
        if (stillCurrent() && this.complete) this.markReady();
        this.syncAgain = true;
      }
      // Otherwise: no internet or the server is busy. The next round tries again.
    }
  }

  /** Returns false when the round should stop here (signed out, or not allowed in yet). */
  private async pushOutbox(stillCurrent: () => boolean): Promise<boolean> {
    let batchSize = PUSH_BATCH;
    while (this.outbox.length > 0) {
      const batch = this.outbox.slice(0, batchSize);
      const res = await this.request('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ops: batch.map((row) => row.op) }),
      });
      if (!stillCurrent()) return false;
      if (res.status === 401 || res.status === 403) return false; // keep everything, try later

      if (res.status === 400 || res.status === 413) {
        // The request as a whole was refused (too big, or one bad change in it).
        // Never drop the lot: send fewer at a time until the one at fault is alone.
        if (batch.length > 1) {
          batchSize = Math.max(1, Math.floor(batch.length / 2));
          continue;
        }
        await this.park(batch[0], `the server refused it (HTTP ${res.status})`);
        await this.forget(batch);
        await this.emptyAndReload();
        batchSize = PUSH_BATCH;
        continue;
      }
      if (!res.ok) throw new Error(`push failed: ${res.status}`);

      const reply = (await res.json()) as PushReply;
      if (!stillCurrent()) return false;
      if (!Array.isArray(reply.results) || reply.results.length !== batch.length) throw new Error('push: unexpected reply');

      for (let i = 0; i < batch.length; i++) {
        const result = reply.results[i];
        if (result.status === 'rejected') await this.park(batch[i], result.reason ?? 'the server refused it');
        if (result.status === 'missing') await this.park(batch[i], 'the record was deleted on another device');
      }
      await this.forget(batch);

      // Where the server did not take a change as sent, show what the server actually holds.
      const touched = new Set<string>();
      const puts: DocRow[] = [];
      const deletes: string[] = [];
      for (const [path, data] of Object.entries(reply.truth ?? {})) {
        if (this.pending.has(path) || !splitPath(path)) continue;
        this.setLocal(path, data, touched);
        if (data === null) deletes.push(path);
        else puts.push({ path, collection: splitPath(path)!.collection, data });
      }
      if (puts.length || deletes.length) {
        await this.save(async (db) => {
          await db.transaction('rw', db.docs, async () => {
            if (puts.length) await db.docs.bulkPut(puts);
            if (deletes.length) await db.docs.bulkDelete(deletes);
          });
        });
      }
      this.emit(touched);
      batchSize = PUSH_BATCH;
    }
    return true;
  }

  private async pullAll(stillCurrent: () => boolean): Promise<boolean> {
    for (;;) {
      const res = await this.request(`/api/sync?since=${this.cursor}`, { cache: 'no-store' });
      if (!stillCurrent()) return false;
      if (res.status === 401 || res.status === 403) return false;
      if (!res.ok) throw new Error(`pull failed: ${res.status}`);
      const page = (await res.json()) as PullPage;
      if (!stillCurrent()) return false;

      // The server's database was rebuilt or restored: what we hold no longer lines up with it.
      const rebuilt = this.epoch !== 0 && page.epoch !== this.epoch;
      const ahead = typeof page.head === 'number' && this.cursor > page.head;
      if (rebuilt || ahead) {
        await this.emptyAndReload();
        this.epoch = page.epoch;
        continue;
      }
      this.epoch = page.epoch;
      await this.applyPulled(page);
      if (!page.more) break;
    }
    if (!this.complete) {
      // A full copy has just finished loading: put this device's unsent changes back on top of it.
      this.complete = true;
      await this.replayOutbox();
      await this.save((db) => db.meta.put({ key: 'complete', value: 1 }).then(() => undefined));
    }
    return true;
  }

  // ----- internals -----

  private request(url: string, init: RequestInit): Promise<Response> {
    const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined;
    return this.fetchFn(url, { credentials: 'same-origin', signal, ...init });
  }

  private async loadSaved(generation: number): Promise<void> {
    let db: LocalDb | null = this.db;
    let docs: DocRow[] = [];
    let outbox: OutboxRow[] = [];
    let meta: MetaRow[] = [];
    try {
      db ??= new LocalDb(this.dbName);
      [docs, outbox, meta] = await Promise.all([db.docs.toArray(), db.outbox.orderBy('seq').toArray(), db.meta.toArray()]);
    } catch (e) {
      // Private browsing, or storage is blocked: carry on in memory for this visit.
      console.warn('[sync] this browser will not keep an offline copy:', e);
      db = null;
    }
    if (generation !== this.generation) {
      if (db !== this.db) db?.close();
      return;
    }
    this.db = db;
    this.collections.clear();
    this.pending.clear();
    for (const row of docs) this.setLocal(row.path, row.data, new Set());
    // Only this account's unsent changes. Someone else's wait on the device until they sign in again.
    this.outbox = outbox.filter((row) => row.account === this.account);
    for (const row of this.outbox) this.pending.set(row.op.path, (this.pending.get(row.op.path) ?? 0) + 1);
    const value = (key: string) => meta.find((m) => m.key === key)?.value ?? 0;
    this.cursor = value('cursor');
    this.epoch = value('epoch');
    this.copyId = value('copyId');
    this.complete = value('complete') === 1;
  }

  private async save(work: (db: LocalDb) => Promise<void>): Promise<void> {
    if (!this.db) return;
    try {
      await work(this.db);
    } catch (e) {
      if (e instanceof CopyChanged || (e as { inner?: unknown })?.inner instanceof CopyChanged) throw new CopyChanged();
      console.warn('[sync] could not save to the offline copy:', e);
    }
  }

  private setLocal(path: string, data: DocData | null, touched: Set<string>): void {
    const parts = splitPath(path);
    if (!parts) return;
    let collection = this.collections.get(parts.collection);
    if (data === null) {
      if (!collection?.delete(parts.docId)) return;
    } else {
      if (!collection) this.collections.set(parts.collection, (collection = new Map()));
      collection.set(parts.docId, data);
    }
    touched.add(collectionKey(parts.collection));
    touched.add(docKey(path));
  }

  private emit(keys: Iterable<string>): void {
    if (!this.ready) return;
    for (const key of keys) for (const listener of [...(this.listeners.get(key) ?? [])]) listener();
  }

  private markReady(): void {
    if (this.ready || !this.complete) return;
    this.ready = true;
    for (const resolve of this.readyWaiters.splice(0)) resolve();
    this.emit([...this.listeners.keys()]);
  }

  private report(problem: SyncProblem): void {
    console.error(`[sync] ${problem.title}: ${problem.detail}`);
    for (const listener of [...this.problemListeners]) listener(problem);
  }

  /** Keeps a change the server would not take, on the device, and tells the person. */
  private async park(row: OutboxRow, reason: string): Promise<void> {
    const failed: FailedRow = { opId: row.opId, op: row.op, account: row.account, reason, at: new Date().toISOString() };
    await this.save((db) => db.failed.put(failed).then(() => undefined));
    this.report({ title: 'A change was not saved', detail: `${row.op.path.split('/')[0]}: ${reason}. The screen now shows what is actually saved.` });
  }

  private async forget(batch: OutboxRow[]): Promise<void> {
    const ids = new Set(batch.map((row) => row.opId));
    this.outbox = this.outbox.filter((row) => !ids.has(row.opId));
    for (const row of batch) {
      const left = (this.pending.get(row.op.path) ?? 1) - 1;
      if (left <= 0) this.pending.delete(row.op.path);
      else this.pending.set(row.op.path, left);
    }
    await this.save((db) => db.outbox.where('opId').anyOf([...ids]).delete().then(() => undefined));
  }

  /**
   * Empties the copy so the next fetch starts from nothing. Screens are told
   * nothing until the full copy is back (see markReady): the app would
   * otherwise mistake the empty moment for "no settings yet" and save defaults.
   */
  private async emptyAndReload(): Promise<void> {
    this.ready = false;
    this.complete = false;
    this.collections.clear();
    this.cursor = 0;
    this.copyId = newCopyId();
    const copyId = this.copyId;
    await this.save(async (db) => {
      await db.transaction('rw', db.docs, db.meta, async () => {
        await db.docs.clear();
        await db.meta.bulkPut([
          { key: 'cursor', value: 0 },
          { key: 'complete', value: 0 },
          { key: 'copyId', value: copyId },
        ]);
      });
    });
  }

  /** Re-applies this device's unsent changes on top of a freshly loaded copy. */
  private async replayOutbox(): Promise<void> {
    if (this.outbox.length === 0) return;
    const nowIso = new Date().toISOString();
    const changed = new Map<string, DocData | null>();
    for (const row of this.outbox) {
      const before = changed.has(row.op.path) ? changed.get(row.op.path)! : (this.getDoc(row.op.path) ?? null);
      const result = applyOp(before, row.op, nowIso);
      if (result.status === 'applied') changed.set(row.op.path, result.data);
    }
    for (const [path, data] of changed) this.setLocal(path, data, new Set());
    await this.save(async (db) => {
      await db.transaction('rw', db.docs, async () => {
        for (const [path, data] of changed) {
          if (data === null) await db.docs.delete(path);
          else await db.docs.put({ path, collection: splitPath(path)!.collection, data });
        }
      });
    });
  }

  private async applyPulled(page: PullPage): Promise<void> {
    const touched = new Set<string>();
    const puts: DocRow[] = [];
    const deletes: string[] = [];
    const staged: [string, DocData | null][] = [];
    for (const doc of page.docs) {
      // Our own unsent change to this record is newer than what the server has.
      if (this.pending.has(doc.p)) continue;
      const parts = splitPath(doc.p);
      if (!parts) continue;
      staged.push([doc.p, doc.d]);
      if (doc.d === null) deletes.push(doc.p);
      else puts.push({ path: doc.p, collection: parts.collection, data: doc.d });
    }
    if (this.copyId === 0) this.copyId = newCopyId();
    const copyId = this.copyId;

    // Saved first, and only if the saved copy is still the one this tab loaded:
    // otherwise this tab would stamp its position onto a copy another tab emptied.
    await this.save(async (db) => {
      await db.transaction('rw', db.docs, db.meta, async () => {
        const saved = await db.meta.get('copyId');
        if (saved && saved.value !== copyId) throw new CopyChanged();
        if (puts.length) await db.docs.bulkPut(puts);
        if (deletes.length) await db.docs.bulkDelete(deletes);
        await db.meta.bulkPut([
          { key: 'cursor', value: page.cursor },
          { key: 'epoch', value: page.epoch },
          { key: 'copyId', value: copyId },
        ]);
      });
    });
    for (const [path, data] of staged) this.setLocal(path, data, touched);
    this.cursor = page.cursor;
    this.emit(touched);
  }
}
