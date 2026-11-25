import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { backupFileName, collectionsText, countDocuments, encodeValue, orderCollections } from './backup-format';

const timestamp = (seconds: number, nanoseconds: number) => ({ seconds, nanoseconds, toDate: () => new Date(seconds * 1000 + nanoseconds / 1e6) });

describe('a stored value is written as it is', () => {
  it('a Firestore timestamp keeps its seconds and nanoseconds', () => {
    expect(encodeValue(timestamp(1767225600, 123456789))).toEqual({ $ts: [1767225600, 123456789] });
  });
  it('numbers, text, booleans, null and nesting pass through; undefined is left out', () => {
    expect(encodeValue({ b: 2.5, a: 'x', c: [1, { d: null, e: undefined }], f: true, g: undefined })).toEqual({ a: 'x', b: 2.5, c: [1, { d: null }], f: true });
  });
  it('a number JSON cannot hold is named, not turned into null', () => {
    expect(encodeValue(NaN)).toEqual({ $num: 'NaN' });
    expect(encodeValue(Infinity)).toEqual({ $num: 'Infinity' });
  });
  it('a Date, a reference and a location are tagged', () => {
    expect(encodeValue(new Date('2026-01-01T00:00:00.000Z'))).toEqual({ $date: '2026-01-01T00:00:00.000Z' });
    expect(encodeValue({ path: 'customers/c1', id: 'c1', firestore: {} })).toEqual({ $ref: 'customers/c1' });
    expect(encodeValue({ latitude: 32.5, longitude: 71.5, isEqual: () => true })).toEqual({ $geo: [32.5, 71.5] });
  });
  it('a record that merely has a "path" field stays a record', () => {
    expect(encodeValue({ path: 'x', id: 'y' })).toEqual({ id: 'y', path: 'x' });
  });
});

describe('the same data always writes the same file', () => {
  const a = { customers: [{ id: 'b', data: { n: 1 } }, { id: 'a', data: { n: 2 } }], transactions: [{ id: 't', data: {} }] };
  const b = { transactions: [{ id: 't', data: {} }], customers: [{ id: 'a', data: { n: 2 } }, { id: 'b', data: { n: 1 } }] };
  it('whatever order the documents arrived in', () => {
    expect(collectionsText(a)).toBe(collectionsText(b));
    expect(Object.keys(orderCollections(b))).toEqual(['customers', 'transactions']);
    expect(orderCollections(a).customers.map((d) => d.id)).toEqual(['a', 'b']);
  });
  it('so its fingerprint proves a copy is unaltered', () => {
    const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
    expect(sha(collectionsText(a))).toBe(sha(collectionsText(b)));
    const changed = { ...a, customers: [{ id: 'b', data: { n: 1 } }, { id: 'a', data: { n: 3 } }] };
    expect(sha(collectionsText(changed))).not.toBe(sha(collectionsText(a)));
  });
  it('counts every document', () => {
    expect(countDocuments(a)).toEqual({ documents: 3, counts: { customers: 2, transactions: 1 } });
  });
  it('names the file by project, time and fingerprint', () => {
    expect(backupFileName('pumppal', new Date(2026, 10, 25, 9, 5), 'abcdef0123456789')).toBe('pumppal-backup-20261125-0905-abcdef01.json');
  });
});
