'use client';

import { Invoice } from '@/components/invoice';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useDatabase } from '@/hooks/use-database';
import React, { useMemo } from 'react';
import { useParams } from 'next/navigation';

export default function InvoicePage() {
  const params = useParams();
  const type = params.type as string;
  const id = params.id as string;
  const { transactions, purchases, customers, suppliers, bankAccounts, isLoaded, customerPayments, cashAdvances, supplierPayments } = useDatabase();

  const invoiceData = useMemo(() => {
    if (!isLoaded) return null;

    if (type === 'sale') {
      const transaction = transactions.find(t => t.id === id);
      if (transaction) {
        const customer = transaction.customerId ? customers.find(c => c.id === transaction.customerId) : null;
        const bankAccount = transaction.bankAccountId ? bankAccounts.find(b => b.id === transaction.bankAccountId) : null;
        
        let openingBalance = 0;
        let closingBalance = 0;

        if (customer) {
            const customerOpening = customer.openingBalance || 0;
            const transactionTimestamp = new Date(transaction.timestamp).getTime();

            const previousTransactions = transactions
                .filter(tx => tx.customerId === customer.id && new Date(tx.timestamp).getTime() < transactionTimestamp)
                .reduce((sum, tx) => sum + tx.totalAmount, 0);

            const previousPayments = customerPayments
                .filter(p => p.customerId === customer.id && new Date(p.timestamp).getTime() < transactionTimestamp)
                .reduce((sum, p) => sum + p.amount, 0);
            
            const previousCashAdvances = cashAdvances
                .filter(ca => ca.customerId === customer.id && new Date(ca.timestamp).getTime() < transactionTimestamp)
                .reduce((sum, ca) => sum + ca.amount, 0);

            openingBalance = customerOpening + previousTransactions + previousCashAdvances - previousPayments;
            closingBalance = openingBalance + transaction.totalAmount;
        }

        return {
          type: 'Sale',
          id: transaction.id,
          date: transaction.timestamp,
          partner: {
            name: transaction.customerName || 'Walk-in Customer',
            contact: customer?.contact || 'N/A',
            balance: 0,
            openingBalance: openingBalance,
            closingBalance: closingBalance,
          },
          items: [
            {
              name: `Fuel - ${transaction.fuelType}`,
              group: 'Fuel',
              quantity: transaction.volume,
              price: transaction.pricePerLitre,
              amount: transaction.totalAmount,
            },
          ],
          totalAmount: transaction.totalAmount,
          paymentMethod: transaction.paymentMethod,
          bankDetails: bankAccount ? { name: bankAccount.bankName, number: bankAccount.accountNumber } : undefined,
        };
      }
    } else if (type === 'purchase') {
      const purchase = purchases.find(p => p.id === id);
      if (purchase) {
        const supplier = suppliers.find(s => s.id === purchase.supplierId);
        
        let openingBalance = 0;
        let closingBalance = 0;

        if (supplier) {
            const supplierOpening = supplier.openingBalance || 0;
            const purchaseTimestamp = new Date(purchase.timestamp).getTime();

            const previousPurchases = purchases
                .filter(p => p.supplierId === supplier.id && new Date(p.timestamp).getTime() < purchaseTimestamp)
                .reduce((sum, p) => sum + p.totalCost, 0);
            
            const previousPayments = supplierPayments
                .filter(p => p.supplierId === supplier.id && new Date(p.timestamp).getTime() < purchaseTimestamp)
                .reduce((sum, p) => sum + p.amount, 0);
            
            openingBalance = supplierOpening + previousPurchases - previousPayments;
            closingBalance = openingBalance + purchase.totalCost;
        }

        return {
          type: 'Purchase',
          id: purchase.id,
          date: purchase.timestamp,
          partner: {
            name: purchase.supplier,
            contact: supplier?.contact || 'N/A',
            balance: 0,
            openingBalance,
            closingBalance,
          },
          items: [
            {
              name: `Fuel - ${purchase.fuelType}`,
              group: 'Fuel',
              quantity: purchase.volume,
              price: purchase.totalCost / purchase.volume,
              amount: purchase.totalCost,
            },
          ],
          totalAmount: purchase.totalCost,
          paymentMethod: 'Credit',
        };
      }
    } else if (type === 'customerpayment') {
      const payment = customerPayments.find(p => p.id === id);
      if (payment) {
          const customer = customers.find(c => c.id === payment.customerId);
          
          let openingBalance = 0;
          let closingBalance = 0;

          if (customer) {
              const customerOpening = customer.openingBalance || 0;
              const paymentTimestamp = new Date(payment.timestamp).getTime();

              const previousTransactions = transactions
                  .filter(tx => tx.customerId === customer.id && new Date(tx.timestamp).getTime() < paymentTimestamp)
                  .reduce((sum, tx) => sum + tx.totalAmount, 0);

              const previousPayments = customerPayments
                  .filter(p => p.customerId === customer.id && new Date(p.timestamp).getTime() < paymentTimestamp)
                  .reduce((sum, p) => sum + p.amount, 0);
              
              const previousCashAdvances = cashAdvances
                  .filter(ca => ca.customerId === customer.id && new Date(ca.timestamp).getTime() < paymentTimestamp)
                  .reduce((sum, ca) => sum + ca.amount, 0);

              openingBalance = customerOpening + previousTransactions + previousCashAdvances - previousPayments;
              closingBalance = openingBalance - payment.amount;
          }

          return {
            type: 'Customer Payment',
            id: payment.id,
            date: payment.timestamp,
            partner: {
                name: payment.customerName,
                contact: customer?.contact || 'N/A',
                balance: 0,
                openingBalance: openingBalance,
                closingBalance: closingBalance,
            },
            items: [
              {
                name: `Payment Received (${payment.paymentMethod})`,
                group: 'Payment',
                quantity: 1,
                price: payment.amount,
                amount: payment.amount,
              },
            ],
            totalAmount: payment.amount,
            paymentMethod: payment.paymentMethod,
          };
      }
    } else if (type === 'cashadvance') {
        const advance = cashAdvances.find(a => a.id === id);
        if (advance) {
            const customer = customers.find(c => c.id === advance.customerId);
            
            let openingBalance = 0;
            let closingBalance = 0;

            if (customer) {
                const customerOpening = customer.openingBalance || 0;
                const advanceTimestamp = new Date(advance.timestamp).getTime();

                const previousTransactions = transactions
                    .filter(tx => tx.customerId === customer.id && new Date(tx.timestamp).getTime() < advanceTimestamp)
                    .reduce((sum, tx) => sum + tx.totalAmount, 0);

                const previousPayments = customerPayments
                    .filter(p => p.customerId === customer.id && new Date(p.timestamp).getTime() < advanceTimestamp)
                    .reduce((sum, p) => sum + p.amount, 0);
                
                const previousCashAdvances = cashAdvances
                    .filter(ca => ca.customerId === customer.id && new Date(ca.timestamp).getTime() < advanceTimestamp)
                    .reduce((sum, ca) => sum + ca.amount, 0);

                openingBalance = customerOpening + previousTransactions + previousCashAdvances - previousPayments;
                closingBalance = openingBalance + advance.amount;
            }

            return {
              type: 'Cash Advance',
              id: advance.id,
              date: advance.timestamp,
              partner: {
                  name: advance.customerName,
                  contact: customer?.contact || 'N/A',
                  balance: 0,
                  openingBalance: openingBalance,
                  closingBalance: closingBalance,
              },
              items: [
                {
                  name: `Cash Advance`,
                  group: 'Cash',
                  quantity: 1,
                  price: advance.amount,
                  amount: advance.amount,
                },
              ],
              totalAmount: advance.amount,
              paymentMethod: 'Cash',
            };
        }
    }
    return null;
  }, [isLoaded, type, id, transactions, purchases, customers, suppliers, bankAccounts, customerPayments, cashAdvances, supplierPayments]);

  return (
    <div className="bg-gray-100 dark:bg-gray-800 min-h-screen p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-4 flex justify-end gap-2 print:hidden">
            <Button onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Print Invoice
            </Button>
        </div>
        <div className="bg-white dark:bg-card shadow-lg rounded-lg p-8">
            {isLoaded && invoiceData ? (
                <Invoice data={invoiceData} />
            ) : isLoaded && !invoiceData ? (
                <div className="text-center text-red-500">Invoice not found.</div>
            ) : (
                <div className="space-y-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-24 w-full" />
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
