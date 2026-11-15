/**
 * The browser's own copy of the business records.
 *
 * Every screen reads from this copy, so the app opens instantly and keeps
 * working with no internet. A change is applied here first, queued in an
 * "outbox", and sent to the server in the background; other people's changes
 * are fetched every few seconds. This is the job Firestore's offline cache
 * used to do.
 *
 * Runs in the browser only.
 */
import Dexie, { type Table } from 'dexie';
import { applyOp, splitPath, type DocData, type Op } from './apply-op';

type DocRow = { path: string; collection: string; data: DocData };
type OutboxRow = { seq?: number; opId: string; op: Op };
type MetaRow = { key: string; value: number };
type PulledDoc = { p: string; v: number; d: DocData | null };
type PullPage = { epoch: number; cursor: number; more: boolean; docs: PulledDoc[] };
type PushResult = { opId: string; status: 'applied' | 'duplicate' | 'missing' | 'rejected'; reason?: string };

class LocalDb extends Dexie {
  docs!: Table<DocRow, string>;
  outbox!: Table<OutboxRow, number>;
  meta!: Table<MetaRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ docs: 'path, collection', outbox: '++seq, opId', meta: 'key' });
  }
}

export type StoreOptions = {
  /** How often to look for other people's changes. */
  pollMs?: number;
  fetch?: typeof fetch;
  dbName?: string;
};

const PUSH_BATCH = 200;
const collectionKey = (path: string) => `c:${path}`;
const docKey = (path: string) => `d:${path}`;

export class NotFoundError extends Error {
  readonly code = 'not-found';
  constructor(path: string) {
    super(`No record to update at ${path}`);
  }
}

export class LocalStore {
  ready = false;

  private readonly collections = new Map<string, Map<string, DocData>>();
  private readonly listeners = new Map<string, Set<() => void>>();
  /** Paths with changes not yet confirmed by the server -> how many. */
  private readonly pending = new Map<string, number>();
  private outbox: OutboxRow[] = [];
  private readyWaiters: (() => void)[] = [];
  private cursor = 0;
  private epoch = 0;
  private running = false;
  private inFlight: Promise<void> | null = null;
  private syncAgain = false;
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private db: LocalDb | null = null;
  private readonly pollMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly dbName: string;
  private readonly wake = () => void this.syncNow();

  constructor(options: StoreOptions = {}) {
    this.pollMs = options.pollMs ?? 5000;
    this.fetchFn = options.fetch ?? ((...args) => fetch(...args));
    this.dbName = options.dbName ?? 'mps-local';
  }

  /** Begin: load the saved copy, then keep in step with the server. Safe to call twice. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const generation = ++this.generation;
    await this.loadSaved();
    if (generation !== this.generation) return; // stopped while loading
    if (this.cursor > 0) this.markReady();
    this.timer = setInterval(this.wake, this.pollMs);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.wake);
      document.addEventListener('visibilitychange', this.wake);
    }
    await this.syncNow();
  }

  /** Stop (sign-out). The saved copy and any unsent changes stay on the device. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.generation++;
    clearInterval(this.timer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.wake);
      document.removeEventListener('visibilitychange', this.wake);
    }
    this.ready = false;
    this.collections.clear();
    this.pending.clear();
    this.outbox = [];
    this.cursor = 0;
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

  /** `key` from collectionKey()/docKey(). Returns the unsubscribe function. */
  subscribe(kind: 'collection' | 'doc', path: string, listener: () => void): () => void {
    const key = kind === 'collection' ? collectionKey(path) : docKey(path);
    let set = this.listeners.get(key);
    if (!set) this.listeners.set(key, (set = new Set()));
    set.add(listener);
    return () => void set.delete(listener);
  }

  /** Apply changes here and now, remember them for the server, and send them soon. */
  async write(ops: Op[]): Promise<void> {
    const nowIso = new Date().toISOString();
    // Work everything out first so a failing change leaves nothing half done.
    const next = new Map<string, DocData | null>();
    for (const op of ops) {
      const before = next.has(op.path) ? next.get(op.path)! : (this.getDoc(op.path) ?? null);
      const result = applyOp(before, op, nowIso);
      if (result.status === 'missing') throw new NotFoundError(op.path);
      next.set(op.path, result.data);
    }

    const rows: OutboxRow[] = ops.map((op) => ({ opId: op.opId, op }));
    const touched = new Set<string>();
    for (const [path, data] of next) this.setLocal(path, data, touched);
    for (const op of ops) this.pending.set(op.path, (this.pending.get(op.path) ?? 0) + 1);
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

  private async round(): Promise<void> {
    const generation = this.generation;
    const stillCurrent = () => this.running && generation === this.generation;
    try {
      let reload = false;

      while (this.outbox.length > 0) {
        const batch = this.outbox.slice(0, PUSH_BATCH);
        const res = await this.fetchFn('/api/sync', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ops: batch.map((row) => row.op) }),
        });
        if (!stillCurrent()) return;
        if (res.status === 401 || res.status === 403) return; // not allowed in (yet): keep everything, try later
        const refused = res.status === 400 || res.status === 413;
        if (!res.ok && !refused) throw new Error(`push failed: ${res.status}`);
        if (refused) {
          console.error('[sync] the server refused a batch of changes; reloading from the server');
          reload = true;
        } else {
          const { results } = (await res.json()) as { results: PushResult[] };
          const bad = results.filter((r) => r.status === 'rejected' || r.status === 'missing');
          if (bad.length > 0) {
            console.error('[sync] changes not accepted by the server:', bad);
            reload = true;
          }
        }
        await this.forget(batch);
        if (!stillCurrent()) return;
      }

      if (reload) await this.resetLocal();

      for (;;) {
        const res = await this.fetchFn(`/api/sync?since=${this.cursor}`, { credentials: 'same-origin', cache: 'no-store' });
        if (!stillCurrent()) return;
        if (res.status === 401 || res.status === 403) return;
        if (!res.ok) throw new Error(`pull failed: ${res.status}`);
        const page = (await res.json()) as PullPage;
        if (!stillCurrent()) return;
        if (this.epoch !== 0 && page.epoch !== this.epoch) {
          // The server's database was rebuilt: what we hold no longer lines up.
          await this.resetLocal();
          this.epoch = page.epoch;
          continue;
        }
        this.epoch = page.epoch;
        await this.applyPulled(page);
        if (!page.more) break;
      }
      this.markReady();
    } catch {
      // No internet or the server is busy: the next round will try again.
    }
  }

  /** For tests and the sign-out screen: are there changes the server has not confirmed? */
  get unsentCount(): number {
    return this.outbox.length;
  }

  // ----- internals -----

  private async loadSaved(): Promise<void> {
    try {
      const db = new LocalDb(this.dbName);
      const [docs, outbox, meta] = await Promise.all([db.docs.toArray(), db.outbox.orderBy('seq').toArray(), db.meta.toArray()]);
      this.db = db;
      for (const row of docs) this.setLocal(row.path, row.data, new Set());
      this.outbox = outbox;
      for (const row of outbox) this.pending.set(row.op.path, (this.pending.get(row.op.path) ?? 0) + 1);
      this.cursor = meta.find((m) => m.key === 'cursor')?.value ?? 0;
      this.epoch = meta.find((m) => m.key === 'epoch')?.value ?? 0;
    } catch (e) {
      // Private browsing, or storage is blocked: carry on in memory for this visit.
      console.warn('[sync] this browser will not keep an offline copy:', e);
      this.db = null;
    }
  }

  private async save(work: (db: LocalDb) => Promise<void>): Promise<void> {
    if (!this.db) return;
    try {
      await work(this.db);
    } catch (e) {
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
    if (this.ready) return;
    this.ready = true;
    for (const resolve of this.readyWaiters.splice(0)) resolve();
    this.emit([...this.listeners.keys()]);
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

  private async resetLocal(): Promise<void> {
    const touched = new Set<string>();
    for (const [collection, docs] of this.collections) {
      touched.add(collectionKey(collection));
      for (const id of docs.keys()) touched.add(docKey(`${collection}/${id}`));
    }
    this.collections.clear();
    this.cursor = 0;
    await this.save(async (db) => {
      await db.transaction('rw', db.docs, db.meta, async () => {
        await db.docs.clear();
        await db.meta.put({ key: 'cursor', value: 0 });
      });
    });
    this.emit(touched);
  }

  private async applyPulled(page: PullPage): Promise<void> {
    const touched = new Set<string>();
    const puts: DocRow[] = [];
    const deletes: string[] = [];
    for (const doc of page.docs) {
      // Our own unsent change to this record is newer than what the server has.
      if (this.pending.has(doc.p)) continue;
      const parts = splitPath(doc.p);
      if (!parts) continue;
      this.setLocal(doc.p, doc.d, touched);
      if (doc.d === null) deletes.push(doc.p);
      else puts.push({ path: doc.p, collection: parts.collection, data: doc.d });
    }
    this.cursor = page.cursor;
    await this.save(async (db) => {
      await db.transaction('rw', db.docs, db.meta, async () => {
        if (puts.length) await db.docs.bulkPut(puts);
        if (deletes.length) await db.docs.bulkDelete(deletes);
        await db.meta.bulkPut([
          { key: 'cursor', value: page.cursor },
          { key: 'epoch', value: page.epoch },
        ]);
      });
    });
    this.emit(touched);
  }
}
