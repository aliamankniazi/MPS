import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/server/db/client';
import type { Actor } from '../../src/server/access/policy';
import { serverTimestampMarker, type Op } from '../../src/data/apply-op';
import { pullChanges, pullToJson, pushChanges, pushOps, readDocs } from '../../src/server/sync/documents';
import { closeTestDb, freshTestDb } from './test-db';

let db: Db;
let n = 0;
const id = () => `op-${String(++n).padStart(8, '0')}`;
const admin: Actor = { accountId: 'a1', email: 'owner@example.com', emailVerified: true, roleId: 'admin', active: true };
const attendant: Actor = { ...admin, accountId: 'a2', roleId: 'attendant' };
const set = (path: string, data: Record<string, unknown>): Op => ({ opId: id(), path, type: 'set', data });

beforeEach(async () => {
  db = await freshTestDb();
});
afterAll(closeTestDb);

describe('push', () => {
  it('saves changes in order and numbers them without gaps', async () => {
    const results = await pushOps(db, attendant, [
      set('transactions/t1', { totalAmount: 5400.5, volume: 20 }),
      set('transactions/t2', { totalAmount: 100 }),
      { opId: id(), path: 'transactions/t1', type: 'update', data: { notes: 'cash' } },
    ]);
    expect(results.map((r) => r.status)).toEqual(['applied', 'applied', 'applied']);

    const pull = await pullChanges(db, 0);
    expect(pull.docs.map((d) => [d.path, d.version])).toEqual([
      ['transactions/t1', 1],
      ['transactions/t2', 2],
    ]);
    expect(JSON.parse(pull.docs[0].dataRaw!)).toEqual({ totalAmount: 5400.5, volume: 20, notes: 'cash' });
    expect(pull.cursor).toBe(2);
    expect(pull.more).toBe(false);
  });

  it('applies a repeated change only once', async () => {
    const op: Op = { opId: id(), path: 'customerPayments/p1', type: 'set', data: { amount: 9000 } };
    const bump: Op = { opId: id(), path: 'bankAccounts/b1', type: 'set', data: { balance: 1 } };
    expect((await pushOps(db, attendant, [op, bump]))[0].status).toBe('applied');
    const again = await pushOps(db, attendant, [op, { opId: id(), path: 'customerPayments/p1', type: 'update', data: { amount: 1 } }, op]);
    expect(again.map((r) => r.status)).toEqual(['duplicate', 'applied', 'duplicate']);
    expect((await readDocs(db, ['customerPayments/p1'])).get('customerPayments/p1')).toEqual({ amount: 1 });
  });

  it('reports an update to a missing record and refuses malformed or oversized changes', async () => {
    const results = await pushOps(db, attendant, [
      { opId: id(), path: 'customers/none', type: 'update', data: { name: 'x' } },
      { opId: id(), path: 'not-a-path', type: 'set', data: {} },
      { opId: id(), path: 'customers/big', type: 'set', data: { blob: 'x'.repeat(950_000) } },
      set('customers/ok', { name: 'Ahmed' }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['missing', 'rejected', 'rejected', 'applied']);
    expect((await pullChanges(db, 0)).docs.map((d) => d.path)).toEqual(['customers/ok']);
  });

  it('lets only an admin change roles or who holds them', async () => {
    const denied = await pushOps(db, attendant, [set('userRoles/a2', { roleId: 'admin', email: 'x' }), set('roles/admin', { name: 'Admin', permissions: [] })]);
    expect(denied.map((r) => [r.status, r.reason])).toEqual([
      ['rejected', 'not allowed'],
      ['rejected', 'not allowed'],
    ]);
    const allowed = await pushOps(db, admin, [set('userRoles/a2', { roleId: 'manager', email: 'x' })]);
    expect(allowed[0].status).toBe('applied');
  });

  it('a create-only change never replaces a record that already exists, and says what the server holds', async () => {
    const real = { fuelPrices: { Diesel: 285.5 }, initialFuelStock: { Diesel: 12000 } };
    await pushOps(db, admin, [set('settings/app-settings', real)]);
    const outcome = await pushChanges(db, attendant, [
      { opId: id(), path: 'settings/app-settings', type: 'set', ifAbsent: true, data: { fuelPrices: { Diesel: 0 }, initialFuelStock: { Diesel: 0 } } },
      { opId: id(), path: 'settings/other', type: 'set', ifAbsent: true, data: { created: true } },
    ]);
    expect(outcome.results.map((r) => r.status)).toEqual(['exists', 'applied']);
    expect(outcome.truth).toEqual({ 'settings/app-settings': real });
    expect((await readDocs(db, ['settings/app-settings'])).get('settings/app-settings')).toEqual(real);
  });

  it('tells the device what is really saved whenever a change is not taken', async () => {
    await pushOps(db, admin, [set('roles/admin', { name: 'Admin', permissions: ['x'] })]);
    const outcome = await pushChanges(db, attendant, [
      { opId: id(), path: 'roles/admin', type: 'update', data: { name: 'Mine now' } },
      { opId: id(), path: 'customers/gone', type: 'update', data: { name: 'x' } },
    ]);
    expect(outcome.results.map((r) => r.status)).toEqual(['rejected', 'missing']);
    expect(outcome.truth).toEqual({ 'roles/admin': { name: 'Admin', permissions: ['x'] }, 'customers/gone': null });
  });

  it('nobody can change or remove their own role, so an admin cannot lock the business out', async () => {
    await pushOps(db, { ...admin, accountId: 'someone-else' }, [set('userRoles/a1', { roleId: 'admin', email: 'owner@example.com' })]);
    const outcome = await pushChanges(db, admin, [
      { opId: id(), path: 'userRoles/a1', type: 'update', data: { roleId: 'attendant' } },
      { opId: id(), path: 'userRoles/a1', type: 'delete' },
    ]);
    expect(outcome.results.map((r) => [r.status, r.reason])).toEqual([
      ['rejected', 'you cannot change your own role'],
      ['rejected', 'you cannot change your own role'],
    ]);
    expect((await readDocs(db, ['userRoles/a1'])).get('userRoles/a1')).toEqual({ roleId: 'admin', email: 'owner@example.com' });
  });

  it('two devices editing different fields of one record at the same moment both keep their change', async () => {
    await pushOps(db, admin, [set('settings/app-settings', { fuelPrices: { Diesel: 280, Petrol: 270 } })]);
    await Promise.all([
      pushOps(db, attendant, [{ opId: id(), path: 'settings/app-settings', type: 'update', data: { 'fuelPrices.Diesel': 290 } }]),
      pushOps(db, admin, [{ opId: id(), path: 'settings/app-settings', type: 'update', data: { 'fuelPrices.Petrol': 275 } }]),
    ]);
    expect((await readDocs(db, ['settings/app-settings'])).get('settings/app-settings')).toEqual({ fuelPrices: { Diesel: 290, Petrol: 275 } });
  });

  it('the same batch sent twice at the same moment is applied once', async () => {
    const op: Op = { opId: id(), path: 'customerPayments/once', type: 'set', data: { amount: 7000 } };
    const [a, b] = await Promise.all([pushOps(db, attendant, [op]), pushOps(db, attendant, [op])]);
    expect([a[0].status, b[0].status].sort()).toEqual(['applied', 'duplicate']);
    expect((await pullChanges(db, 0)).docs).toHaveLength(1);
  });

  it('someone who is not active cannot write at all', async () => {
    const results = await pushOps(db, { ...attendant, active: false }, [set('transactions/t1', { totalAmount: 1 })]);
    expect(results[0]).toMatchObject({ status: 'rejected', reason: 'not allowed' });
  });

  it('stamps the server clock and keeps a deletion as a marker others can learn of', async () => {
    const now = new Date('2026-11-15T09:30:00.000Z');
    await pushOps(db, attendant, [set('products/p1', { name: 'Diesel', createdAt: serverTimestampMarker() })], now);
    expect((await readDocs(db, ['products/p1'])).get('products/p1')).toEqual({ name: 'Diesel', createdAt: '2026-11-15T09:30:00.000Z' });

    await pushOps(db, attendant, [{ opId: id(), path: 'products/p1', type: 'delete' }]);
    expect((await readDocs(db, ['products/p1'])).size).toBe(0);
    const pull = await pullChanges(db, 1);
    expect(pull.docs).toEqual([{ path: 'products/p1', version: 2, dataRaw: null }]);
  });

  it('treats ids that differ only by letter case as different records', async () => {
    await pushOps(db, attendant, [set('customers/Abc', { name: 'upper' }), set('customers/abc', { name: 'lower' })]);
    const docs = await readDocs(db, ['customers/Abc', 'customers/abc']);
    expect(docs.get('customers/Abc')).toEqual({ name: 'upper' });
    expect(docs.get('customers/abc')).toEqual({ name: 'lower' });
  });

  it('two people saving at the same moment both succeed, with distinct numbers', async () => {
    const batches = Array.from({ length: 8 }, (_, i) => pushOps(db, attendant, [set(`expenses/e${i}`, { amount: i })]));
    const results = await Promise.all(batches);
    expect(results.every((r) => r[0].status === 'applied')).toBe(true);
    const versions = (await pullChanges(db, 0)).docs.map((d) => d.version);
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('pull', () => {
  it('pages through a large history without losing or repeating a record', async () => {
    for (let batch = 0; batch < 5; batch++) {
      await pushOps(db, attendant, Array.from({ length: 50 }, (_, i) => set(`transactions/t${batch}-${i}`, { totalAmount: batch * 100 + i })));
    }
    const seen: string[] = [];
    let cursor = 0;
    for (let guard = 0; guard < 100; guard++) {
      const page = await pullChanges(db, cursor, 60);
      seen.push(...page.docs.map((d) => d.path));
      cursor = page.cursor;
      if (!page.more) break;
    }
    expect(seen).toHaveLength(250);
    expect(new Set(seen).size).toBe(250);
    expect(cursor).toBe(250);
  });

  it('splits pages by size as well as by count', async () => {
    await pushOps(db, attendant, [set('a/1', { blob: 'x'.repeat(2000) }), set('a/2', { blob: 'y'.repeat(2000) }), set('a/3', { blob: 'z'.repeat(2000) })]);
    const page = await pullChanges(db, 0, 1000, 3000);
    expect(page.docs).toHaveLength(1);
    expect(page.more).toBe(true);

    // Urdu text is two or three bytes a letter: pages are measured in real bytes.
    await pushOps(db, attendant, [set('b/1', { note: 'ع'.repeat(1000) }), set('b/2', { note: 'ع'.repeat(1000) })]);
    const urdu = await pullChanges(db, 3, 1000, 2500);
    expect(urdu.docs).toHaveLength(1);
  });

  it('sends records as the exact text that was stored', async () => {
    await pushOps(db, attendant, [set('transactions/t1', { totalAmount: 1234567.89, pricePerLitre: 272.89, customerName: 'علی "خان"' })]);
    const text = pullToJson(await pullChanges(db, 0));
    const parsed = JSON.parse(text) as { epoch: number; docs: { p: string; v: number; d: unknown }[] };
    expect(parsed.docs).toEqual([{ p: 'transactions/t1', v: 1, d: { totalAmount: 1234567.89, pricePerLitre: 272.89, customerName: 'علی "خان"' } }]);
    expect(parsed.epoch).toBeGreaterThan(0);
    expect((parsed as unknown as { head: number }).head).toBe(1);
  });
});
