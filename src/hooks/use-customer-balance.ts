

'use client';

import { useMemo } from 'react';
import { useDatabase } from '@/hooks/use-database';

/**
 * A custom hook to calculate the current balance for a specific customer.
 * It sums up all their transactions and cash advances (debits) and subtracts
 * all their payments (credits).
 * @param customerId The ID of the customer to calculate the balance for.
 * @returns An object containing the calculated balance and a loading state.
 */
export function useCustomerBalance(customerId: string | null) {
  const { customers, transactions, customerPayments, cashAdvances, isLoaded } = useDatabase();

  const balance = useMemo(() => {
    if (!customerId || !isLoaded) {
      return 0;
    }

    const customer = customers.find(c => c.id === customerId);
    const openingBalance = customer?.openingBalance || 0;

    const customerTransactions = transactions
      .filter(tx => tx.customerId === customerId)
      .reduce((sum, tx) => sum + tx.totalAmount, 0);

    const customerCashAdvances = cashAdvances
      .filter(ca => ca.customerId === customerId)
      .reduce((sum, ca) => sum + ca.amount, 0);

    const customerPaymentsReceived = customerPayments
      .filter(p => p.customerId === customerId)
      .reduce((sum, p) => sum + p.amount, 0);

    return openingBalance + customerTransactions + customerCashAdvances - customerPaymentsReceived;

  }, [customerId, customers, transactions, customerPayments, cashAdvances, isLoaded]);

  return { balance, isLoaded };
}
