import { describe, expect, it } from 'vitest';
import { auditCustomers } from './customer-audit';
import { AS_STORED, normaliseRecord, storedValue, withoutAsStored } from './normalise-record';

describe('a record is read into the shape every screen expects', () => {
  it('a figure stored as text becomes the number it spells', () => {
    const r = normaliseRecord<Record<string, any>>({ id: 'p1', totalCost: '27,000.50', volume: '100', supplier: 'PSO' });
    expect(r.totalCost).toBe(27000.5);
    expect(r.volume).toBe(100);
    expect(r.supplier).toBe('PSO');
    // the arithmetic that used to glue text together or crash
    expect(1000 + r.totalCost).toBe(28000.5);
    expect(r.totalCost.toFixed(2)).toBe('27000.50');
  });

  it('a record that is already right is handed back untouched, the very same object', () => {
    const record = { id: 't1', totalAmount: 500, volume: 2, notes: '12' };
    expect(normaliseRecord(record)).toBe(record);
  });

  it('text that spells no number counts as nothing, and a missing figure stays missing', () => {
    const r = normaliseRecord({ id: 'x', amount: 'abc' } as Record<string, any>);
    expect(r.amount).toBe(0);
    expect('volume' in r).toBe(false);
    expect(normaliseRecord({ id: 'y', amount: null } as Record<string, any>).amount).toBeNull();
  });

  it('only fields that hold numbers are read: a name or a note that looks like a number is left alone', () => {
    const r = normaliseRecord({ id: 'c', name: '786', contact: '03001234567', vehicleNumber: '1234', openingBalance: '2500' });
    expect(r).toMatchObject({ name: '786', contact: '03001234567', vehicleNumber: '1234', openingBalance: 2500 });
  });

  it('what was stored is kept beside it, and never travels back to the database', () => {
    const r = normaliseRecord({ id: 'p', amount: '2,000', timestamp: 't' });
    expect(storedValue(r, 'amount')).toBe('2,000');
    expect(storedValue(r, 'timestamp')).toBe('t');
    expect(storedValue({ amount: 5 }, 'amount')).toBe(5);
    expect(storedValue(null, 'amount')).toBeUndefined();
    const sent = withoutAsStored({ ...r, amount: 2500 });
    expect(AS_STORED in sent).toBe(false);
    expect(sent).toEqual({ id: 'p', amount: 2500, timestamp: 't' });
    const plain = { amount: 1 };
    expect(withoutAsStored(plain)).toBe(plain);
  });
});

describe('the audit still sees what the record really holds', () => {
  const at = '2026-03-01T10:00:00.000Z';
  const sources = (payment: Record<string, any>) => ({
    customers: [{ id: 'c1', name: 'Akram', openingBalance: 0 }],
    transactions: [{ id: 't1', customerId: 'c1', totalAmount: 5000, paymentMethod: 'Credit', isWalkIn: false, timestamp: at }],
    cashAdvances: [],
    customerPayments: [normaliseRecord({ id: 'p1', customerId: 'c1', paymentMethod: 'Cash', timestamp: at, ...payment })],
    saleReturns: [],
  });

  it('an amount stored as text is counted as its number and still reported', () => {
    const r = auditCustomers(sources({ amount: '2000' }), { now: new Date('2026-06-01') });
    expect(r.lines[0].closingBalance).toBe(3000);
    expect(r.issues.map((i) => i.code)).toEqual(['amount-stored-as-text']);
    expect(r.verified).toBe(true);
  });

  it('text that spells no number counts as nothing and is reported as unreadable', () => {
    const r = auditCustomers(sources({ amount: 'two thousand' }), { now: new Date('2026-06-01') });
    expect(r.lines[0].closingBalance).toBe(5000);
    expect(r.issues.map((i) => i.code)).toEqual(['amount-not-a-number']);
  });
});
