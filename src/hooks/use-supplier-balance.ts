'use client';

import { useMemo } from 'react';
import { useDatabase } from '@/hooks/use-database';
import { supplierBalanceWithout, supplierLedgerOf, type SupplierSource } from '@/lib/supplier-ledger';

type Options = {
  /** The record an edit screen has open: left out, so "previous balance + this entry" does not count it twice. */
  excluding?: { source: SupplierSource; id: string | null | undefined } | null;
};

/**
 * What the business owes a supplier. Every screen that shows it asks here, and this asks the one calculation
 * (lib/supplier-ledger.ts): opening + purchases - payments - purchase returns, every record once.
 */
export function useSupplierBalance(supplierId: string | null | undefined, options?: Options) {
  const { supplierLedgerBook, isLoaded } = useDatabase();
  const excludingSource = options?.excluding?.source;
  const excludingId = options?.excluding?.id;

  const ledger = useMemo(() => supplierLedgerOf(supplierLedgerBook, supplierId), [supplierLedgerBook, supplierId]);

  const balance = useMemo(() => {
    if (!supplierId || !isLoaded) return 0;
    if (excludingSource && excludingId) return supplierBalanceWithout(ledger, excludingSource, excludingId);
    return ledger.closingBalance;
  }, [supplierId, isLoaded, ledger, excludingSource, excludingId]);

  return { balance, ledger, isLoaded };
}
