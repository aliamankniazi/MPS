'use client';

import { useMemo } from 'react';
import { useDatabase } from '@/hooks/use-database';
import { balanceAsOf, balanceWithout, ledgerOf, type CustomerLedger, type LedgerSource } from '@/lib/customer-ledger';

type Options = {
  /**
   * The record an edit screen has open. It is left out of the balance, so the screen's
   * "previous balance + this entry" does not count the same record twice.
   */
  excluding?: { source: LedgerSource; id: string | null | undefined } | null;
  /** The balance at the end of this day instead of now. */
  asOf?: Date | null;
};

/**
 * A customer's balance. Every screen that shows one asks here, and this asks the one calculation
 * (lib/customer-ledger.ts): closing = opening + debits - credits, every record once.
 *
 * `isLoaded` is false until every collection has arrived; show a placeholder until then, never the 0.
 */
export function useCustomerBalance(customerId: string | null | undefined, options?: Options) {
  const { customerLedgerBook, isLoaded } = useDatabase();
  const excludingSource = options?.excluding?.source;
  const excludingId = options?.excluding?.id;
  const asOfTime = options?.asOf ? options.asOf.getTime() : null;

  const ledger: CustomerLedger = useMemo(
    () => ledgerOf(customerLedgerBook, customerId && customerId !== 'walkin' ? customerId : null),
    [customerLedgerBook, customerId]
  );

  const balance = useMemo(() => {
    if (!customerId || !isLoaded) return 0;
    if (excludingSource && excludingId) return balanceWithout(ledger, excludingSource, excludingId);
    return asOfTime === null ? ledger.closingBalance : balanceAsOf(ledger, new Date(asOfTime));
  }, [customerId, isLoaded, ledger, excludingSource, excludingId, asOfTime]);

  return { balance, ledger, isLoaded };
}
