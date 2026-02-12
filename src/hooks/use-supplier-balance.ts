'use client';

import { useMemo } from 'react';
import { useDatabase } from '@/hooks/use-database';

/**
 * A custom hook to calculate the current balance for a specific supplier.
 * It sums up all their purchases (credits) and subtracts
 * all payments made to them (debits).
 * @param supplierId The ID of the supplier to calculate the balance for.
 * @returns An object containing the calculated balance and a loading state.
 */
export function useSupplierBalance(supplierId: string | null) {
  const { suppliers, purchases, supplierPayments, isLoaded } = useDatabase();

  const balance = useMemo(() => {
    if (!supplierId || !isLoaded) {
      return 0;
    }

    const supplier = suppliers.find(s => s.id === supplierId);
    const openingBalance = supplier?.openingBalance || 0;

    // Purchases increase the amount owed to the supplier (credit)
    const supplierPurchases = purchases
      .filter(p => p.supplierId === supplierId)
      .reduce((sum, p) => sum + p.totalCost, 0);

    // Payments to the supplier decrease the amount owed (debit)
    const paymentsToSupplier = supplierPayments
      .filter(p => p.supplierId === supplierId)
      .reduce((sum, p) => sum + p.amount, 0);

    return openingBalance + supplierPurchases - paymentsToSupplier;

  }, [supplierId, suppliers, purchases, supplierPayments, isLoaded]);

  return { balance, isLoaded };
}
