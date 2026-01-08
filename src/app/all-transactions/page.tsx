

'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isValid } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Archive, XCircle, Printer, Trash2, AlertTriangle, ArrowRight, ListOrdered } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Customer, Expense, Purchase, PurchaseReturn, Transaction, CustomerPayment } from '@/lib/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';


type CombinedEntry = {
  id: string;
  originalId: string;
  timestamp: string;
  type: 'Sale' | 'Purchase' | 'Purchase Return' | 'Salary' | 'Expense';
  partner: string;
  details: string;
  amount: number;
  original: Transaction | Purchase | PurchaseReturn | CustomerPayment | Expense;
  isCreditSale?: boolean;
};

const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      aria-hidden="true"
      fill="currentColor"
      viewBox="0 0 448 512"
      {...props}
    >
      <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 .9c34.9 0 67.7 13.5 92.8 38.6 25.1 25.1 38.6 57.9 38.6 92.8 0 97.8-79.7 177.6-177.6 177.6-34.9 0-67.7-13.5-92.8-38.6s-38.6-57.9-38.6-92.8c0-97.8 79.7-177.6 177.6-177.6zm93.8 148.6c-3.3-1.5-19.8-9.8-23-11.5s-5.5-2.5-7.8 2.5c-2.3 5-8.7 11.5-10.7 13.8s-3.9 2.5-7.3 1c-3.3-1.5-14-5.2-26.6-16.5c-9.9-8.9-16.5-19.8-18.5-23s-2-5.5-.6-7.5c1.4-2 3-3.3 4.5-5.2s3-4.2 4.5-7.1c1.5-2.8.8-5.2-.4-6.8s-7.8-18.5-10.7-25.4c-2.8-6.8-5.6-5.8-7.8-5.8s-4.5-.4-6.8-.4-7.8 1.1-11.8 5.5c-4 4.4-15.2 14.8-15.2 36.1s15.5 41.9 17.5 44.8c2 2.8 30.4 46.4 73.8 65.4 10.8 4.8 19.3 7.6 25.9 9.8s11.1 1.5 15.2 1c4.8-.7 19.8-8.2 22.5-16.1s2.8-14.8 2-16.1c-.8-1.5-3.3-2.5-6.8-4z"></path>
    </svg>
);


export default function AllTransactionsPage() {
  const { 
    transactions, 
    purchases, 
    purchaseReturns, 
    customerPayments,
    expenses,
    customers, 
    deleteTransaction, 
    deletePurchase, 
    deletePurchaseReturn,
    deleteCustomerPayment,
    deleteExpense,
    isLoaded 
  } = useDatabase();
  const [searchTerm, setSearchTerm] = useState('');
  const [entryToDelete, setEntryToDelete] = useState<CombinedEntry | null>(null);
  const { toast } = useToast();

  const combinedEntries = useMemo(() => {
    if (!isLoaded) return [];

    const sales: CombinedEntry[] = transactions.map(tx => {
      const isCredit = tx.customerId && tx.customerName !== 'Walk-in Customer';
      return {
        id: `sale-${tx.id}`,
        originalId: tx.id,
        timestamp: tx.timestamp,
        type: 'Sale',
        partner: tx.customerName || 'Walk-in Customer',
        details: tx.volume ? `${tx.volume.toFixed(2)}L of ${tx.fuelType}` : (tx.product || 'General Sale'),
        amount: tx.totalAmount,
        original: tx,
        isCreditSale: isCredit,
      }
    });

    const salaryPayments: CombinedEntry[] = customerPayments
        .filter(p => p.paymentMethod === 'Salary')
        .map(p => ({
            id: `salary-${p.id}`,
            originalId: p.id,
            timestamp: p.timestamp,
            type: 'Salary',
            partner: p.customerName,
            details: p.notes || 'Salary Payment',
            amount: p.amount,
            original: p
        }));
    
    const expenseEntries: CombinedEntry[] = expenses.map(e => ({
        id: `exp-${e.id}`,
        originalId: e.id,
        timestamp: e.timestamp,
        type: 'Expense',
        partner: 'Internal',
        details: e.description,
        amount: e.amount,
        original: e,
    }));


    const allPurchases: CombinedEntry[] = purchases.map(p => ({
      id: `purchase-${p.id}`,
      originalId: p.id,
      timestamp: p.timestamp,
      type: 'Purchase',
      partner: p.supplier,
      details: p.volume ? `${p.volume.toFixed(2)}L of ${p.fuelType}` : p.fuelType,
      amount: p.totalCost,
      original: p,
    }));

    const returns: CombinedEntry[] = purchaseReturns.map(pr => ({
      id: `return-${pr.id}`,
      originalId: pr.id,
      timestamp: pr.timestamp,
      type: 'Purchase Return',
      partner: pr.supplier,
      details: `${pr.volume.toFixed(2)}L of ${pr.fuelType}`,
      amount: pr.totalRefund,
      original: pr,
    }));

    return [...sales, ...allPurchases, ...returns, ...salaryPayments, ...expenseEntries].sort((a, b) => {
        const dateA = new Date(a.timestamp);
        const dateB = new Date(b.timestamp);
        if (!isValid(dateA)) return 1;
        if (!isValid(dateB)) return -1;
        return dateB.getTime() - dateA.getTime()
    });
  }, [isLoaded, transactions, purchases, purchaseReturns, customerPayments, expenses]);

  const filteredEntries = useMemo(() => {
    if (!searchTerm) return combinedEntries;
    return combinedEntries.filter(entry =>
      (entry.partner && entry.partner.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (entry.type && entry.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (entry.details && entry.details.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [combinedEntries, searchTerm]);

  const topCustomers = useMemo(() => {
    if (!isLoaded) return [];

    const customerTotals = transactions.reduce((acc, tx) => {
        if (tx.customerId && tx.customerName && tx.customerName !== 'Walk-in Customer') {
            acc[tx.customerId] = {
                id: tx.customerId,
                name: tx.customerName,
                total: (acc[tx.customerId]?.total || 0) + tx.totalAmount,
            };
        }
        return acc;
    }, {} as Record<string, { id: string; name: string; total: number }>);
    
    return Object.values(customerTotals)
        .sort((a,b) => b.total - a.total)
        .slice(0, 5);

  }, [isLoaded, transactions]);

  const getBadgeVariant = (entry: CombinedEntry) => {
    switch (entry.type) {
      case 'Sale': return entry.isCreditSale ? 'default' : 'outline';
      case 'Purchase': return 'destructive';
      case 'Purchase Return': return 'secondary';
      case 'Salary': return 'default';
      case 'Expense': return 'destructive';
      default: return 'default';
    }
  };
  
  const getAmountClass = (entry: CombinedEntry) => {
    if (entry.isCreditSale) return 'text-blue-600';
    if (entry.type === 'Salary') return 'text-pink-600';
      switch(entry.type) {
          case 'Sale': return 'text-green-600';
          case 'Purchase': return 'text-destructive';
          case 'Purchase Return': return 'text-blue-600';
          case 'Expense': return 'text-destructive';
          default: return '';
      }
  }

  const getRowClass = (entry: CombinedEntry) => {
    const isWalkinCashSale = entry.type === 'Sale' && !entry.isCreditSale;
    if (isWalkinCashSale) return 'text-green-600';
    if (entry.isCreditSale) return 'text-blue-600';
    if (entry.type === 'Salary') return 'text-pink-600';
    if (entry.type === 'Expense') return 'text-destructive';
    return '';
  };

  const formatPhoneNumberForWhatsApp = (phone: string | number) => {
    if (typeof phone !== 'string') return '';
    return phone.replace(/[^0-9]/g, '');
  }

  const getCustomerForEntry = (entry: CombinedEntry): Customer | undefined => {
      if (entry.type === 'Sale' && 'customerId' in entry.original && entry.original.customerId) {
          return customers.find(c => c.id === entry.original.customerId);
      }
      return undefined;
  }
  
  const handleDeleteEntry = () => {
    if (!entryToDelete) return;
    
    try {
        switch(entryToDelete.type) {
            case 'Sale': deleteTransaction(entryToDelete.originalId); break;
            case 'Purchase': deletePurchase(entryToDelete.originalId); break;
            case 'Purchase Return': deletePurchaseReturn(entryToDelete.originalId); break;
            case 'Salary': deleteCustomerPayment(entryToDelete.originalId); break;
            case 'Expense': deleteExpense(entryToDelete.originalId); break;
            default:
                throw new Error('Could not delete entry of unknown type.');
        }

        toast({
            title: 'Entry Deleted',
            description: `The ${entryToDelete.type} entry for ${entryToDelete.partner} has been successfully deleted.`,
        });
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: error.message || "An error occurred while deleting the entry.",
        });
    } finally {
        setEntryToDelete(null);
    }
  };


  return (
    <>
    <div className="p-4 md:p-8 grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card>
            <CardHeader>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <Archive /> All Transactions
                    </CardTitle>
                    <CardDescription>A unified record of all sales, purchases, and returns.</CardDescription>
                </div>
                <Input 
                    placeholder="Search by partner, type, details..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                />
            </div>
            </CardHeader>
            <CardContent>
            {isLoaded && filteredEntries.length > 0 ? (
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Amount (PKR)</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredEntries.map(entry => {
                    const customer = getCustomerForEntry(entry);
                    const isPrintable = entry.type === 'Sale' || entry.type === 'Purchase';
                    const date = new Date(entry.timestamp);
                    return (
                    <TableRow key={entry.id} className={getRowClass(entry)}>
                        <TableCell className="font-medium whitespace-nowrap">
                            {isValid(date) ? format(date, 'PP pp') : 'Invalid Date'}
                        </TableCell>
                        <TableCell>
                        <Badge 
                            variant={getBadgeVariant(entry)}
                            className={cn('text-xs', 
                                entry.type === 'Sale' && !entry.isCreditSale && 'bg-green-100 text-green-800 border-green-200',
                                entry.isCreditSale && 'bg-blue-100 text-blue-800 border-blue-200',
                                entry.type === 'Salary' && 'bg-pink-100 text-pink-800 border-pink-200',
                                entry.type === 'Purchase' && 'bg-orange-100 text-orange-800 border-orange-200',
                                entry.type === 'Purchase Return' && 'bg-yellow-100 text-yellow-800 border-yellow-200'
                            )}
                        >{entry.type}</Badge>
                        </TableCell>
                        <TableCell className={cn(entry.isCreditSale && 'font-medium')}>{entry.partner}</TableCell>
                        <TableCell>{entry.details}</TableCell>
                        <TableCell className={cn("text-right font-semibold font-mono", getAmountClass(entry))}>
                            {entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center space-x-0.5">
                            {isPrintable && (
                            <Button asChild variant="ghost" size="icon" title="Print Invoice">
                                <Link href={`/invoice/${entry.type.toLowerCase().replace(' ', '')}/${entry.originalId}`} target="_blank">
                                <Printer className="w-4 h-4" />
                                </Link>
                            </Button>
                            )}
                            {entry.type === 'Sale' && customer?.contact && (
                                <Button asChild variant="ghost" size="icon" className="text-green-500 hover:text-green-600" title={`Message ${customer.name} on WhatsApp`}>
                                    <a 
                                    href={`https://wa.me/${formatPhoneNumberForWhatsApp(customer.contact)}`}
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    >
                                    <WhatsAppIcon className="w-5 h-5" />
                                    </a>
                                </Button>
                            )}
                            <Button variant="ghost" size="icon" title="Delete" className="text-destructive hover:text-destructive" onClick={() => setEntryToDelete(entry)}>
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </TableCell>
                    </TableRow>
                    )
                    })}
                </TableBody>
                </Table>
            ) : (
                <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
                {isLoaded ? (
                    <>
                    <XCircle className="w-16 h-16" />
                    <h3 className="text-xl font-semibold">
                        {searchTerm ? 'No Matching Transactions' : 'No Transactions Yet'}
                    </h3>
                    <p>{searchTerm ? 'Try a different search term.' : 'Sales, purchases, and returns will appear here.'}</p>
                    </>
                ) : (
                    <p>Loading transactions...</p>
                )}
                </div>
            )}
            </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-1">
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><ListOrdered /> Top 5 Customers</CardTitle>
                <CardDescription>Based on total sales value.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableBody>
                        {topCustomers.map((customer, index) => (
                            <TableRow key={customer.id}>
                                <TableCell className="p-2">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-8 w-8">
                                            <AvatarFallback>{index + 1}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="font-medium">{customer.name}</div>
                                            <div className="text-sm text-muted-foreground">PKR {customer.total.toLocaleString()}</div>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="p-2 text-right">
                                    <Button variant="ghost" size="icon" asChild>
                                        <Link href={`/customers/${customer.id}/ledger`}>
                                            <ArrowRight className="w-4 h-4" />
                                        </Link>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                         {topCustomers.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground p-8">No customer sales data available.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>
    </div>

    <AlertDialog open={!!entryToDelete} onOpenChange={(isOpen) => !isOpen && setEntryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the entry: <br />
              <strong className="font-medium text-foreground">{entryToDelete?.type} for {entryToDelete?.partner} - {entryToDelete?.details}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntry} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, delete entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
