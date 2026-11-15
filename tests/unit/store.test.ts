import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyOp, type DocData, type Op } from '../../src/data/apply-op';
import { LocalStore, type SyncProblem } from '../../src/data/store';
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore } from '../../src/data/firestore';

/** A stand-in for the server: same rules, kept in memory, can be switched off. */
class FakeServer {
  docs = new Map<string, { data: DocData | null; version: number }>();
  version = 0;
  epoch = 1;
  online = true;
  status = 200;
  pageSize = 100_000;
  pushCalls = 0;
  /** Refuse any request carrying more changes than this, like a body-size limit. */
  maxOpsPerRequest = Infinity;
  /** A request containing this path is refused outright with HTTP 400. */
  poisonPath: string | undefined;
  rejectPaths = new Set<string>();
  beforePull: (() => Promise<void>) | undefined;
  private applied = new Set<string>();

  remoteSet(path: string, data: DocData | null) {
    this.docs.set(path, { data, version: ++this.version });
  }

  fetch: typeof fetch = async (input, init) => {
    if (!this.online) throw new TypeError('Failed to fetch');
    if (this.status !== 200) return new Response('{}', { status: this.status });
    if (init?.method === 'POST') {
      this.pushCalls++;
      const { ops } = JSON.parse(String(init.body)) as { ops: Op[] };
      if (ops.length > this.maxOpsPerRequest) return new Response('{}', { status: 413 });
      if (this.poisonPath && ops.some((op) => op.path === this.poisonPath)) return new Response('{}', { status: 400 });
      const truth: Record<string, DocData | null> = {};
      const results = ops.map((op) => {
        const current = () => this.docs.get(op.path)?.data ?? null;
        if (this.rejectPaths.has(op.path)) {
          truth[op.path] = current();
          return { opId: op.opId, status: 'rejected', reason: 'not allowed' };
        }
        if (this.applied.has(op.opId)) return { opId: op.opId, status: 'duplicate' };
        const result = applyOp(current(), op, '2026-01-01T00:00:00.000Z');
        if (result.status !== 'applied') {
          truth[op.path] = current();
          return { opId: op.opId, status: result.status };
        }
        this.applied.add(op.opId);
        this.remoteSet(op.path, result.data);
        return { opId: op.opId, status: 'applied' };
      });
      return Response.json({ results, truth });
    }
    if (this.beforePull) {
      const hook = this.beforePull;
      this.beforePull = undefined;
      await hook();
    }
    const since = Number(new URL(String(input), 'http://app.test').searchParams.get('since'));
    const all = [...this.docs]
      .filter(([, d]) => d.version > since)
      .sort((a, b) => a[1].version - b[1].version)
      .map(([p, d]) => ({ p, v: d.version, d: d.data }));
    const docs = all.slice(0, this.pageSize);
    return Response.json({ epoch: this.epoch, head: this.version, cursor: docs.length ? docs[docs.length - 1].v : since, more: docs.length < all.length, docs });
  };
}

let counter = 0;
function setup(server = new FakeServer(), dbName = `store-test-${++counter}-${Date.now()}`) {
  const store = new LocalStore({ fetch: server.fetch, pollMs: 1_000_000_000, dbName });
  const db: Firestore = { store };
  const problems: SyncProblem[] = [];
  store.onProblem((p) => problems.push(p));
  return { server, store, db, dbName, problems };
}
const amounts = (db: Firestore, path: string) => [...db.store.getCollection(path).values()].map((d) => d.amount);
const settle = () => new Promise((r) => setTimeout(r, 20));
const REAL_SETTINGS = { fuelPrices: { Diesel: 285.5, Petrol: 272.89 }, initialFuelStock: { Diesel: 12000, Petrol: 8000 } };
const DEFAULT_SETTINGS = { fuelPrices: { Diesel: 0, Petrol: 0 }, initialFuelStock: { Diesel: 0, Petrol: 0 } };

/** What use-database.tsx does: whenever it sees no settings record, it saves defaults. */
function appCreatesDefaultSettings(db: Firestore) {
  const seen: (DocData | 'none')[] = [];
  onSnapshot(doc(db, 'settings', 'app-settings'), (snap) => {
    seen.push(snap.exists() ? snap.data() : 'none');
    if (!snap.exists()) void setDoc(doc(db, 'settings', 'app-settings'), DEFAULT_SETTINGS);
  });
  return seen;
}

describe('the offline copy', () => {
  it('shows a new record at once and then delivers it to the server exactly once', async () => {
    const { server, store, db } = setup();
    await store.start('acct-a');

    const seen: number[] = [];
    onSnapshot(collection(db, 'expenses'), (snap) => seen.push(snap.size));
    await settle();
    const ref = await addDoc(collection(db, 'expenses'), { amount: 500, timestamp: new Date('2026-11-15T08:00:00Z') });

    expect(store.getDoc(ref.path)).toEqual({ amount: 500, timestamp: '2026-11-15T08:00:00.000Z' });
    await settle();
    await store.syncNow();
    expect(server.docs.get(ref.path)?.data).toEqual({ amount: 500, timestamp: '2026-11-15T08:00:00.000Z' });
    expect(store.unsentCount).toBe(0);
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(1);
    expect(server.docs.size).toBe(1);
    store.stop();
  });

  it('keeps working with no internet and sends everything when it returns', async () => {
    const { server, store, db } = setup();
    await store.start('acct-a');
    server.online = false;

    const a = await addDoc(collection(db, 'transactions'), { amount: 100 });
    await addDoc(collection(db, 'transactions'), { amount: 250 });
    await updateDoc(doc(db, a.path), { amount: 120, notes: 'corrected' });
    await settle();

    expect(amounts(db, 'transactions').sort()).toEqual([120, 250]);
    expect(store.unsentCount).toBe(3);
    expect(server.docs.size).toBe(0);

    server.online = true;
    await store.syncNow();
    expect(store.unsentCount).toBe(0);
    expect(server.docs.get(a.path)?.data).toEqual({ amount: 120, notes: 'corrected' });
    expect(server.docs.size).toBe(2);
    store.stop();
  });

  it('does not count a change twice when the connection drops after the server saved it', async () => {
    const { server, store, db } = setup();
    await store.start('acct-a');
    const realFetch = server.fetch;
    let dropNext = true;
    (store as unknown as { fetchFn: typeof fetch }).fetchFn = async (input, init) => {
      const res = await realFetch(input, init);
      if (init?.method === 'POST' && dropNext) {
        dropNext = false;
        throw new TypeError('connection lost after the server answered');
      }
      return res;
    };

    await addDoc(collection(db, 'customerPayments'), { amount: 9000 });
    await settle();
    await store.syncNow();
    expect(store.unsentCount).toBe(0);
    expect(server.pushCalls).toBe(2);
    expect([...server.docs.values()].map((d) => d.data)).toEqual([{ amount: 9000 }]);
    store.stop();
  });

  it("brings in other people's changes and deletions", async () => {
    const { server, store, db } = setup();
    server.remoteSet('customers/c1', { name: 'Ahmed' });
    server.remoteSet('customers/c2', { name: 'Bilal' });
    await store.start('acct-a');
    expect((await getDocs(collection(db, 'customers'))).size).toBe(2);

    let expenseFires = 0;
    onSnapshot(collection(db, 'expenses'), () => expenseFires++);
    await settle();
    const before = expenseFires;

    server.remoteSet('customers/c1', { name: 'Ahmed Khan' });
    server.remoteSet('customers/c2', null);
    await store.syncNow();

    expect(store.getDoc('customers/c1')).toEqual({ name: 'Ahmed Khan' });
    expect(store.getDoc('customers/c2')).toBeUndefined();
    expect(expenseFires).toBe(before); // a screen is not redrawn for records it does not show
    store.stop();
  });

  it('a change made while fetching is not overwritten by the older server copy', async () => {
    const { server, store, db } = setup();
    server.remoteSet('products/p1', { name: 'Diesel', salePrice: 280, unit: 'L' });
    await store.start('acct-a');

    server.remoteSet('products/p1', { name: 'Diesel', salePrice: 281, unit: 'Ltr' });
    server.beforePull = () => updateDoc(doc(db, 'products/p1'), { salePrice: 290 });
    await store.syncNow();
    expect(store.getDoc('products/p1')).toMatchObject({ salePrice: 290 });

    await settle();
    await store.syncNow();
    // Both changes survive: someone else's unit, this device's price.
    expect(store.getDoc('products/p1')).toEqual({ name: 'Diesel', salePrice: 290, unit: 'Ltr' });
    expect(server.docs.get('products/p1')?.data).toEqual({ name: 'Diesel', salePrice: 290, unit: 'Ltr' });
    store.stop();
  });

  it('reopens from the saved copy with no internet, unsent changes included', async () => {
    const first = setup();
    first.server.remoteSet('suppliers/s1', { name: 'PSO' });
    await first.store.start('acct-a');
    first.server.online = false;
    await setDoc(doc(first.db, 'suppliers/s2'), { name: 'Shell' });
    await settle();
    first.store.stop();

    const second = setup(first.server, first.dbName);
    await second.store.start('acct-a');
    expect(second.store.ready).toBe(true);
    expect(second.store.getDoc('suppliers/s1')).toEqual({ name: 'PSO' });
    expect(second.store.getDoc('suppliers/s2')).toEqual({ name: 'Shell' });
    expect(second.store.unsentCount).toBe(1);

    first.server.online = true;
    await second.store.syncNow();
    expect(first.server.docs.get('suppliers/s2')?.data).toEqual({ name: 'Shell' });
    second.store.stop();
  });

  it('loads afresh when the server database was rebuilt, or restored to an earlier point', async () => {
    const { server, store } = setup();
    server.remoteSet('customers/old', { name: 'Old' });
    server.remoteSet('customers/old2', { name: 'Old 2' });
    await store.start('acct-a');

    server.docs.clear();
    server.version = 0;
    server.epoch = 2;
    server.remoteSet('customers/new', { name: 'New' });
    await store.syncNow();
    expect(store.getDoc('customers/old')).toBeUndefined();
    expect(store.getDoc('customers/new')).toEqual({ name: 'New' });

    // Same epoch, but the server is now BEHIND this device (a restore from backup).
    server.remoteSet('customers/x', { name: 'X' });
    await store.syncNow();
    server.docs.clear();
    server.version = 0;
    server.remoteSet('customers/restored', { name: 'Restored' });
    await store.syncNow();
    expect(store.getDoc('customers/x')).toBeUndefined();
    expect(store.getDoc('customers/restored')).toEqual({ name: 'Restored' });
    store.stop();
  });

  it('waits quietly while the account is not approved, losing nothing', async () => {
    const { server, store, db } = setup();
    server.remoteSet('customers/c1', { name: 'Ahmed' });
    server.status = 403;
    await store.start('acct-a');
    expect(store.ready).toBe(false);

    let fired = 0;
    onSnapshot(collection(db, 'customers'), () => fired++);
    await settle();
    expect(fired).toBe(0);

    server.status = 200;
    await store.syncNow();
    expect(store.ready).toBe(true);
    expect(fired).toBe(1);
    store.stop();
  });

  it('never shows a half-loaded copy: a first load cut short stays hidden until it finishes', async () => {
    const first = setup();
    for (let i = 0; i < 10; i++) first.server.remoteSet(`transactions/t${i}`, { amount: i });
    first.server.remoteSet('settings/app-settings', REAL_SETTINGS);
    first.server.pageSize = 4;
    let pulls = 0;
    const realFetch = first.server.fetch;
    (first.store as unknown as { fetchFn: typeof fetch }).fetchFn = async (input, init) => {
      if (init?.method !== 'POST' && ++pulls > 1) throw new TypeError('connection lost');
      return realFetch(input, init);
    };
    await first.store.start('acct-a');
    expect(first.store.ready).toBe(false);
    first.store.stop();

    // Reopened later: 4 of 11 records are saved, and that must not count as a copy.
    const second = setup(first.server, first.dbName);
    second.server.online = false;
    const seen = appCreatesDefaultSettings(second.db);
    await second.store.start('acct-a');
    await settle();
    expect(second.store.ready).toBe(false);
    expect(seen).toEqual([]);

    second.server.online = true;
    await second.store.syncNow();
    await settle();
    expect(second.store.ready).toBe(true);
    expect(seen).toEqual([REAL_SETTINGS]);
    expect(second.store.getCollection('transactions').size).toBe(10);
    second.store.stop();
  });
});

describe('real settings are never replaced by defaults', () => {
  it('when the server refuses a change, the screen gets the server record without an empty moment', async () => {
    const { server, store, db, problems } = setup();
    server.remoteSet('settings/app-settings', REAL_SETTINGS);
    server.remoteSet('roles/admin', { name: 'Admin', permissions: ['view_dashboard'] });
    await store.start('acct-a');
    const seen = appCreatesDefaultSettings(db);
    await settle();
    server.rejectPaths.add('roles/admin');

    await updateDoc(doc(db, 'roles/admin'), { name: 'Changed' });
    await settle();
    await store.syncNow();
    await settle();
    await store.syncNow();

    expect(store.getDoc('roles/admin')).toEqual({ name: 'Admin', permissions: ['view_dashboard'] });
    expect(seen.every((s) => s !== 'none')).toBe(true);
    expect(server.docs.get('settings/app-settings')?.data).toEqual(REAL_SETTINGS);
    expect(store.unsentCount).toBe(0);
    expect(problems).toHaveLength(1);
    expect(problems[0].detail).toContain('not allowed');
    store.stop();
  });

  it('when the copy has to be reloaded, the app is told nothing until the real records are back', async () => {
    const { server, store, db } = setup();
    server.remoteSet('settings/app-settings', REAL_SETTINGS);
    await store.start('acct-a');
    const seen = appCreatesDefaultSettings(db);
    await settle();

    const saved = [...server.docs];
    server.docs.clear();
    server.version = 0;
    server.epoch = 2; // database rebuilt, same records
    for (const [path, d] of saved) server.remoteSet(path, d.data);
    await store.syncNow();
    await settle();
    await store.syncNow();

    expect(seen.every((s) => s !== 'none')).toBe(true);
    expect(server.docs.get('settings/app-settings')?.data).toEqual(REAL_SETTINGS);
    expect(store.getDoc('settings/app-settings')).toEqual(REAL_SETTINGS);
    store.stop();
  });

  it('even a device that wrongly believes there are no settings cannot overwrite them', async () => {
    const { server, store, db } = setup();
    await store.start('acct-a'); // genuinely empty at first
    server.online = false;
    const seen = appCreatesDefaultSettings(db); // sees none, queues defaults
    await settle();
    expect(seen).toContain('none');
    expect(store.unsentCount).toBe(1);

    server.remoteSet('settings/app-settings', REAL_SETTINGS); // meanwhile the real ones exist on the server
    server.online = true;
    await store.syncNow();
    await settle();
    await store.syncNow();

    expect(server.docs.get('settings/app-settings')?.data).toEqual(REAL_SETTINGS);
    expect(store.getDoc('settings/app-settings')).toEqual(REAL_SETTINGS);
    expect(store.unsentCount).toBe(0);
    store.stop();
  });
});

describe('a change is never thrown away quietly', () => {
  it('a request refused for its size is retried in smaller pieces until everything is delivered', async () => {
    const { server, store, db, problems } = setup();
    await store.start('acct-a');
    server.online = false;
    for (let i = 0; i < 23; i++) await addDoc(collection(db, 'transactions'), { amount: i });
    server.online = true;
    server.maxOpsPerRequest = 5;
    await store.syncNow();

    expect(store.unsentCount).toBe(0);
    expect(server.docs.size).toBe(23);
    expect(problems).toEqual([]);
    store.stop();
  });

  it('one change the server cannot accept is set aside and reported; the others still arrive', async () => {
    const { server, store, db, problems } = setup();
    await store.start('acct-a');
    server.online = false;
    for (let i = 0; i < 6; i++) await setDoc(doc(db, 'expenses', `e${i}`), { amount: i });
    server.poisonPath = 'expenses/e3';
    server.online = true;
    await store.syncNow();
    await settle();
    await store.syncNow();

    expect([...server.docs.keys()].sort()).toEqual(['expenses/e0', 'expenses/e1', 'expenses/e2', 'expenses/e4', 'expenses/e5']);
    expect(store.unsentCount).toBe(0);
    expect(store.getDoc('expenses/e3')).toBeUndefined(); // the screen shows what is really saved
    expect(problems).toHaveLength(1);
    expect(problems[0].title).toBe('A change was not saved');
    store.stop();
  });

  it('an edit to a record deleted on another device is reported, and the record goes', async () => {
    const { server, store, db, problems } = setup();
    server.remoteSet('customers/c1', { name: 'Ahmed', area: 'City' });
    await store.start('acct-a');
    server.online = false;
    await updateDoc(doc(db, 'customers/c1'), { area: 'Kundian' });
    server.remoteSet('customers/c1', null); // deleted elsewhere meanwhile
    server.online = true;
    await store.syncNow();

    expect(store.getDoc('customers/c1')).toBeUndefined();
    expect(server.docs.get('customers/c1')?.data).toBeNull();
    expect(problems[0].detail).toContain('deleted on another device');
    store.stop();
  });

  it('saving while signed out fails loudly instead of pretending', async () => {
    const { store, db } = setup();
    await expect(addDoc(collection(db, 'expenses'), { amount: 1 })).rejects.toThrow(/signed out/);
    await store.start('acct-a');
    store.stop();
    await expect(addDoc(collection(db, 'expenses'), { amount: 1 })).rejects.toThrow(/signed out/);
  });
});

describe('one device, several people or tabs', () => {
  it("one person's unsent changes are never sent under another person's sign-in", async () => {
    const a = setup();
    await a.store.start('acct-attendant');
    a.server.online = false;
    await setDoc(doc(a.db, 'userRoles', 'acct-attendant'), { roleId: 'admin' }); // queued while offline
    await setDoc(doc(a.db, 'expenses', 'e1'), { amount: 10 });
    await settle();
    a.store.stop();

    // The admin signs in on the same computer.
    a.server.online = true;
    const b = setup(a.server, a.dbName);
    await b.store.start('acct-admin');
    await b.store.syncNow();
    expect(b.store.unsentCount).toBe(0);
    expect(a.server.pushCalls).toBe(0);
    expect(a.server.docs.size).toBe(0);
    b.store.stop();

    // The first person returns: their changes go out as themselves.
    const c = setup(a.server, a.dbName);
    await c.store.start('acct-attendant');
    await c.store.syncNow();
    expect(a.server.docs.get('expenses/e1')?.data).toEqual({ amount: 10 });
    c.store.stop();
  });

  it('a tab does not stamp its position onto a copy another tab emptied', async () => {
    const one = setup();
    for (let i = 0; i < 5; i++) one.server.remoteSet(`customers/c${i}`, { name: `C${i}` });
    await one.store.start('acct-a');
    const two = setup(one.server, one.dbName);
    await two.store.start('acct-a');

    // Tab one empties the shared saved copy and is closed before reloading it.
    await (one.store as unknown as { emptyAndReload(): Promise<void> }).emptyAndReload();
    one.store.stop();

    one.server.remoteSet('customers/c9', { name: 'C9' });
    await two.store.syncNow();
    await two.store.syncNow();
    two.store.stop();

    // Whoever opens the app next must find a complete copy, not one record marked "up to date".
    const three = setup(one.server, one.dbName);
    three.server.online = false;
    await three.store.start('acct-a');
    if (three.store.ready) expect(three.store.getCollection('customers').size).toBe(6);
    three.server.online = true;
    await three.store.syncNow();
    expect(three.store.getCollection('customers').size).toBe(6);
    three.store.stop();
  });
});

describe('the Firestore-shaped functions', () => {
  it('updateDoc on a missing record fails, as Firestore did', async () => {
    const { store, db } = setup();
    await store.start('acct-a');
    await expect(updateDoc(doc(db, 'customers/nope'), { name: 'x' })).rejects.toThrow(/No record/);
    expect(store.unsentCount).toBe(0);
    store.stop();
  });

  it('refuses at once a change the server would refuse later, such as a price for a product with no name', async () => {
    const { server, store, db } = setup();
    server.remoteSet('settings/app-settings', REAL_SETTINGS);
    await store.start('acct-a');
    await expect(updateDoc(doc(db, 'settings/app-settings'), { 'fuelPrices.': 5 })).rejects.toThrow(/cannot be saved/);
    expect(store.unsentCount).toBe(0);
    expect(store.getDoc('settings/app-settings')).toEqual(REAL_SETTINGS);
    store.stop();
  });

  it('drops undefined fields, turns dates into text and stamps the clock', async () => {
    const { store, db } = setup();
    await store.start('acct-a');
    const ref = await addDoc(collection(db, 'products'), { name: 'Mobil', notes: undefined, hireDate: new Date('2026-01-02T03:04:05Z'), createdAt: serverTimestamp() });
    const saved = store.getDoc(ref.path)!;
    expect(saved.name).toBe('Mobil');
    expect('notes' in saved).toBe(false);
    expect(saved.hireDate).toBe('2026-01-02T03:04:05.000Z');
    expect(Number.isNaN(Date.parse(saved.createdAt as string))).toBe(false);
    store.stop();
  });

  it('a batch saves together, and moving a record to the recycle bin and back keeps it identical', async () => {
    const { server, store, db } = setup();
    await store.start('acct-a');
    const original = { amount: 750, description: 'Generator fuel', timestamp: '2026-11-01T00:00:00.000Z' };
    await setDoc(doc(db, 'expenses', 'e1'), original);

    // delete -> recycle bin (what use-database.tsx does)
    const bin = await addDoc(collection(db, 'recycleBin'), { originalPath: 'expenses/e1', deletedAt: new Date().toISOString(), data: store.getDoc('expenses/e1') });
    await deleteDoc(doc(db, 'expenses', 'e1'));
    expect(store.getDoc('expenses/e1')).toBeUndefined();

    // restore
    const item = store.getDoc(bin.path) as { originalPath: string; data: DocData };
    const batch = writeBatch(db);
    batch.set(doc(db, item.originalPath), item.data);
    batch.delete(doc(db, bin.path));
    await batch.commit();

    await settle();
    await store.syncNow();
    expect(store.getDoc('expenses/e1')).toEqual(original);
    expect(server.docs.get('expenses/e1')?.data).toEqual(original);
    expect(server.docs.get(bin.path)?.data).toBeNull();
    store.stop();
  });

  it('doc() builds the same paths Firestore did', () => {
    const { db } = setup();
    expect(doc(db, 'settings', 'app-settings').path).toBe('settings/app-settings');
    expect(doc(db, 'expenses/e1').id).toBe('e1');
    expect(doc(collection(db, 'roles')).id).toMatch(/^[A-Za-z0-9]{20}$/);
  });
});
