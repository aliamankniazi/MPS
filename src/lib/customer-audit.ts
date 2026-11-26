/**
 * THE BALANCE AUDIT: every customer's balance, proved, with everything in the records that looks wrong.
 *
 * It READS. It never changes a record and never writes a balance: a balance here is not stored anywhere, it
 * is always the opening balance and the rows added up (lib/customer-ledger.ts). What the audit finds in the
 * records (a row entered twice, a payment naming a deleted customer) is listed for a person to decide.
 *
 * Three things for each customer:
 *
 *   1. THE FIGURE     opening + debits - credits, from the one calculation every screen now uses.
 *   2. THE PROOF      the same balance added up a second, separate way (straight sums over each collection),
 *                     which must come to the same paisa. `verified` is that comparison, not an assumption.
 *   3. WHAT IT USED   what the sale screen, the customers list and the customer's ledger each showed before
 *      TO SHOW        they shared one calculation, so a changed figure can be explained row by row.
 *
 * Pure: no React, no Firestore.
 */
import {
  balanceAsOf,
  buildLedgerBook,
  dayEnd,
  isAccountId,
  isCreditSale,
  ledgerOf,
  readAmount,
  readTime,
  statementFor,
  toPaisa,
  type CustomerLedgerRow,
  type LedgerSource,
  type LedgerSources,
} from './customer-ledger';
import { storedValue } from './normalise-record';

export type IssueSeverity = 'problem' | 'check' | 'note';

export type IssueCode =
  | 'orphan-row'
  | 'possible-duplicate'
  | 'amount-not-a-number'
  | 'amount-stored-as-text'
  | 'negative-amount'
  | 'no-date'
  | 'future-date'
  | 'credit-sale-without-account'
  | 'cash-sale-on-account'
  | 'flag-disagrees-with-method'
  | 'sale-without-method'
  | 'opening-not-a-number'
  | 'same-name-twice';

export interface AuditIssue {
  code: IssueCode;
  severity: IssueSeverity;
  /** The account it concerns, when it concerns one. */
  customerId: string | null;
  customerName: string;
  /** `<collection>/<id>` of every record involved. */
  records: string[];
  /** Money involved, in rupees. */
  amount: number;
  message: string;
}

export interface CustomerAuditLine {
  customerId: string;
  name: string;
  area: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  rows: number;
  /** The second, separate adding-up came to the same paisa. */
  verified: boolean;
  /** What three screens showed before they shared one calculation (current balance, all dates). */
  was: { saleScreen: number; customersList: number; ledgerPage: number };
  /** One of those three differed from today's figure. Only meaningful without an "as of" date. */
  changed: boolean;
  issues: number;
}

export interface AuditReport {
  asOf: Date | null;
  lines: CustomerAuditLine[];
  issues: AuditIssue[];
  totals: {
    customers: number;
    rowsChecked: number;
    /** Sum of the balances that are owed to the business. */
    receivable: number;
    /** Sum of what customers have paid ahead (shown positive). */
    paidAhead: number;
    openingBalances: number;
    debits: number;
    credits: number;
    /** openingBalances + debits - credits. Equals receivable - paidAhead when the book adds up. */
    closingBalances: number;
    verifiedCustomers: number;
    changedCustomers: number;
    orphanRows: number;
    orphanAmount: number;
  };
  /** Every customer verified AND the control total holds. */
  verified: boolean;
}

const rupees = (paisa: number) => paisa / 100;
const text = (v: unknown) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
const plainNumber = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const SOURCE_NAME: Record<LedgerSource, string> = {
  transactions: 'sale',
  customerPayments: 'payment',
  cashAdvances: 'cash advance',
  saleReturns: 'sale return',
};

const AMOUNT_FIELD: Record<LedgerSource, string> = {
  transactions: 'totalAmount',
  customerPayments: 'amount',
  cashAdvances: 'amount',
  saleReturns: 'totalRefund',
};

const money = (n: number) => `PKR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The balance added up the plain way: one sum per collection, no ledger, no ordering.
 * Deliberately shares nothing with buildLedgerBook but the rules for reading a figure and a sale.
 */
function independentBalancePaisa(sources: LedgerSources, customerId: string, opening: unknown, endMs: number): number {
  const within = (timestamp: unknown) => {
    const t = readTime(timestamp);
    return t === null || t <= endMs;
  };
  let total = toPaisa(opening);
  const seen = new Set<string>();
  const once = (key: string) => (seen.has(key) ? false : (seen.add(key), true));
  for (const tx of sources.transactions) {
    if (tx.customerId !== customerId || !within(tx.timestamp) || !once(`t/${tx.id}`)) continue;
    if (isCreditSale(tx)) total += toPaisa(tx.totalAmount);
  }
  for (const ca of sources.cashAdvances) {
    if (ca.customerId !== customerId || !within(ca.timestamp) || !once(`a/${ca.id}`)) continue;
    total += toPaisa(ca.amount);
  }
  for (const p of sources.customerPayments) {
    if (p.customerId !== customerId || !within(p.timestamp) || !once(`p/${p.id}`)) continue;
    total -= toPaisa(p.amount);
  }
  for (const sr of sources.saleReturns) {
    if (sr.customerId !== customerId || !within(sr.timestamp) || !once(`r/${sr.id}`)) continue;
    total -= toPaisa(sr.totalRefund);
  }
  return total;
}

/** What the three old formulas showed, exactly as each screen worked it out. */
function oldFigures(sources: LedgerSources, customerId: string, opening: unknown) {
  const open = plainNumber(opening);
  const sales = sources.transactions.filter((tx) => tx.customerId === customerId);
  const allSales = sales.reduce((s, tx) => s + plainNumber(tx.totalAmount), 0);
  const creditMethodSales = sales.filter((tx) => tx.paymentMethod === 'Credit').reduce((s, tx) => s + plainNumber(tx.totalAmount), 0);
  const flaggedCash = sales
    .filter((tx) => tx.isWalkIn ?? (!tx.customerId || tx.customerId === 'walkin'))
    .reduce((s, tx) => s + plainNumber(tx.totalAmount), 0);
  const advances = sources.cashAdvances.filter((ca) => ca.customerId === customerId).reduce((s, ca) => s + plainNumber(ca.amount), 0);
  const payments = sources.customerPayments.filter((p) => p.customerId === customerId).reduce((s, p) => s + plainNumber(p.amount), 0);
  const returns = sources.saleReturns.filter((sr) => sr.customerId === customerId).reduce((s, sr) => s + plainNumber(sr.totalRefund), 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    // New Sale, Payment, Cash Advance, Sale Return screens: credit sales only, returns ignored.
    saleScreen: round(open + creditMethodSales + advances - payments),
    // Customers list, Defaulter report, Dashboard, Credit Recovery, invoice: every sale, returns ignored.
    customersList: round(open + allSales + advances - payments),
    // Customer's ledger: every sale, a cash sale cancelled only when flagged walk-in, returns taken off.
    ledgerPage: round(open + allSales - flaggedCash + advances - payments - returns),
  };
}

function duplicateSignature(row: CustomerLedgerRow): string {
  const o = row.original ?? {};
  const what = row.source === 'transactions' ? `${text(o.fuelType ?? o.product)}|${toPaisa(o.volume)}|${text(o.paymentMethod)}` : '';
  return [row.source, row.customerId, Math.round(row.debit * 100), Math.round(row.credit * 100), row.time, what].join('|');
}

export function auditCustomers(sources: LedgerSources, options?: { asOf?: Date | null; now?: Date }): AuditReport {
  const asOf = options?.asOf ?? null;
  const now = options?.now ?? new Date();
  const endMs = asOf ? dayEnd(asOf) : Infinity;
  const book = buildLedgerBook(sources);
  const issues: AuditIssue[] = [];
  const nameOf = (id: string | null) => (id ? text(book.ledgers.get(id)?.customer?.name) || '(unknown account)' : 'Walk-in');
  const add = (code: IssueCode, severity: IssueSeverity, customerId: string | null, records: string[], amount: number, message: string) =>
    issues.push({ code, severity, customerId, customerName: nameOf(customerId), records, amount, message });

  /* ---- records on an account: each row once ---- */
  const allRows: CustomerLedgerRow[] = [];
  for (const ledger of book.ledgers.values()) allRows.push(...ledger.rows);

  const tomorrow = now.getTime() + 24 * 60 * 60 * 1000;
  const bySignature = new Map<string, CustomerLedgerRow[]>();
  for (const row of [...allRows, ...book.orphans]) {
    const raw = storedValue(row.original, AMOUNT_FIELD[row.source]);
    const amount = Math.max(row.debit, row.credit);
    const kind = SOURCE_NAME[row.source];
    const read = readAmount(raw);
    if (read === null) {
      add('amount-not-a-number', 'problem', row.customerId, [row.key], 0, `A ${kind} has no readable amount (stored: ${JSON.stringify(raw ?? null)}). It counts as nothing until the amount is entered.`);
    } else if (typeof raw === 'string') {
      add('amount-stored-as-text', 'check', row.customerId, [row.key], amount, `A ${kind} of ${money(read)} is stored as text. It is now read as the number; the old screens glued it onto the total as text.`);
    }
    if (read !== null && read < 0) {
      add('negative-amount', 'check', row.customerId, [row.key], read, `A ${kind} has a negative amount (${money(read)}), which turns it into its opposite.`);
    }
    if (!row.dated) {
      add('no-date', 'check', row.customerId, [row.key], amount, `A ${kind} of ${money(amount)} has no readable date. It is counted in the balance; the old ledger dropped it whenever a date range was chosen.`);
    } else if (row.time > tomorrow) {
      add('future-date', 'check', row.customerId, [row.key], amount, `A ${kind} of ${money(amount)} is dated in the future (${new Date(row.time).toDateString()}).`);
    }
    if (row.dated) {
      const sig = duplicateSignature(row);
      const list = bySignature.get(sig);
      if (list) list.push(row);
      else bySignature.set(sig, [row]);
    }
  }
  for (const group of bySignature.values()) {
    if (group.length < 2) continue;
    const first = group[0];
    const amount = Math.max(first.debit, first.credit);
    add(
      'possible-duplicate',
      'check',
      first.customerId,
      group.map((r) => r.key),
      amount * (group.length - 1),
      `${group.length} ${SOURCE_NAME[first.source]} records are identical: same account, same amount (${money(amount)}), same date and time. If it was entered once, the extra ${group.length - 1} overstate${group.length - 1 === 1 ? 's' : ''} the account by ${money(amount * (group.length - 1))}.`
    );
  }

  /* ---- records on nobody's account ---- */
  for (const row of book.orphans) {
    const amount = Math.max(row.debit, row.credit);
    add('orphan-row', 'problem', row.customerId, [row.key], amount, `A ${SOURCE_NAME[row.source]} of ${money(amount)} names a customer that no longer exists (id ${row.customerId}, recorded name "${text(row.original?.customerName)}"). It is on nobody's balance.`);
  }

  /* ---- sales: credit or paid ---- */
  for (const tx of sources.transactions) {
    const amount = rupees(toPaisa(tx.totalAmount));
    const key = `transactions/${tx.id}`;
    const account = isAccountId(tx.customerId) ? tx.customerId : null;
    const hasMethod = typeof tx.paymentMethod === 'string' && tx.paymentMethod !== '';
    if (!account && tx.paymentMethod === 'Credit') {
      add('credit-sale-without-account', 'problem', null, [key], amount, `A credit sale of ${money(amount)} names no customer account (recorded name "${text(tx.customerName)}"). It is owed by nobody on the books.`);
    }
    if (!account) continue;
    if (!book.ledgers.has(account)) continue; // an orphan, reported above
    if (!hasMethod) {
      add('sale-without-method', 'note', account, [key], amount, `A sale of ${money(amount)} has no payment method recorded. It is treated as ${isCreditSale(tx) ? 'a credit sale (owed)' : 'paid at the time'}.`);
    } else if (tx.paymentMethod !== 'Credit') {
      add('cash-sale-on-account', 'note', account, [key], amount, `A sale of ${money(amount)} under this account was paid by ${tx.paymentMethod} at the time. It shows on the statement and is not owed. The customers list used to count it as debt.`);
    }
    if (hasMethod && typeof tx.isWalkIn === 'boolean' && tx.isWalkIn === (tx.paymentMethod === 'Credit')) {
      add('flag-disagrees-with-method', 'check', account, [key], amount, `A sale of ${money(amount)} is recorded as "${tx.paymentMethod}" but flagged ${tx.isWalkIn ? 'walk-in' : 'on account'}. The payment method is followed.`);
    }
  }

  /* ---- customers ---- */
  const byName = new Map<string, string[]>();
  for (const c of sources.customers) {
    const key = text(c.name).trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) continue;
    const list = byName.get(key);
    if (list) {
      if (!list.includes(c.id)) list.push(c.id);
    } else byName.set(key, [c.id]);
    const opening = storedValue(c, 'openingBalance');
    if (opening !== undefined && opening !== null && opening !== '' && readAmount(opening) === null) {
      add('opening-not-a-number', 'problem', c.id, [`customers/${c.id}`], 0, `The opening balance is not a number (stored: ${JSON.stringify(opening)}). It counts as zero until corrected.`);
    }
  }
  for (const ids of byName.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      add('same-name-twice', 'check', id, ids.map((i) => `customers/${i}`), 0, `${ids.length} customer accounts share this name. If they are one person, their sales and payments are split between the accounts.`);
    }
  }

  /* ---- one line per customer ---- */
  const issueCount = new Map<string, number>();
  for (const issue of issues) if (issue.customerId) issueCount.set(issue.customerId, (issueCount.get(issue.customerId) ?? 0) + 1);

  const lines: CustomerAuditLine[] = [];
  let receivable = 0;
  let paidAhead = 0;
  let openings = 0;
  let debits = 0;
  let credits = 0;
  let closings = 0;
  let rowsChecked = 0;
  const done = new Set<string>();
  for (const customer of sources.customers) {
    if (done.has(customer.id)) continue;
    done.add(customer.id);
    const ledger = ledgerOf(book, customer.id);
    const statement = statementFor(ledger, { to: asOf });
    const closing = asOf ? balanceAsOf(ledger, asOf) : ledger.closingBalance;
    const closingPaisa = Math.round(closing * 100);
    const verified =
      independentBalancePaisa(sources, customer.id, customer.openingBalance, endMs) === closingPaisa &&
      Math.round(statement.openingBalance * 100) + Math.round(statement.totalDebit * 100) - Math.round(statement.totalCredit * 100) === closingPaisa;
    const was = oldFigures(sources, customer.id, customer.openingBalance);
    const changed = !asOf && [was.saleScreen, was.customersList, was.ledgerPage].some((v) => Math.round(v * 100) !== closingPaisa);
    lines.push({
      customerId: customer.id,
      name: text(customer.name) || '(no name)',
      area: text(customer.area),
      openingBalance: statement.openingBalance,
      totalDebit: statement.totalDebit,
      totalCredit: statement.totalCredit,
      closingBalance: closing,
      rows: statement.rows.length,
      verified,
      was,
      changed,
      issues: issueCount.get(customer.id) ?? 0,
    });
    rowsChecked += statement.rows.length;
    openings += Math.round(statement.openingBalance * 100);
    debits += Math.round(statement.totalDebit * 100);
    credits += Math.round(statement.totalCredit * 100);
    closings += closingPaisa;
    if (closingPaisa > 0) receivable += closingPaisa;
    else paidAhead += -closingPaisa;
  }
  lines.sort((a, b) => b.closingBalance - a.closingBalance || a.name.localeCompare(b.name));

  const order: Record<IssueSeverity, number> = { problem: 0, check: 1, note: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity] || b.amount - a.amount || a.customerName.localeCompare(b.customerName));

  const verifiedCustomers = lines.filter((l) => l.verified).length;
  const controlHolds = openings + debits - credits === closings && receivable - paidAhead === closings;
  return {
    asOf,
    lines,
    issues,
    totals: {
      customers: lines.length,
      rowsChecked,
      receivable: rupees(receivable),
      paidAhead: rupees(paidAhead),
      openingBalances: rupees(openings),
      debits: rupees(debits),
      credits: rupees(credits),
      closingBalances: rupees(closings),
      verifiedCustomers,
      changedCustomers: lines.filter((l) => l.changed).length,
      orphanRows: book.orphans.length,
      orphanAmount: rupees(book.orphans.reduce((s, r) => s + Math.round(Math.max(r.debit, r.credit) * 100), 0)),
    },
    verified: verifiedCustomers === lines.length && controlHolds,
  };
}

export const ISSUE_TITLES: Record<IssueCode, string> = {
  'orphan-row': 'Entry for a customer that no longer exists',
  'possible-duplicate': 'Possibly entered twice',
  'amount-not-a-number': 'Amount missing or unreadable',
  'amount-stored-as-text': 'Amount stored as text',
  'negative-amount': 'Negative amount',
  'no-date': 'No date',
  'future-date': 'Dated in the future',
  'credit-sale-without-account': 'Credit sale with no customer account',
  'cash-sale-on-account': 'Paid at the pump under an account',
  'flag-disagrees-with-method': 'Walk-in flag and payment method disagree',
  'sale-without-method': 'Sale with no payment method',
  'opening-not-a-number': 'Opening balance is not a number',
  'same-name-twice': 'Two accounts with the same name',
};
