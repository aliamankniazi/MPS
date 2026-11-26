import { describe, expect, it } from 'vitest';
import { auditCustomers } from './customer-audit';
import { buildLedgerBook, ledgerOf, type LedgerSources } from './customer-ledger';

const at = (day: string, time = '10:00:00') => new Date(`${day}T${time}`).toISOString();
const NOW = new Date('2026-06-01T12:00:00');

function clean(): LedgerSources {
  return {
    customers: [
      { id: 'c1', name: 'Akram Transport', openingBalance: 5000 },
      { id: 'c2', name: 'Bilal', openingBalance: 0 },
    ],
    transactions: [
      { id: 't1', customerId: 'c1', totalAmount: 10000, paymentMethod: 'Credit', isWalkIn: false, timestamp: at('2026-03-01') },
      { id: 't2', customerId: 'walkin', totalAmount: 900, paymentMethod: 'Cash', isWalkIn: true, timestamp: at('2026-03-02') },
      { id: 't3', customerId: 'c2', totalAmount: 300, paymentMethod: 'Credit', isWalkIn: false, timestamp: at('2026-03-02') },
    ],
    cashAdvances: [{ id: 'a1', customerId: 'c1', amount: 1500, timestamp: at('2026-03-05') }],
    customerPayments: [{ id: 'p1', customerId: 'c1', amount: 8000, paymentMethod: 'Cash', timestamp: at('2026-03-07') }],
    saleReturns: [],
  };
}

const codes = (sources: LedgerSources) => auditCustomers(sources, { now: NOW }).issues.map((i) => i.code);

describe('a clean book', () => {
  it('has no issues, every customer verified, and nothing changed from the old screens', () => {
    const r = auditCustomers(clean(), { now: NOW });
    expect(r.issues).toEqual([]);
    expect(r.verified).toBe(true);
    expect(r.totals.verifiedCustomers).toBe(2);
    expect(r.totals.changedCustomers).toBe(0);
    expect(r.lines.map((l) => [l.customerId, l.closingBalance])).toEqual([
      ['c1', 8500],
      ['c2', 300],
    ]);
  });

  it('the control total holds: openings + debits - credits = closings = receivable - paid ahead', () => {
    const w = clean();
    w.customerPayments = [...w.customerPayments, { id: 'p2', customerId: 'c2', amount: 1000, paymentMethod: 'Cash', timestamp: at('2026-03-08') }];
    const t = auditCustomers(w, { now: NOW }).totals;
    expect(t.openingBalances + t.debits - t.credits).toBe(t.closingBalances);
    expect(t.receivable - t.paidAhead).toBe(t.closingBalances);
    expect(t.receivable).toBe(8500);
    expect(t.paidAhead).toBe(700);
  });

  it('every line is the figure every screen shows', () => {
    const w = clean();
    const book = buildLedgerBook(w);
    for (const line of auditCustomers(w, { now: NOW }).lines) {
      expect(line.closingBalance).toBe(ledgerOf(book, line.customerId).closingBalance);
      expect(line.openingBalance + line.totalDebit - line.totalCredit).toBe(line.closingBalance);
    }
  });
});

describe('what the screens used to show', () => {
  it('a sale return: the sale screen and the list ignored it, the ledger took it off', () => {
    const w = clean();
    w.saleReturns = [{ id: 'r1', customerId: 'c1', totalRefund: 500, timestamp: at('2026-03-09') }];
    const line = auditCustomers(w, { now: NOW }).lines.find((l) => l.customerId === 'c1')!;
    expect(line.closingBalance).toBe(8000);
    expect(line.was).toEqual({ saleScreen: 8500, customersList: 8500, ledgerPage: 8000 });
    expect(line.changed).toBe(true);
    expect(line.verified).toBe(true);
  });

  it('a sale paid at the pump under an account: three screens, three figures', () => {
    const w = clean();
    // an older record: paid in cash, no walk-in flag
    w.transactions = [...w.transactions, { id: 't9', customerId: 'c1', totalAmount: 4000, paymentMethod: 'Cash', timestamp: at('2026-03-10') }];
    const r = auditCustomers(w, { now: NOW });
    const line = r.lines.find((l) => l.customerId === 'c1')!;
    expect(line.closingBalance).toBe(8500);
    expect(line.was).toEqual({ saleScreen: 8500, customersList: 12500, ledgerPage: 12500 });
    expect(line.changed).toBe(true);
    const note = r.issues.find((i) => i.code === 'cash-sale-on-account')!;
    expect(note.severity).toBe('note');
    expect(note.amount).toBe(4000);
    expect(note.records).toEqual(['transactions/t9']);
  });
});

describe('what it finds in the records', () => {
  it('an entry for a customer that no longer exists', () => {
    const w = clean();
    w.customerPayments = [...w.customerPayments, { id: 'p9', customerId: 'gone', customerName: 'Old Name', amount: 250, timestamp: at('2026-03-04') }];
    const r = auditCustomers(w, { now: NOW });
    const issue = r.issues.find((i) => i.code === 'orphan-row')!;
    expect(issue.severity).toBe('problem');
    expect(issue.records).toEqual(['customerPayments/p9']);
    expect(issue.message).toContain('Old Name');
    expect(r.totals.orphanRows).toBe(1);
    expect(r.totals.orphanAmount).toBe(250);
    expect(r.verified).toBe(true); // the balances that exist still add up
  });

  it('two identical records are reported once, never removed', () => {
    const w = clean();
    w.customerPayments = [...w.customerPayments, { ...w.customerPayments[0], id: 'p1-twin' }];
    const r = auditCustomers(w, { now: NOW });
    const dup = r.issues.filter((i) => i.code === 'possible-duplicate');
    expect(dup.length).toBe(1);
    expect(dup[0].records.sort()).toEqual(['customerPayments/p1', 'customerPayments/p1-twin']);
    expect(dup[0].amount).toBe(8000);
    // both still count: the audit reports, a person decides
    expect(r.lines.find((l) => l.customerId === 'c1')!.closingBalance).toBe(500);
  });

  it('the same amount at a different time is not a duplicate, nor a different product at the same time', () => {
    const w = clean();
    w.customerPayments = [...w.customerPayments, { ...w.customerPayments[0], id: 'p-later', timestamp: at('2026-03-07', '10:00:01') }];
    w.transactions = [
      ...w.transactions,
      { id: 'la', customerId: 'c1', totalAmount: 100, paymentMethod: 'Credit', isWalkIn: false, fuelType: 'Diesel', volume: 1, timestamp: at('2026-04-01') },
      { id: 'lb', customerId: 'c1', totalAmount: 100, paymentMethod: 'Credit', isWalkIn: false, fuelType: 'Mobil Oil', volume: 1, timestamp: at('2026-04-01') },
    ];
    expect(codes(w)).not.toContain('possible-duplicate');
  });

  it('amounts that are missing, text, or negative', () => {
    const w = clean();
    w.cashAdvances = [
      ...w.cashAdvances,
      { id: 'a-none', customerId: 'c1', timestamp: at('2026-03-06') },
      { id: 'a-text', customerId: 'c1', amount: '200', timestamp: at('2026-03-06', '11:00:00') },
      { id: 'a-neg', customerId: 'c1', amount: -50, timestamp: at('2026-03-06', '12:00:00') },
    ];
    const r = auditCustomers(w, { now: NOW });
    expect(r.issues.map((i) => i.code).sort()).toEqual(['amount-not-a-number', 'amount-stored-as-text', 'negative-amount']);
    expect(r.lines.find((l) => l.customerId === 'c1')!.closingBalance).toBe(8500 + 200 - 50);
    expect(r.verified).toBe(true);
  });

  it('dates that are missing or in the future', () => {
    const w = clean();
    w.customerPayments = [
      ...w.customerPayments,
      { id: 'p-nodate', customerId: 'c1', amount: 10, timestamp: null },
      { id: 'p-future', customerId: 'c1', amount: 20, timestamp: at('2027-01-01') },
    ];
    expect(codes(w).sort()).toEqual(['future-date', 'no-date']);
  });

  it('a credit sale that names no account, a flag that disagrees, a sale with no method', () => {
    const w = clean();
    w.transactions = [
      ...w.transactions,
      { id: 'x1', customerId: 'walkin', customerName: 'Walk-in Customer', totalAmount: 700, paymentMethod: 'Credit', timestamp: at('2026-03-03') },
      { id: 'x2', customerId: 'c1', totalAmount: 60, paymentMethod: 'Credit', isWalkIn: true, timestamp: at('2026-03-03', '11:00:00') },
      { id: 'x3', customerId: 'c1', totalAmount: 40, timestamp: at('2026-03-03', '12:00:00') },
    ];
    const r = auditCustomers(w, { now: NOW });
    expect(r.issues.map((i) => i.code).sort()).toEqual(['credit-sale-without-account', 'flag-disagrees-with-method', 'sale-without-method']);
    expect(r.issues.find((i) => i.code === 'credit-sale-without-account')!.severity).toBe('problem');
    // the method is followed, and a sale with no method that names an account is owed
    expect(r.lines.find((l) => l.customerId === 'c1')!.closingBalance).toBe(8500 + 60 + 40);
  });

  it('an opening balance that is not a number, and two accounts with one name', () => {
    const w = clean();
    w.customers = [...w.customers, { id: 'c3', name: ' akram  transport ', openingBalance: 'abc' }];
    const r = auditCustomers(w, { now: NOW });
    expect(r.issues.filter((i) => i.code === 'opening-not-a-number').map((i) => i.customerId)).toEqual(['c3']);
    expect(r.issues.filter((i) => i.code === 'same-name-twice').map((i) => i.customerId).sort()).toEqual(['c1', 'c3']);
    expect(r.lines.find((l) => l.customerId === 'c3')!.closingBalance).toBe(0);
  });

  it('problems are listed before things to check, before notes', () => {
    const w = clean();
    w.transactions = [...w.transactions, { id: 't9', customerId: 'c1', totalAmount: 4000, paymentMethod: 'Cash', timestamp: at('2026-03-10') }];
    w.customerPayments = [...w.customerPayments, { id: 'p9', customerId: 'gone', amount: 250, timestamp: at('2026-03-04') }, { id: 'p-nodate', customerId: 'c1', amount: 10 }];
    expect(auditCustomers(w, { now: NOW }).issues.map((i) => i.severity)).toEqual(['problem', 'check', 'note']);
  });
});

describe('a selected date', () => {
  it('the audit as of a day is the balance at the end of that day, still verified', () => {
    const r = auditCustomers(clean(), { asOf: new Date('2026-03-05T08:00:00'), now: NOW });
    const line = r.lines.find((l) => l.customerId === 'c1')!;
    expect(line.closingBalance).toBe(16500);
    expect(line.totalDebit).toBe(11500);
    expect(line.totalCredit).toBe(0);
    expect(line.rows).toBe(2);
    expect(line.changed).toBe(false);
    expect(r.verified).toBe(true);
    expect(r.totals.receivable).toBe(16800);
  });
});
