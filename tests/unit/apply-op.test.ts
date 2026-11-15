import { describe, expect, it } from 'vitest';
import { applyOp, invalidReason, serverTimestampMarker, splitPath, type Op } from '../../src/data/apply-op';

const NOW = '2026-11-15T10:00:00.000Z';
const op = (o: Record<string, unknown>): Op => ({ opId: 'op-00000001', ...o }) as Op;

describe('splitPath', () => {
  it('splits a record path', () => {
    expect(splitPath('customers/abc')).toEqual({ collection: 'customers', docId: 'abc', root: 'customers' });
    expect(splitPath('customers/abc/transactions/x1')).toEqual({ collection: 'customers/abc/transactions', docId: 'x1', root: 'customers' });
  });

  it('refuses anything that is not a record path', () => {
    for (const bad of ['', 'customers', 'customers/', '/abc', 'a/b/c', 'a/../b/c', 'a/' + 'x'.repeat(256)]) {
      expect(splitPath(bad), bad).toBeNull();
    }
  });
});

describe('applyOp', () => {
  it('set replaces the whole record', () => {
    const result = applyOp({ a: 1, b: 2 }, op({ path: 'c/1', type: 'set', data: { b: 3 } }), NOW);
    expect(result).toEqual({ status: 'applied', data: { b: 3 } });
  });

  it('set with merge keeps other fields and merges inside maps', () => {
    const before = { name: 'Ali', prices: { Diesel: 280, Petrol: 270 } };
    const result = applyOp(before, op({ path: 'c/1', type: 'set', merge: true, data: { prices: { Diesel: 285 } } }), NOW);
    expect(result).toEqual({ status: 'applied', data: { name: 'Ali', prices: { Diesel: 285, Petrol: 270 } } });
  });

  it('update changes only the named fields', () => {
    const result = applyOp({ amount: 100, notes: 'x' }, op({ path: 'c/1', type: 'update', data: { amount: 150 } }), NOW);
    expect(result).toEqual({ status: 'applied', data: { amount: 150, notes: 'x' } });
  });

  it('update with a dotted name reaches inside a map, as the price and stock settings do', () => {
    const before = { fuelPrices: { Diesel: 280, Petrol: 270 }, colorSettings: { Sale: '#000' } };
    const result = applyOp(before, op({ path: 'settings/app-settings', type: 'update', data: { 'fuelPrices.Diesel': 290 } }), NOW);
    expect(result).toEqual({ status: 'applied', data: { fuelPrices: { Diesel: 290, Petrol: 270 }, colorSettings: { Sale: '#000' } } });
  });

  it('update with a plain name replaces a map outright', () => {
    const before = { initialFuelStock: { Diesel: 1, Petrol: 2 } };
    const result = applyOp(before, op({ path: 'settings/app-settings', type: 'update', data: { initialFuelStock: { Diesel: 5 } } }), NOW);
    expect(result).toEqual({ status: 'applied', data: { initialFuelStock: { Diesel: 5 } } });
  });

  it('update of a record that does not exist is reported, not invented', () => {
    expect(applyOp(null, op({ path: 'c/1', type: 'update', data: { a: 1 } }), NOW)).toEqual({ status: 'missing' });
  });

  it('delete removes the record', () => {
    expect(applyOp({ a: 1 }, op({ path: 'c/1', type: 'delete' }), NOW)).toEqual({ status: 'applied', data: null });
  });

  it('fills in the server clock wherever the marker appears', () => {
    const result = applyOp(null, op({ path: 'c/1', type: 'set', data: { timestamp: serverTimestampMarker(), nested: { createdAt: serverTimestampMarker() } } }), NOW);
    expect(result).toEqual({ status: 'applied', data: { timestamp: NOW, nested: { createdAt: NOW } } });
  });

  it('never alters the record it was given', () => {
    const before = { prices: { Diesel: 280 }, list: [1, 2] };
    const copy = structuredClone(before);
    applyOp(before, op({ path: 'c/1', type: 'update', data: { 'prices.Diesel': 1, 'prices.New': 2 } }), NOW);
    applyOp(before, op({ path: 'c/1', type: 'set', merge: true, data: { prices: { Diesel: 9 } } }), NOW);
    expect(before).toEqual(copy);
  });

  it('keeps money figures exactly', () => {
    const data = { totalAmount: 1234567.89, volume: 0.1 + 0.2, pricePerLitre: 272.89 };
    const result = applyOp(null, op({ path: 'transactions/1', type: 'set', data }), NOW);
    expect(JSON.parse(JSON.stringify(result))).toEqual({ status: 'applied', data });
  });
});

describe('invalidReason', () => {
  it('accepts well-formed changes', () => {
    expect(invalidReason({ opId: 'op-00000001', path: 'c/1', type: 'set', data: { a: 1 } })).toBeNull();
    expect(invalidReason({ opId: 'op-00000001', path: 'c/1', type: 'delete' })).toBeNull();
  });

  it('refuses malformed ones', () => {
    expect(invalidReason(null)).not.toBeNull();
    expect(invalidReason({ opId: 'x', path: 'c/1', type: 'delete' })).toBe('bad opId');
    expect(invalidReason({ opId: 'op-00000001', path: 'c', type: 'delete' })).toBe('bad path');
    expect(invalidReason({ opId: 'op-00000001', path: 'c/1', type: 'rename' })).toBe('bad type');
    expect(invalidReason({ opId: 'op-00000001', path: 'c/1', type: 'set', data: [] })).toBe('bad data');
  });

  it('refuses field names that could tamper with the program itself', () => {
    const tampered = JSON.parse('{"opId":"op-00000001","path":"c/1","type":"set","data":{"a":{"__proto__":{"x":1}}}}');
    expect(invalidReason(tampered)).toBe('bad field name');
    expect(invalidReason({ opId: 'op-00000001', path: 'c/1', type: 'update', data: { 'a.constructor.b': 1 } })).toBe('bad field name');
  });
});
