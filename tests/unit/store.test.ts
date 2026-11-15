import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyOp, type DocData, type Op } from '../../src/data/apply-op';
import { LocalStore } from '../../src/data/store';
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore } from '../../src/data/firestore';

/** A stand-in for the server: same rules, kept in memory, can be switched off. */
class FakeServer {
  docs = new Map<string, { data: DocData | null; version: number }>();
  version = 0;
  epoch = 1;
  online = true;
  status = 200;
  pushCalls = 0;
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
      const results = ops.map((op) => {
        if (this.rejectPaths.has(op.path)) return { opId: op.opId, status: 'rejected' };
        if (this.applied.has(op.opId)) return { opId: op.opId, status: 'duplicate' };
        const result = applyOp(this.docs.get(op.path)?.data ?? null, op, '2026-01-01T00:00:00.000Z');
        if (result.status === 'missing') return { opId: op.opId, status: 'missing' };
        this.applied.add(op.opId);
        this.remoteSet(op.path, result.data);
        return { opId: op.opId, status: 'applied' };
      });
      return Response.json({ results });
    }
    if (this.beforePull) {
      const hook = this.beforePull;
      this.beforePull = undefined;
      await hook();
    }
    const since = Number(new URL(String(input), 'http://app.test').searchParams.get('since'));
    const docs = [...this.docs]
      .filter(([, d]) => d.version > since)
      .sort((a, b) => a[1].version - b[1].version)
      .map(([p, d]) => ({ p, v: d.version, d: d.data }));
    return Response.json({ epoch: this.epoch, cursor: docs.length ? docs[docs.length - 1].v : since, more: false, docs });
  };
}

let counter = 0;
function setup(server = new FakeServer(), dbName = `store-test-${++counter}-${Date.now()}`) {
  const store = new LocalStore({ fetch: server.fetch, pollMs: 1_000_000_000, dbName });
  const db: Firestore = { store };
  return { server, store, db, dbName };
}
const amounts = (db: Firestore, path: string) => [...db.store.getCollection(path).values()].map((d) => d.amount);
const settle = () => new Promise((r) => setTimeout(r, 20));

describe('the offline copy', () => {
  it('shows a new record at once and then delivers it to the server exactly once', async () => {
    const { server, store, db } = setup();
    await store.start();

    const seen: number[] = [];
    onSnapshot(collection(db, 'expenses'), (snap) => seen.push(snap.size));
    await settle();
    const ref = await addDoc(collection(db, 'expenses'), { amount: 500, timestamp: new Date('2026-11-15T08:00:00Z') });

    expect(store.getDoc(ref.path)).toEqual({ amount: 500, timestamp: '2026-11-15T08:00:00.000Z' });
    await settle();
    expect(server.docs.get(ref.path)?.data).toEqual({ amount: 500, timestamp: '2026-11-15T08:00:00.000Z' });
    expect(store.unsentCount).toBe(0);
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(1);

    await store.syncNow();
    expect(server.docs.size).toBe(1);
    store.stop();
  });

  it('keeps working with no internet and sends everything when it returns', async () => {
    const { server, store, db } = setup();
    await store.start();
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
    await store.start();
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
    expect(store.unsentCount).toBe(1); // the device does not know it arrived
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
    await store.start();
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
    await store.start();

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
    await first.store.start();
    first.server.online = false;
    await setDoc(doc(first.db, 'suppliers/s2'), { name: 'Shell' });
    await settle();
    first.store.stop();

    const second = setup(first.server, first.dbName);
    await second.store.start();
    expect(second.store.ready).toBe(true);
    expect(second.store.getDoc('suppliers/s1')).toEqual({ name: 'PSO' });
    expect(second.store.getDoc('suppliers/s2')).toEqual({ name: 'Shell' });
    expect(second.store.unsentCount).toBe(1);

    first.server.online = true;
    await second.store.syncNow();
    expect(first.server.docs.get('suppliers/s2')?.data).toEqual({ name: 'Shell' });
    second.store.stop();
  });

  it('falls back to what the server holds when the server refuses a change', async () => {
    const { server, store, db } = setup();
    server.remoteSet('roles/admin', { name: 'Admin', permissions: ['view_dashboard'] });
    await store.start();
    server.rejectPaths.add('roles/admin');

    await updateDoc(doc(db, 'roles/admin'), { name: 'Hacked' });
    expect(store.getDoc('roles/admin')).toMatchObject({ name: 'Hacked' });
    await settle();
    await store.syncNow();
    expect(store.getDoc('roles/admin')).toEqual({ name: 'Admin', permissions: ['view_dashboard'] });
    expect(store.unsentCount).toBe(0);
    store.stop();
  });

  it('loads afresh when the server database was rebuilt', async () => {
    const { server, store } = setup();
    server.remoteSet('customers/old', { name: 'Old' });
    await store.start();
    expect(store.getDoc('customers/old')).toBeDefined();

    server.docs.clear();
    server.version = 0;
    server.epoch = 2;
    server.remoteSet('customers/new', { name: 'New' });
    await store.syncNow();
    expect(store.getDoc('customers/old')).toBeUndefined();
    expect(store.getDoc('customers/new')).toEqual({ name: 'New' });
    store.stop();
  });

  it('waits quietly while the account is not approved, losing nothing', async () => {
    const { server, store, db } = setup();
    server.remoteSet('customers/c1', { name: 'Ahmed' });
    server.status = 403;
    await store.start();
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
});

describe('the Firestore-shaped functions', () => {
  it('updateDoc on a missing record fails, as Firestore did', async () => {
    const { store, db } = setup();
    await store.start();
    await expect(updateDoc(doc(db, 'customers/nope'), { name: 'x' })).rejects.toThrow(/No record/);
    expect(store.unsentCount).toBe(0);
    store.stop();
  });

  it('drops undefined fields, turns dates into text and stamps the clock', async () => {
    const { store, db } = setup();
    await store.start();
    const ref = await addDoc(collection(db, 'products'), { name: 'Mobil', notes: undefined, hireDate: new Date('2026-01-02T03:04:05Z'), createdAt: serverTimestamp() });
    const saved = store.getDoc(ref.path)!;
    expect(saved.name).toBe('Mobil');
    expect('notes' in saved).toBe(false);
    expect(saved.hireDate).toBe('2026-01-02T03:04:05.000Z');
    expect(typeof saved.createdAt).toBe('string');
    expect(Number.isNaN(Date.parse(saved.createdAt as string))).toBe(false);
    store.stop();
  });

  it('a batch saves together, and moving a record to the recycle bin and back keeps it identical', async () => {
    const { server, store, db } = setup();
    await store.start();
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
