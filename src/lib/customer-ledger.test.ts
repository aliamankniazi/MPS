import { describe, expect, it } from 'vitest';
import {
  allBalances,
  balanceAfterRow,
  balanceAsOf,
  balanceBeforeRow,
  balanceWithout,
  buildCustomerLedger,
  buildLedgerBook,
  isCreditSale,
  lastActivity,
  ledgerOf,
  readAmount,
  statementFor,
  toPaisa,
  totalReceivable,
  type LedgerSources,
} from './customer-ledger';

const at = (day: string, time = '10:00:00') => new Date(`${day}T${time}`).toISOString();

/** One customer with one of everything. */
function world(): LedgerSources {
  return {
    customers: [
      { id: 'c1', name: 'Akram Transport', openingBalance: 5000 },
      { id: 'c2', name: 'Bilal', openingBalance: 0 },
      { id: 'c3', name: 'No Rows' },
    ],
    transactions: [
      { id: 't1', customerId: 'c1', totalAmount: 10000, paymentMethod: 'Credit', timestamp: at('2026-03-01') },
      { id: 't2', customerId: 'c1', totalAmount: 2500.5, paymentMethod: 'Credit', timestamp: at('2026-03-10') },
      // paid at the pump under his name: on the statement, not on the balance
      { id: 't3', customerId: 'c1', totalAmount: 4000, paymentMethod: 'Cash', timestamp: at('2026-03-11') },
      // the walk-in counter belongs to no account
      { id: 't4', customerId: 'walkin', totalAmount: 900, paymentMethod: 'Cash', timestamp: at('2026-03-11') },
      { id: 't5', totalAmount: 700, paymentMethod: 'Cash', timestamp: at('2026-03-11') },
      { id: 't6', customerId: 'c2', totalAmount: 300, paymentMethod: 'Credit', timestamp: at('2026-03-02') },
    ],
    cashAdvances: [{ id: 'a1', customerId: 'c1', amount: 1500, timestamp: at('2026-03-05') }],
    customerPayments: [
      { id: 'p1', customerId: 'c1', amount: 8000, paymentMethod: 'Cash', timestamp: at('2026-03-07') },
      { id: 'p2', customerId: 'c2', amount: 1000, paymentMethod: 'Cash', timestamp: at('2026-03-03') },
    ],
    saleReturns: [
      { id: 'r1', customerId: 'c1', totalRefund: 500, timestamp: at('2026-03-12') },
      { id: 'r2', customerId: 'walkin', totalRefund: 100, timestamp: at('2026-03-12') },
    ],
  };
}

describe('the one formula', () => {
  it('closing = opening + debits - credits', () => {
    const l = buildCustomerLedger(world(), 'c1');
    // debits: 10000 + 2500.50 + 4000 (cash sale) + 1500 advance; credits: 4000 (the cash) + 8000 + 500
    expect(l.openingBalance).toBe(5000);
    expect(l.totalDebit).toBe(18000.5);
    expect(l.totalCredit).toBe(12500);
    expect(l.closingBalance).toBe(5000 + 18000.5 - 12500);
    expect(l.closingBalance).toBe(10500.5);
  });

  it('a sale paid at the pump shows on the statement and changes nothing', () => {
    const l = buildCustomerLedger(world(), 'c1');
    const cash = l.rows.find((r) => r.sourceId === 't3')!;
    expect(cash.kind).toBe('cash-sale');
    expect(cash.debit).toBe(4000);
    expect(cash.credit).toBe(4000);
    const before = balanceBeforeRow(l, 'transactions', 't3');
    expect(balanceAfterRow(l, 'transactions', 't3')).toBe(before);
  });

  it('a sale return lowers the balance, as the Sale Return screen previews', () => {
    const base = world();
    const without = buildCustomerLedger({ ...base, saleReturns: [] }, 'c1').closingBalance;
    expect(buildCustomerLedger(base, 'c1').closingBalance).toBe(without - 500);
  });

  it('a customer in credit has a negative balance, and one with no rows sits on the opening balance', () => {
    const book = buildLedgerBook(world());
    expect(ledgerOf(book, 'c2').closingBalance).toBe(-700);
    expect(ledgerOf(book, 'c3').closingBalance).toBe(0);
    expect(ledgerOf(book, 'c3').rows).toEqual([]);
  });

  it('walk-in rows are on nobody’s balance and are not orphans', () => {
    const book = buildLedgerBook(world());
    expect(book.orphans).toEqual([]);
    const everyRow = [...book.ledgers.values()].flatMap((l) => l.rows.map((r) => r.sourceId));
    expect(everyRow).not.toContain('t4');
    expect(everyRow).not.toContain('t5');
    expect(everyRow).not.toContain('r2');
  });

  it('the running balance down the rows ends on the closing balance', () => {
    const l = buildCustomerLedger(world(), 'c1');
    let running = l.openingBalance;
    for (const row of l.rows) {
      running = Math.round((running + row.debit - row.credit) * 100) / 100;
      expect(row.balance).toBe(running);
    }
    expect(running).toBe(l.closingBalance);
  });
});

describe('every row exactly once', () => {
  it('the same document listed twice is one record', () => {
    const w = world();
    const doubled = { ...w, transactions: [...w.transactions, ...w.transactions], customerPayments: [...w.customerPayments, ...w.customerPayments] };
    expect(buildCustomerLedger(doubled, 'c1').closingBalance).toBe(buildCustomerLedger(w, 'c1').closingBalance);
    expect(buildCustomerLedger(doubled, 'c1').rows.length).toBe(buildCustomerLedger(w, 'c1').rows.length);
  });

  it('two different documents with the same figures are two records (the audit reports them, the engine does not guess)', () => {
    const w = world();
    const twin = { ...w, customerPayments: [...w.customerPayments, { ...w.customerPayments[0], id: 'p1-twin' }] };
    expect(buildCustomerLedger(twin, 'c1').closingBalance).toBe(buildCustomerLedger(w, 'c1').closingBalance - 8000);
  });

  it('the order the records arrive in never changes a figure', () => {
    const w = world();
    const reversed: LedgerSources = {
      customers: [...w.customers].reverse(),
      transactions: [...w.transactions].reverse(),
      cashAdvances: [...w.cashAdvances].reverse(),
      customerPayments: [...w.customerPayments].reverse(),
      saleReturns: [...w.saleReturns].reverse(),
    };
    const a = buildCustomerLedger(w, 'c1');
    const b = buildCustomerLedger(reversed, 'c1');
    expect(b.rows.map((r) => [r.key, r.balance])).toEqual(a.rows.map((r) => [r.key, r.balance]));
  });

  it('a row naming a customer that does not exist is an orphan, on nobody’s balance', () => {
    const w = world();
    const book = buildLedgerBook({ ...w, customerPayments: [...w.customerPayments, { id: 'p9', customerId: 'gone', amount: 250, timestamp: at('2026-03-04') }] });
    expect(book.orphans.map((r) => r.key)).toEqual(['customerPayments/p9']);
    expect(ledgerOf(book, 'c1').closingBalance).toBe(10500.5);
    expect(ledgerOf(book, 'gone').closingBalance).toBe(0);
  });
});

describe('money', () => {
  it('adds in paisa: 0.1 + 0.2 is 0.3, whatever the order', () => {
    const sources: LedgerSources = {
      customers: [{ id: 'c', openingBalance: 0 }],
      transactions: [
        { id: 'a', customerId: 'c', totalAmount: 0.1, paymentMethod: 'Credit', timestamp: at('2026-01-01') },
        { id: 'b', customerId: 'c', totalAmount: 0.2, paymentMethod: 'Credit', timestamp: at('2026-01-02') },
      ],
      customerPayments: [],
      cashAdvances: [],
      saleReturns: [],
    };
    expect(buildCustomerLedger(sources, 'c').closingBalance).toBe(0.3);
  });

  it('an amount stored as text is the number it spells, never glued on as text', () => {
    expect(readAmount('5,000.50')).toBe(5000.5);
    expect(readAmount(' 12 ')).toBe(12);
    expect(readAmount('')).toBeNull();
    expect(readAmount('abc')).toBeNull();
    expect(readAmount(undefined)).toBeNull();
    expect(readAmount(NaN)).toBeNull();
    expect(toPaisa('abc')).toBe(0);
    const sources: LedgerSources = {
      customers: [{ id: 'c', openingBalance: '1000' }],
      transactions: [{ id: 'a', customerId: 'c', totalAmount: '5000', paymentMethod: 'Credit', timestamp: at('2026-01-01') }],
      customerPayments: [{ id: 'p', customerId: 'c', amount: '2,000', timestamp: at('2026-01-02') }],
      cashAdvances: [],
      saleReturns: [],
    };
    expect(buildCustomerLedger(sources, 'c').closingBalance).toBe(4000);
  });
});

describe('credit or paid', () => {
  it('the record says', () => {
    expect(isCreditSale({ id: 'x', customerId: 'c1', paymentMethod: 'Credit' })).toBe(true);
    expect(isCreditSale({ id: 'x', customerId: 'c1', paymentMethod: 'Cash' })).toBe(false);
    expect(isCreditSale({ id: 'x', customerId: 'c1', paymentMethod: 'Card' })).toBe(false);
    // the method wins over a walk-in flag that disagrees
    expect(isCreditSale({ id: 'x', customerId: 'c1', paymentMethod: 'Credit', isWalkIn: true })).toBe(true);
  });
  it('a record with no method falls back to its walk-in flag, then to "it names an account"', () => {
    expect(isCreditSale({ id: 'x', customerId: 'c1', isWalkIn: true })).toBe(false);
    expect(isCreditSale({ id: 'x', customerId: 'c1', isWalkIn: false })).toBe(true);
    expect(isCreditSale({ id: 'x', customerId: 'c1' })).toBe(true);
  });
  it('nothing is owed by the walk-in counter', () => {
    expect(isCreditSale({ id: 'x', customerId: 'walkin', paymentMethod: 'Credit' })).toBe(false);
    expect(isCreditSale({ id: 'x', paymentMethod: 'Credit' })).toBe(false);
    expect(isCreditSale({ id: 'x', customerId: '', paymentMethod: 'Credit' })).toBe(false);
  });
});

describe('a selected date', () => {
  it('the balance at the end of a day counts that whole day and nothing after', () => {
    const l = buildCustomerLedger(world(), 'c1');
    expect(balanceAsOf(l, new Date('2026-02-28T12:00:00'))).toBe(5000);
    expect(balanceAsOf(l, new Date('2026-03-01T00:00:01'))).toBe(15000);
    expect(balanceAsOf(l, new Date('2026-03-05T00:00:01'))).toBe(16500);
    expect(balanceAsOf(l, new Date('2026-03-07T00:00:01'))).toBe(8500);
    expect(balanceAsOf(l, new Date('2026-03-31T00:00:01'))).toBe(l.closingBalance);
    expect(balanceAsOf(l, null)).toBe(l.closingBalance);
  });

  it('a statement for a period opens on the balance before it and closes on the balance as of its last day', () => {
    const l = buildCustomerLedger(world(), 'c1');
    const s = statementFor(l, { from: new Date('2026-03-05T09:00:00'), to: new Date('2026-03-10T09:00:00') });
    expect(s.openingBalance).toBe(15000);
    expect(s.rows.map((r) => r.sourceId)).toEqual(['a1', 'p1', 't2']);
    expect(s.totalDebit).toBe(4000.5);
    expect(s.totalCredit).toBe(8000);
    expect(s.closingBalance).toBe(15000 + 4000.5 - 8000);
    expect(s.closingBalance).toBe(balanceAsOf(l, new Date('2026-03-10T09:00:00')));
  });

  it('consecutive periods join: each opens where the one before closed', () => {
    const l = buildCustomerLedger(world(), 'c1');
    const first = statementFor(l, { to: new Date('2026-03-06T00:00:00') });
    const second = statementFor(l, { from: new Date('2026-03-07T00:00:00'), to: new Date('2026-03-10T00:00:00') });
    const third = statementFor(l, { from: new Date('2026-03-11T00:00:00') });
    expect(first.openingBalance).toBe(l.openingBalance);
    expect(second.openingBalance).toBe(first.closingBalance);
    expect(third.openingBalance).toBe(second.closingBalance);
    expect(third.closingBalance).toBe(l.closingBalance);
    expect(first.rows.length + second.rows.length + third.rows.length).toBe(l.rows.length);
  });

  it('a period with no rows closes on its opening balance', () => {
    const l = buildCustomerLedger(world(), 'c1');
    const s = statementFor(l, { from: new Date('2026-03-08T00:00:00'), to: new Date('2026-03-09T00:00:00') });
    expect(s.rows).toEqual([]);
    expect(s.closingBalance).toBe(s.openingBalance);
    expect(s.openingBalance).toBe(8500);
  });

  it('no period at all is the whole ledger', () => {
    const l = buildCustomerLedger(world(), 'c1');
    const s = statementFor(l);
    expect(s.openingBalance).toBe(l.openingBalance);
    expect(s.rows.length).toBe(l.rows.length);
    expect(s.closingBalance).toBe(l.closingBalance);
  });

  it('a row whose date cannot be read is still counted, before every dated row', () => {
    const w = world();
    const l = buildCustomerLedger({ ...w, cashAdvances: [...w.cashAdvances, { id: 'a-bad', customerId: 'c1', amount: 200, timestamp: 'not a date' }] }, 'c1');
    expect(l.closingBalance).toBe(10700.5);
    expect(l.rows[0].sourceId).toBe('a-bad');
    expect(l.rows[0].dated).toBe(false);
    // it is in the opening balance of any period, so list, statement and report still agree
    expect(statementFor(l, { from: new Date('2026-03-05T00:00:00') }).closingBalance).toBe(l.closingBalance);
    expect(balanceAsOf(l, new Date('2020-01-01T00:00:00'))).toBe(5200);
  });

  it('reads a Firestore timestamp and a Date as well as text', () => {
    const when = new Date('2026-03-01T10:00:00');
    const sources: LedgerSources = {
      customers: [{ id: 'c' }],
      transactions: [{ id: 'a', customerId: 'c', totalAmount: 10, paymentMethod: 'Credit', timestamp: { toDate: () => when } }],
      customerPayments: [{ id: 'p', customerId: 'c', amount: 4, timestamp: when }],
      cashAdvances: [],
      saleReturns: [],
    };
    const l = buildCustomerLedger(sources, 'c');
    expect(l.rows.every((r) => r.dated)).toBe(true);
    expect(l.closingBalance).toBe(6);
    expect(lastActivity(l)?.getTime()).toBe(when.getTime());
  });
});

describe('rows on the same instant', () => {
  it('what was taken sorts before what was paid, so a sale and its payment never swap', () => {
    const same = at('2026-04-01');
    const sources: LedgerSources = {
      customers: [{ id: 'c', openingBalance: 100 }],
      transactions: [{ id: 'zz', customerId: 'c', totalAmount: 500, paymentMethod: 'Credit', timestamp: same }],
      customerPayments: [{ id: 'aa', customerId: 'c', amount: 500, paymentMethod: 'Cash', timestamp: same }],
      cashAdvances: [],
      saleReturns: [],
    };
    const l = buildCustomerLedger(sources, 'c');
    expect(l.rows.map((r) => r.kind)).toEqual(['credit-sale', 'payment']);
    expect(balanceBeforeRow(l, 'transactions', 'zz')).toBe(100);
    expect(balanceBeforeRow(l, 'customerPayments', 'aa')).toBe(600);
  });

  it('the lines of one sale each see the lines before them', () => {
    const same = at('2026-04-01');
    const sources: LedgerSources = {
      customers: [{ id: 'c', openingBalance: 0 }],
      transactions: [
        { id: 'line-b', customerId: 'c', totalAmount: 200, paymentMethod: 'Credit', timestamp: same },
        { id: 'line-a', customerId: 'c', totalAmount: 100, paymentMethod: 'Credit', timestamp: same },
      ],
      customerPayments: [],
      cashAdvances: [],
      saleReturns: [],
    };
    const l = buildCustomerLedger(sources, 'c');
    expect(balanceBeforeRow(l, 'transactions', 'line-a')).toBe(0);
    expect(balanceAfterRow(l, 'transactions', 'line-a')).toBe(100);
    expect(balanceBeforeRow(l, 'transactions', 'line-b')).toBe(100);
    expect(balanceAfterRow(l, 'transactions', 'line-b')).toBe(300);
    expect(balanceBeforeRow(l, 'transactions', 'not-here')).toBeNull();
  });
});

describe('editing a record', () => {
  it('the previous balance leaves out the record being edited', () => {
    const l = buildCustomerLedger(world(), 'c1');
    expect(balanceWithout(l, 'transactions', 't1')).toBe(l.closingBalance - 10000);
    expect(balanceWithout(l, 'customerPayments', 'p1')).toBe(l.closingBalance + 8000);
    expect(balanceWithout(l, 'cashAdvances', 'a1')).toBe(l.closingBalance - 1500);
    expect(balanceWithout(l, 'saleReturns', 'r1')).toBe(l.closingBalance + 500);
    // a cash sale never moved the balance
    expect(balanceWithout(l, 'transactions', 't3')).toBe(l.closingBalance);
  });
  it('a record that is not this customer’s, or no record, leaves the balance as it is', () => {
    const l = buildCustomerLedger(world(), 'c1');
    expect(balanceWithout(l, 'transactions', 't6')).toBe(l.closingBalance);
    expect(balanceWithout(l, 'transactions', null)).toBe(l.closingBalance);
  });
});

describe('the whole book', () => {
  it('every customer has a balance, and the receivable adds only what is owed', () => {
    const book = buildLedgerBook(world());
    const balances = allBalances(book);
    expect([...balances.entries()]).toEqual([
      ['c1', 10500.5],
      ['c2', -700],
      ['c3', 0],
    ]);
    expect(totalReceivable(book)).toBe(10500.5);
    expect(totalReceivable(book, new Date('2026-03-02T23:00:00'))).toBe(15000 + 300);
  });

  it('a customer listed twice is one account', () => {
    const w = world();
    const book = buildLedgerBook({ ...w, customers: [...w.customers, w.customers[0]] });
    expect(book.ledgers.size).toBe(3);
    expect(ledgerOf(book, 'c1').closingBalance).toBe(10500.5);
  });
});
