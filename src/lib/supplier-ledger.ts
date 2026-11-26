/**
 * ONE ANSWER TO "WHAT DO WE OWE THIS SUPPLIER?"
 *
 * Four screens worked it out four ways: the purchase and payment screens left purchase returns out, the
 * supplier report left out returns AND the opening balance, the supplier's ledger did not list returns at
 * all, and the unified ledger left the opening balance out. So the Purchase Return screen showed
 * "new balance = balance - refund", and after saving the balance went back to where it was.
 *
 *     payable = opening balance + purchases - payments - purchase returns
 *
 * The same shape and the same care as the customer's calculation (lib/customer-ledger.ts): every record
 * once, added in whole paisa, a row with no readable date still counted and placed first, rows on the same
 * instant in one fixed order. Positive means the business owes the supplier.
 *
 * Pure: no React, no Firestore.
 */
import { dayEnd, dayStart, readAmount, readTime, toPaisa } from './customer-ledger';

export type SupplierSource = 'purchases' | 'supplierPayments' | 'purchaseReturns';
export type SupplierRowKind = 'purchase' | 'payment' | 'purchase-return';

export interface SupplierSources {
  suppliers: readonly { id: string; name?: string; openingBalance?: unknown; [key: string]: any }[];
  purchases: readonly { id: string; supplierId?: string | null; totalCost?: unknown; timestamp?: unknown; [key: string]: any }[];
  supplierPayments: readonly { id: string; supplierId?: string | null; amount?: unknown; timestamp?: unknown; [key: string]: any }[];
  purchaseReturns: readonly { id: string; supplierId?: string | null; totalRefund?: unknown; timestamp?: unknown; [key: string]: any }[];
}

export interface SupplierLedgerRow {
  key: string;
  source: SupplierSource;
  sourceId: string;
  supplierId: string;
  kind: SupplierRowKind;
  time: number;
  dated: boolean;
  /** What we paid or sent back: lowers what is owed. */
  debit: number;
  /** What we bought: raises what is owed. */
  credit: number;
  /** What is owed to the supplier after this row. */
  balance: number;
  original: any;
}

export interface SupplierLedger {
  supplierId: string;
  supplier: SupplierSources['suppliers'][number] | null;
  openingBalance: number;
  rows: SupplierLedgerRow[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export interface SupplierLedgerBook {
  ledgers: Map<string, SupplierLedger>;
  /** Rows naming a supplier that no longer exists. On nobody's balance. */
  orphans: SupplierLedgerRow[];
}

type PaisaRow = SupplierLedgerRow & { debitPaisa: number; creditPaisa: number };
const KIND_ORDER: Record<SupplierRowKind, number> = { purchase: 0, payment: 1, 'purchase-return': 2 };
const rupees = (paisa: number) => paisa / 100;
const compare = (a: SupplierLedgerRow, b: SupplierLedgerRow) =>
  a.time !== b.time ? (a.time < b.time ? -1 : 1) : KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
const isSupplierId = (id: unknown): id is string => typeof id === 'string' && id !== '';

function finish(supplierId: string, supplier: SupplierLedger['supplier'], rows: PaisaRow[]): SupplierLedger {
  const opening = toPaisa(supplier?.openingBalance);
  let running = opening;
  let debit = 0;
  let credit = 0;
  const out: SupplierLedgerRow[] = [];
  for (const row of rows.sort(compare)) {
    running += row.creditPaisa - row.debitPaisa;
    debit += row.debitPaisa;
    credit += row.creditPaisa;
    const { debitPaisa: _d, creditPaisa: _c, ...rest } = row;
    out.push({ ...rest, balance: rupees(running) });
  }
  return { supplierId, supplier, openingBalance: rupees(opening), rows: out, totalDebit: rupees(debit), totalCredit: rupees(credit), closingBalance: rupees(running) };
}

export function buildSupplierBook(sources: SupplierSources): SupplierLedgerBook {
  const bySupplier = new Map<string, PaisaRow[]>();
  const seen = new Set<string>();
  const add = (source: SupplierSource, kind: SupplierRowKind, record: { id: string; supplierId?: string | null; timestamp?: unknown }, debitPaisa: number, creditPaisa: number) => {
    if (!isSupplierId(record.supplierId)) return;
    const key = `${source}/${record.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    const time = readTime(record.timestamp);
    const row: PaisaRow = { key, source, sourceId: record.id, supplierId: record.supplierId, kind, time: time ?? -Infinity, dated: time !== null, debit: rupees(debitPaisa), credit: rupees(creditPaisa), balance: 0, original: record, debitPaisa, creditPaisa };
    const list = bySupplier.get(record.supplierId);
    if (list) list.push(row);
    else bySupplier.set(record.supplierId, [row]);
  };
  for (const p of sources.purchases ?? []) add('purchases', 'purchase', p, 0, toPaisa(p.totalCost));
  for (const p of sources.supplierPayments ?? []) add('supplierPayments', 'payment', p, toPaisa(p.amount), 0);
  for (const r of sources.purchaseReturns ?? []) add('purchaseReturns', 'purchase-return', r, toPaisa(r.totalRefund), 0);

  const ledgers = new Map<string, SupplierLedger>();
  for (const supplier of sources.suppliers ?? []) {
    if (ledgers.has(supplier.id)) continue;
    ledgers.set(supplier.id, finish(supplier.id, supplier, bySupplier.get(supplier.id) ?? []));
    bySupplier.delete(supplier.id);
  }
  const orphans: SupplierLedgerRow[] = [];
  for (const rows of bySupplier.values()) for (const { debitPaisa: _d, creditPaisa: _c, ...row } of rows) orphans.push(row);
  orphans.sort(compare);
  return { ledgers, orphans };
}

export function supplierLedgerOf(book: SupplierLedgerBook, supplierId: string | null | undefined): SupplierLedger {
  return (supplierId ? book.ledgers.get(supplierId) : undefined) ?? finish(supplierId ?? '', null, []);
}

/** The period `from`..`to` in whole days: opens on what was owed before it, each row keeps its true running balance. */
export function supplierStatement(ledger: SupplierLedger, range?: { from?: Date | null; to?: Date | null } | null) {
  const start = range?.from ? dayStart(range.from) : -Infinity;
  const end = range?.to ? dayEnd(range.to) : Infinity;
  let opening = ledger.openingBalance;
  const rows: SupplierLedgerRow[] = [];
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
  return { openingBalance: opening, rows, totalDebit: rupees(debit), totalCredit: rupees(credit), closingBalance: rows.length ? rows[rows.length - 1].balance : opening };
}

/** What is owed as if one record had never been entered (an edit screen's "previous balance"). */
export function supplierBalanceWithout(ledger: SupplierLedger, source: SupplierSource, sourceId: string | null | undefined): number {
  const row = sourceId ? ledger.rows.find((r) => r.key === `${source}/${sourceId}`) : undefined;
  if (!row) return ledger.closingBalance;
  return rupees(Math.round(ledger.closingBalance * 100) - Math.round(row.credit * 100) + Math.round(row.debit * 100));
}

/** What a row is, in the ledger's words. */
export function describeSupplierRow(row: SupplierLedgerRow): string {
  const o = row.original ?? {};
  const qty = readAmount(o.volume);
  const litres = qty ? `${qty.toFixed(2)}L of ${o.fuelType ?? 'fuel'}` : '';
  if (row.kind === 'purchase') return litres || o.fuelType || 'Purchase';
  if (row.kind === 'payment') return `Payment Made${o.paymentMethod ? ` (${o.paymentMethod})` : ''}`;
  return litres ? `Return: ${litres}` : 'Purchase Return';
}
