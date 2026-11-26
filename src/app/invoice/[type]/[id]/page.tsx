'use client';

import { Invoice } from '@/components/invoice';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useDatabase } from '@/hooks/use-database';
import { balanceAfterRow, balanceBeforeRow, ledgerOf } from '@/lib/customer-ledger';
import React, { useMemo, use } from 'react';
import { isValid } from 'date-fns';

export default function InvoicePage(props: { params: Promise<{ type: string, id: string }> }) {
  const resolvedParams = use(props.params);
  const type = resolvedParams.type;
  const id = resolvedParams.id;
  
  const { 
    transactions, purchases, customers, suppliers, bankAccounts, isLoaded, 
    customerPayments, cashAdvances, supplierPayments, machineReadings, 
    expenses, investments, otherIncomes, customerLedgerBook 
  } = useDatabase();

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
            // The one calculation (lib/customer-ledger.ts): the balance just before and just after this row
            // on the customer's ledger, so the slip and the ledger can never state the debt two ways.
            const ledger = ledgerOf(customerLedgerBook, customer.id);
            openingBalance = balanceBeforeRow(ledger, 'transactions', transaction.id) ?? ledger.closingBalance;
            closingBalance = balanceAfterRow(ledger, 'transactions', transaction.id) ?? ledger.closingBalance;
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
              const ledger = ledgerOf(customerLedgerBook, customer.id);
              openingBalance = balanceBeforeRow(ledger, 'customerPayments', payment.id) ?? ledger.closingBalance;
              closingBalance = balanceAfterRow(ledger, 'customerPayments', payment.id) ?? ledger.closingBalance;
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
                const ledger = ledgerOf(customerLedgerBook, customer.id);
                openingBalance = balanceBeforeRow(ledger, 'cashAdvances', advance.id) ?? ledger.closingBalance;
                closingBalance = balanceAfterRow(ledger, 'cashAdvances', advance.id) ?? ledger.closingBalance;
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
    } else if (type === 'meterreading') {
        const reading = machineReadings.find(r => r.id === id);
        if (reading) {
            const prevReading = machineReadings
                .filter(r => r.machineId === reading.machineId && new Date(r.timestamp).getTime() < new Date(reading.timestamp).getTime())
                .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
            
            return {
                type: 'Meter Reading',
                id: reading.id,
                date: reading.timestamp,
                partner: {
                    name: reading.machineName,
                    contact: reading.fuelType,
                    balance: 0,
                },
                items: [
                    {
                        name: 'Closing Reading',
                        group: 'Meter',
                        quantity: reading.volume,
                        price: 0,
                        amount: 0,
                    },
                    {
                        name: 'Opening Reading',
                        group: 'Meter',
                        quantity: prevReading?.volume || 0,
                        price: 0,
                        amount: 0,
                    }
                ],
                totalAmount: reading.volume - (prevReading?.volume || 0),
                paymentMethod: 'N/A',
                notes: `Unit Audit Slip`
            }
        }
    } else if (type === 'expense') {
        const exp = expenses.find(e => e.id === id);
        if (exp) {
            return {
                type: 'Expense',
                id: exp.id,
                date: exp.timestamp,
                partner: { name: 'Internal Expense', contact: exp.category, balance: 0 },
                items: [{ name: exp.description, group: exp.category, quantity: 1, price: exp.amount, amount: exp.amount }],
                totalAmount: exp.amount,
                paymentMethod: 'Cash'
            };
        }
    } else if (type === 'salary') {
        const pay = customerPayments.find(p => p.id === id);
        if (pay) {
            return {
                type: 'Salary Payment',
                id: pay.id,
                date: pay.timestamp,
                partner: { name: pay.customerName, contact: 'Employee', balance: 0 },
                items: [{ name: pay.notes || 'Salary Payment', group: 'Payroll', quantity: 1, price: pay.amount, amount: pay.amount }],
                totalAmount: pay.amount,
                paymentMethod: 'Cash'
            };
        }
    } else if (type === 'investment' || type === 'withdrawal') {
        const inv = investments.find(i => i.id === id);
        if (inv) {
            return {
                type: inv.type === 'Investment' ? 'Investment' : 'Withdrawal',
                id: inv.id,
                date: inv.timestamp,
                partner: { name: inv.partnerName, contact: 'Business Partner', balance: 0 },
                items: [{ name: inv.notes || inv.type, group: 'Capital', quantity: 1, price: inv.amount, amount: inv.amount }],
                totalAmount: inv.amount,
                paymentMethod: 'Account'
            };
        }
    } else if (type === 'otherincome') {
        const oi = otherIncomes.find(i => i.id === id);
        if (oi) {
            return {
                type: 'Other Income',
                id: oi.id,
                date: oi.timestamp,
                partner: { name: 'Internal Income', contact: oi.category, balance: 0 },
                items: [{ name: oi.description, group: oi.category, quantity: 1, price: oi.amount, amount: oi.amount }],
                totalAmount: oi.amount,
                paymentMethod: 'Cash'
            };
        }
    }
    return null;
  }, [isLoaded, type, id, transactions, purchases, customers, suppliers, bankAccounts, customerPayments, cashAdvances, supplierPayments, machineReadings, expenses, investments, otherIncomes, customerLedgerBook]);

  return (
    <div className="bg-gray-100 dark:bg-gray-800 min-h-screen p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-4 flex justify-end gap-2 print:hidden">
            <Button onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Print Slip
            </Button>
        </div>
        <div className="bg-white dark:bg-card shadow-lg rounded-lg p-8">
            {isLoaded && invoiceData ? (
                <Invoice data={invoiceData as any} />
            ) : isLoaded && !invoiceData ? (
                <div className="text-center text-red-500 py-20">Slip not found. This transaction type might not have a printable voucher yet.</div>
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
