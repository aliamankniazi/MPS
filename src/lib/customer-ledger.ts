/**
 * ONE ANSWER TO "WHAT DOES THIS CUSTOMER OWE?"
 *
 * Seven screens each worked the balance out their own way: the sale screen counted credit sales only and
 * ignored returns, the customers list counted cash sales as debt, the ledger subtracted returns, the unified
 * ledger left the opening balance out, the invoice skipped rows sharing its timestamp. The same customer had
 * a different balance depending on where you looked.
 *
 * So there is one calculation, here, and every screen asks it:
 *
 *     closing balance = opening balance + total debit - total credit
 *
 * WHAT IS A DEBIT AND WHAT IS A CREDIT (the rules the entry screens already work by; nothing new):
 *
 *   credit sale     debit                    the customer took goods on account
 *   cash advance    debit                    cash handed to the customer
 *   payment         credit                   money received (a salary posted to an employee's account too)
 *   sale return     credit                   goods came back; the Sale Return screen itself previews
 *                                            "new balance = balance - refund"
 *   sale paid at    debit AND credit         shown on the statement, changes nothing: the money was taken
 *   the pump                                 at the time. The New Sale screen has always counted it this way.
 *
 * Whether a sale is on credit is what the record says (`paymentMethod`), never a guess from the customer.
 *
 * EVERY ROW ONCE. A row is keyed by its collection and document id, so nothing can be counted twice. A row
 * whose date cannot be read is still money: it is counted, placed before every dated row, and reported by the
 * audit. (The old ledger dropped such a row as soon as a date range was chosen, the list kept it.)
 *
 * MONEY IS ADDED IN PAISA, as whole numbers. Adding rupees as floating point gives a different last digit
 * depending on the order of the rows, which is one more way two screens disagree. A stored amount that is
 * text ("5000") is read as the number it spells; before this, `sum + "5000"` glued it on as text.
 *
 * Pure: no React, no Firestore. The tests in customer-ledger.test.ts run it as it is.
 */

export type LedgerSource = 'transactions' | 'customerPayments' | 'cashAdvances' | 'saleReturns';

export type LedgerRowKind = 'credit-sale' | 'cash-sale' | 'cash-advance' | 'payment' | 'salary' | 'sale-return';

/** As much of each record as the calculation reads. Deliberately loose: old records lack newer fields. */
export interface CustomerLike {
  id: string;
  name?: string;
  openingBalance?: unknown;
  [key: string]: any;
}
export interface SaleLike {
  id: string;
  customerId?: string | null;
  totalAmount?: unknown;
  paymentMethod?: string | null;
  isWalkIn?: boolean | null;
  timestamp?: unknown;
  [key: string]: any;
}
export interface PaymentLike {
  id: string;
  customerId?: string | null;
  amount?: unknown;
  paymentMethod?: string | null;
  timestamp?: unknown;
  [key: string]: any;
}
export interface AdvanceLike {
  id: string;
  customerId?: string | null;
  amount?: unknown;
  timestamp?: unknown;
  [key: string]: any;
}
export interface ReturnLike {
  id: string;
  customerId?: string | null;
  totalRefund?: unknown;
  timestamp?: unknown;
  [key: string]: any;
}

export interface LedgerSources {
  customers: readonly CustomerLike[];
  transactions: readonly SaleLike[];
  customerPayments: readonly PaymentLike[];
  cashAdvances: readonly AdvanceLike[];
  saleReturns: readonly ReturnLike[];
}

export interface CustomerLedgerRow {
  /** `<collection>/<document id>`: unique across the whole book. */
  key: string;
  source: LedgerSource;
  sourceId: string;
  customerId: string;
  kind: LedgerRowKind;
  /** The record's own timestamp, as stored. */
  timestamp: string;
  /** Milliseconds; -Infinity when the date cannot be read, so the row sorts before every dated one. */
  time: number;
  dated: boolean;
  debit: number;
  credit: number;
  /** The customer's balance after this row. */
  balance: number;
  original: any;
}

export interface CustomerLedger {
  customerId: string;
  customer: CustomerLike | null;
  openingBalance: number;
  /** Oldest first. */
  rows: CustomerLedgerRow[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export interface LedgerStatement {
  /** The balance the instant before the period began. */
  openingBalance: number;
  rows: CustomerLedgerRow[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export interface CustomerLedgerBook {
  /** Every customer's ledger, by id. A customer with no rows still has one (opening = closing). */
  ledgers: Map<string, CustomerLedger>;
  /** Rows that name a customer id no customer has (a deleted customer, a mistyped id). On nobody's balance. */
  orphans: CustomerLedgerRow[];
}

/* ------------------------------------------------------------------ *
 * Money and dates
 * ------------------------------------------------------------------ */

/** The number a stored amount spells, or null when it spells none. */
export function readAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Rupees to whole paisa. Anything that is not a number is nothing. */
export function toPaisa(value: unknown): number {
  const n = readAmount(value);
  return n === null ? 0 : Math.round(n * 100);
}

const toRupees = (paisa: number): number => paisa / 100;

/** Milliseconds of a stored timestamp (an ISO string, a Date, a Firestore Timestamp), or null. */
export function readTime(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === 'object' && typeof (value as any).toDate === 'function') {
    const t = (value as any).toDate().getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** 00:00:00.000 of that day, local time. */
export function dayStart(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 23:59:59.999 of that day, local time. */
export function dayEnd(date: Date): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/* ------------------------------------------------------------------ *
 * The rules
 * ------------------------------------------------------------------ */

/** A real account, not the walk-in counter. */
export function isAccountId(customerId: unknown): customerId is string {
  return typeof customerId === 'string' && customerId !== '' && customerId !== 'walkin';
}

/**
 * Is this sale owed, or was it paid at the pump?
 *
 * The record says: `paymentMethod: 'Credit'` is owed, any other method was paid. Only a record with no
 * method at all falls back to its walk-in flag, and one with neither is owed (it names an account).
 */
export function isCreditSale(sale: SaleLike): boolean {
  if (!isAccountId(sale.customerId)) return false;
  if (typeof sale.paymentMethod === 'string' && sale.paymentMethod !== '') return sale.paymentMethod === 'Credit';
  if (typeof sale.isWalkIn === 'boolean') return !sale.isWalkIn;
  return true;
}

const KIND_ORDER: Record<LedgerRowKind, number> = {
  'credit-sale': 0,
  'cash-sale': 1,
  'cash-advance': 2,
  payment: 3,
  salary: 4,
  'sale-return': 5,
};

/**
 * Oldest first. Rows on the same instant keep one fixed order (what was taken before what was paid, then by
 * id), so the running balance down a statement and an invoice's "previous balance" are the same on every
 * screen and every device. All the lines of one sale share a timestamp; without this each line's invoice
 * left its sister lines out.
 */
function compareRows(a: CustomerLedgerRow, b: CustomerLedgerRow): number {
  if (a.time !== b.time) return a.time < b.time ? -1 : 1;
  const k = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (k !== 0) return k;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

type PaisaRow = CustomerLedgerRow & { debitPaisa: number; creditPaisa: number };

function makeRow(
  source: LedgerSource,
  record: { id: string; customerId?: string | null; timestamp?: unknown },
  kind: LedgerRowKind,
  debitPaisa: number,
  creditPaisa: number
): PaisaRow {
  const time = readTime(record.timestamp);
  return {
    key: `${source}/${record.id}`,
    source,
    sourceId: record.id,
    customerId: record.customerId as string,
    kind,
    timestamp: typeof record.timestamp === 'string' ? record.timestamp : time === null ? '' : new Date(time).toISOString(),
    time: time === null ? -Infinity : time,
    dated: time !== null,
    debit: toRupees(debitPaisa),
    credit: toRupees(creditPaisa),
    balance: 0,
    original: record,
    debitPaisa,
    creditPaisa,
  };
}

/**
 * Every customer's ledger from the five record sets, in one pass over each.
 *
 * A record is read once, by its own document id, into the one account its `customerId` names. Walk-in rows
 * belong to no account and are left out. A row naming an account that does not exist is an orphan.
 */
export function buildLedgerBook(sources: LedgerSources): CustomerLedgerBook {
  const byCustomer = new Map<string, PaisaRow[]>();
  const seen = new Set<string>();
  const push = (row: PaisaRow) => {
    if (seen.has(row.key)) return; // the same document listed twice is still one record
    seen.add(row.key);
    const list = byCustomer.get(row.customerId);
    if (list) list.push(row);
    else byCustomer.set(row.customerId, [row]);
  };

  for (const tx of sources.transactions ?? []) {
    if (!isAccountId(tx.customerId)) continue;
    const amount = toPaisa(tx.totalAmount);
    const onCredit = isCreditSale(tx);
    push(makeRow('transactions', tx, onCredit ? 'credit-sale' : 'cash-sale', amount, onCredit ? 0 : amount));
  }
  for (const ca of sources.cashAdvances ?? []) {
    if (!isAccountId(ca.customerId)) continue;
    push(makeRow('cashAdvances', ca, 'cash-advance', toPaisa(ca.amount), 0));
  }
  for (const p of sources.customerPayments ?? []) {
    if (!isAccountId(p.customerId)) continue;
    push(makeRow('customerPayments', p, p.paymentMethod === 'Salary' ? 'salary' : 'payment', 0, toPaisa(p.amount)));
  }
  for (const sr of sources.saleReturns ?? []) {
    if (!isAccountId(sr.customerId)) continue;
    push(makeRow('saleReturns', sr, 'sale-return', 0, toPaisa(sr.totalRefund)));
  }

  const ledgers = new Map<string, CustomerLedger>();
  for (const customer of sources.customers ?? []) {
    if (ledgers.has(customer.id)) continue;
    ledgers.set(customer.id, finishLedger(customer.id, customer, byCustomer.get(customer.id) ?? []));
    byCustomer.delete(customer.id);
  }

  const orphans: CustomerLedgerRow[] = [];
  for (const rows of byCustomer.values()) {
    for (const row of rows.sort(compareRows)) orphans.push(strip(row));
  }
  orphans.sort(compareRows);
  return { ledgers, orphans };
}

function strip(row: PaisaRow): CustomerLedgerRow {
  const { debitPaisa: _d, creditPaisa: _c, ...rest } = row;
  return rest;
}

function finishLedger(customerId: string, customer: CustomerLike | null, rows: PaisaRow[]): CustomerLedger {
  const opening = toPaisa(customer?.openingBalance);
  let running = opening;
  let debit = 0;
  let credit = 0;
  const out: CustomerLedgerRow[] = [];
  for (const row of rows.sort(compareRows)) {
    running += row.debitPaisa - row.creditPaisa;
    debit += row.debitPaisa;
    credit += row.creditPaisa;
    out.push({ ...strip(row), balance: toRupees(running) });
  }
  return {
    customerId,
    customer,
    openingBalance: toRupees(opening),
    rows: out,
    totalDebit: toRupees(debit),
    totalCredit: toRupees(credit),
    closingBalance: toRupees(running),
  };
}

const EMPTY_SOURCES: LedgerSources = { customers: [], transactions: [], customerPayments: [], cashAdvances: [], saleReturns: [] };

/** The ledger of one customer; an id nobody has gives an empty ledger at zero. */
export function ledgerOf(book: CustomerLedgerBook, customerId: string | null | undefined): CustomerLedger {
  const found = customerId ? book.ledgers.get(customerId) : undefined;
  return found ?? finishLedger(customerId ?? '', null, []);
}

/** One customer's ledger without building the whole book (the tests use it; screens use the book). */
export function buildCustomerLedger(sources: LedgerSources, customerId: string): CustomerLedger {
  return ledgerOf(buildLedgerBook({ ...EMPTY_SOURCES, ...sources }), customerId);
}

/* ------------------------------------------------------------------ *
 * Reading a ledger
 * ------------------------------------------------------------------ */

/** What the customer owes now: every row counted. Positive is owed to us, negative is paid ahead. */
export function currentBalance(ledger: CustomerLedger): number {
  return ledger.closingBalance;
}

/**
 * The balance at the END of that day: the opening balance and every row up to and including it.
 * A row without a readable date counts on every day (it is on the books; only its day is unknown).
 */
export function balanceAsOf(ledger: CustomerLedger, date: Date | null | undefined): number {
  if (!date) return ledger.closingBalance;
  const end = dayEnd(date);
  let balance = ledger.openingBalance;
  for (const row of ledger.rows) {
    if (row.time > end) break;
    balance = row.balance;
  }
  return balance;
}

/**
 * The period `from`..`to`, whole days, either end optional.
 *
 * Its opening balance is the balance the instant before `from`, its rows carry the SAME running balance they
 * have on the full ledger, and its closing balance is `balanceAsOf(to)`. So a statement for any period ends
 * on the figure every other screen shows for that date.
 */
export function statementFor(ledger: CustomerLedger, range?: { from?: Date | null; to?: Date | null } | null): LedgerStatement {
  const start = range?.from ? dayStart(range.from) : -Infinity;
  const end = range?.to ? dayEnd(range.to) : Infinity;
  let opening = ledger.openingBalance;
  const rows: CustomerLedgerRow[] = [];
  let debit = 0;
  let credit = 0;
  for (const row of ledger.rows) {
    if (row.time < start) {
      opening = row.balance;
      continue;
    }
    if (row.time > end) break;
    rows.push(row);
    debit += Math.round(row.debit * 100);
    credit += Math.round(row.credit * 100);
  }
  const closing = rows.length ? rows[rows.length - 1].balance : opening;
  return { openingBalance: opening, rows, totalDebit: toRupees(debit), totalCredit: toRupees(credit), closingBalance: closing };
}

/** The balance just before one row was entered (an invoice's "previous balance"). Null: the row is not here. */
export function balanceBeforeRow(ledger: CustomerLedger, source: LedgerSource, sourceId: string): number | null {
  const key = `${source}/${sourceId}`;
  let before = ledger.openingBalance;
  for (const row of ledger.rows) {
    if (row.key === key) return before;
    before = row.balance;
  }
  return null;
}

/** The balance just after one row (an invoice's "current balance"). Null: the row is not here. */
export function balanceAfterRow(ledger: CustomerLedger, source: LedgerSource, sourceId: string): number | null {
  const key = `${source}/${sourceId}`;
  const row = ledger.rows.find((r) => r.key === key);
  return row ? row.balance : null;
}

/**
 * The current balance as if one record had never been entered. An edit screen shows this as the "previous
 * balance", so the record being edited is not counted once from the books and again from the form.
 */
export function balanceWithout(ledger: CustomerLedger, source: LedgerSource, sourceId: string | null | undefined): number {
  if (!sourceId) return ledger.closingBalance;
  const key = `${source}/${sourceId}`;
  const row = ledger.rows.find((r) => r.key === key);
  if (!row) return ledger.closingBalance;
  return toRupees(Math.round(ledger.closingBalance * 100) - Math.round(row.debit * 100) + Math.round(row.credit * 100));
}

/** When the customer last had any dated entry, or null. */
export function lastActivity(ledger: CustomerLedger): Date | null {
  for (let i = ledger.rows.length - 1; i >= 0; i--) {
    if (ledger.rows[i].dated) return new Date(ledger.rows[i].time);
  }
  return null;
}

/** Every customer's balance at the end of `asOf` (now, when absent). */
export function allBalances(book: CustomerLedgerBook, asOf?: Date | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, ledger] of book.ledgers) out.set(id, balanceAsOf(ledger, asOf));
  return out;
}

/** What is owed to the business in total: the sum of the balances that are owed, never netted against advances. */
export function totalReceivable(book: CustomerLedgerBook, asOf?: Date | null): number {
  let paisa = 0;
  for (const ledger of book.ledgers.values()) {
    const b = Math.round(balanceAsOf(ledger, asOf) * 100);
    if (b > 0) paisa += b;
  }
  return toRupees(paisa);
}

/* ------------------------------------------------------------------ *
 * Wording
 * ------------------------------------------------------------------ */

const litres = (value: unknown): string | null => {
  const n = readAmount(value);
  return n === null || n === 0 ? null : n.toFixed(2);
};

/** What a row is, in the words the ledger has always used. One wording, so a statement and a report read alike. */
export function describeRow(row: CustomerLedgerRow): string {
  const o = row.original ?? {};
  switch (row.kind) {
    case 'credit-sale':
    case 'cash-sale': {
      const qty = litres(o.volume);
      return qty ? `${qty}L of ${o.fuelType ?? o.product ?? 'fuel'}` : o.product || 'General Sale';
    }
    case 'payment':
      return o.notes || `Payment Received${o.paymentMethod ? ` (${o.paymentMethod})` : ''}`;
    case 'salary':
      return o.notes || 'Salary payment';
    case 'cash-advance':
      return o.notes || 'Cash Advance';
    case 'sale-return': {
      const qty = litres(o.volume);
      return qty ? `Return: ${qty}L of ${o.fuelType ?? 'fuel'}` : 'Sale Return';
    }
  }
}

/** The label shown in a ledger's "type" column. */
export function rowTypeLabel(row: CustomerLedgerRow): string {
  switch (row.kind) {
    case 'credit-sale':
      return 'Credit Sale';
    case 'cash-sale':
      return 'Cash Sale';
    case 'payment':
      return 'Payment';
    case 'salary':
      return 'Salary';
    case 'cash-advance':
      return 'Cash Advance';
    case 'sale-return':
      return 'Sale Return';
  }
}
