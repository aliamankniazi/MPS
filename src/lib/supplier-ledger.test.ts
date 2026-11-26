import { describe, expect, it } from 'vitest';
import { buildSupplierBook, describeSupplierRow, supplierBalanceWithout, supplierLedgerOf, supplierStatement, type SupplierSources } from './supplier-ledger';

const at = (day: string, time = '10:00:00') => new Date(`${day}T${time}`).toISOString();

function world(): SupplierSources {
  return {
    suppliers: [
      { id: 's1', name: 'PSO Depot', openingBalance: 100000 },
      { id: 's2', name: 'Quiet Supplier' },
    ],
    purchases: [
      { id: 'pu1', supplierId: 's1', fuelType: 'Diesel', volume: 10000, totalCost: 2700000, timestamp: at('2026-10-01') },
      { id: 'pu2', supplierId: 's1', fuelType: 'Petrol', volume: 5000, totalCost: '1300000', timestamp: at('2026-11-02') },
    ],
    supplierPayments: [{ id: 'sp1', supplierId: 's1', amount: 2000000, paymentMethod: 'Bank Transfer', timestamp: at('2026-10-03') }],
    purchaseReturns: [{ id: 'pr1', supplierId: 's1', fuelType: 'Diesel', volume: 100, totalRefund: 27000, timestamp: at('2026-10-04') }],
  };
}

describe('what is owed to a supplier', () => {
  it('opening + purchases - payments - purchase returns', () => {
    const l = supplierLedgerOf(buildSupplierBook(world()), 's1');
    expect(l.openingBalance).toBe(100000);
    expect(l.totalCredit).toBe(4000000);
    expect(l.totalDebit).toBe(2027000);
    expect(l.closingBalance).toBe(100000 + 4000000 - 2027000);
    expect(l.rows.map((r) => [r.kind, r.balance])).toEqual([
      ['purchase', 2800000],
      ['payment', 800000],
      ['purchase-return', 773000],
      ['purchase', 2073000],
    ]);
  });

  it('a purchase return lowers what is owed, as the Purchase Return screen previews', () => {
    const w = world();
    const without = supplierLedgerOf(buildSupplierBook({ ...w, purchaseReturns: [] }), 's1').closingBalance;
    expect(supplierLedgerOf(buildSupplierBook(w), 's1').closingBalance).toBe(without - 27000);
  });

  it('a supplier with no entries sits on the opening balance; one nobody has is at zero', () => {
    const book = buildSupplierBook(world());
    expect(supplierLedgerOf(book, 's2').closingBalance).toBe(0);
    expect(supplierLedgerOf(book, 'nobody').closingBalance).toBe(0);
    expect(supplierLedgerOf(book, null).rows).toEqual([]);
  });

  it('every record once, whatever order it arrives in', () => {
    const w = world();
    const doubled = { ...w, purchases: [...w.purchases, ...w.purchases].reverse(), supplierPayments: [...w.supplierPayments, ...w.supplierPayments] };
    expect(supplierLedgerOf(buildSupplierBook(doubled), 's1').closingBalance).toBe(2073000);
  });

  it('a record for a supplier that no longer exists is an orphan, on nobody\'s balance', () => {
    const w = world();
    const book = buildSupplierBook({ ...w, supplierPayments: [...w.supplierPayments, { id: 'sp9', supplierId: 'gone', amount: 500, timestamp: at('2026-10-05') }] });
    expect(book.orphans.map((r) => r.key)).toEqual(['supplierPayments/sp9']);
    expect(supplierLedgerOf(book, 's1').closingBalance).toBe(2073000);
  });
});

describe('a period', () => {
  it('opens on what was owed before it and each row keeps its running balance', () => {
    const l = supplierLedgerOf(buildSupplierBook(world()), 's1');
    const november = supplierStatement(l, { from: new Date('2026-11-01T00:00:00'), to: new Date('2026-11-30T00:00:00') });
    expect(november.openingBalance).toBe(773000);
    expect(november.rows.map((r) => r.sourceId)).toEqual(['pu2']);
    expect(november.totalCredit).toBe(1300000);
    expect(november.closingBalance).toBe(2073000);
    const october = supplierStatement(l, { to: new Date('2026-10-31T00:00:00') });
    expect(october.openingBalance).toBe(100000);
    expect(october.closingBalance).toBe(november.openingBalance);
    expect(supplierStatement(l).closingBalance).toBe(l.closingBalance);
  });

  it('a row with no readable date is counted, before every dated row', () => {
    const w = world();
    const l = supplierLedgerOf(buildSupplierBook({ ...w, supplierPayments: [...w.supplierPayments, { id: 'sp-nodate', supplierId: 's1', amount: 1000 }] }), 's1');
    expect(l.closingBalance).toBe(2072000);
    expect(l.rows[0].sourceId).toBe('sp-nodate');
    expect(supplierStatement(l, { from: new Date('2026-11-01T00:00:00') }).closingBalance).toBe(2072000);
  });
});

describe('editing and wording', () => {
  it('the previous balance leaves out the record being edited', () => {
    const l = supplierLedgerOf(buildSupplierBook(world()), 's1');
    expect(supplierBalanceWithout(l, 'purchases', 'pu1')).toBe(l.closingBalance - 2700000);
    expect(supplierBalanceWithout(l, 'supplierPayments', 'sp1')).toBe(l.closingBalance + 2000000);
    expect(supplierBalanceWithout(l, 'purchaseReturns', 'pr1')).toBe(l.closingBalance + 27000);
    expect(supplierBalanceWithout(l, 'purchases', null)).toBe(l.closingBalance);
  });
  it('rows read as the ledger has always worded them', () => {
    const l = supplierLedgerOf(buildSupplierBook(world()), 's1');
    expect(l.rows.map(describeSupplierRow)).toEqual(['10000.00L of Diesel', 'Payment Made (Bank Transfer)', 'Return: 100.00L of Diesel', '5000.00L of Petrol']);
  });
});
