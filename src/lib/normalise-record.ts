/**
 * RECORDS ARE READ ONCE, HERE, INTO THE SHAPE EVERY SCREEN EXPECTS.
 *
 * Some stored records carry a figure as text ("27000" instead of 27000). Every screen then did its own
 * arithmetic on it: `total + "27000"` glues text onto a number, `"27000".toFixed(2)` crashes the page. The
 * Dashboard, the Summary and a supplier's ledger all went down on one such record.
 *
 * So the figure is turned into the number it spells as the record comes in, in memory only. NOTHING IS
 * WRITTEN BACK: the stored record stays exactly as it is, and what it held is kept beside it in `_asStored`
 * so the balance audit can still report "this amount is stored as text" (lib/customer-audit.ts).
 *
 * A figure that is missing is left missing: whether a missing quantity means "none" is for the screen that
 * shows it. A figure that is text and spells no number becomes 0 (it counted as nothing or crashed before),
 * and is reported by the audit.
 */
import { readAmount } from './customer-ledger';

/** Every field of every collection that holds a number. */
export const NUMERIC_FIELDS: readonly string[] = [
  'totalAmount', 'amount', 'totalCost', 'totalRefund', 'openingBalance',
  'volume', 'pricePerLitre', 'costPrice', 'price',
  'salary', 'sharePercentage', 'balance',
  'adjustment', 'newStock', 'value',
  'salePrice', 'purchasePrice', 'openingStock', 'currentStock',
];

/** The key under which a record keeps what was stored for any figure that had to be read. Never written. */
export const AS_STORED = '_asStored';

export function normaliseRecord<T extends Record<string, any>>(record: T): T {
  let out: Record<string, any> | null = null;
  let asStored: Record<string, unknown> | null = null;
  for (const field of NUMERIC_FIELDS) {
    const value = record[field];
    if (typeof value !== 'string') continue;
    const read = readAmount(value);
    out ??= { ...record };
    asStored ??= {};
    asStored[field] = value;
    out[field] = read ?? 0;
  }
  if (!out) return record;
  out[AS_STORED] = asStored;
  return out as T;
}

/** What the record really holds for a field: the stored value when it had to be read, else the value itself. */
export function storedValue(record: Record<string, any> | null | undefined, field: string): unknown {
  if (!record) return undefined;
  const kept = record[AS_STORED];
  return kept && Object.prototype.hasOwnProperty.call(kept, field) ? kept[field] : record[field];
}

/** A payload on its way to the database, without the in-memory note. */
export function withoutAsStored<T extends Record<string, any>>(payload: T): T {
  if (!(AS_STORED in payload)) return payload;
  const { [AS_STORED]: _dropped, ...rest } = payload;
  return rest as T;
}
