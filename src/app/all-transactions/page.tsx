'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isValid, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Archive, XCircle, Printer, Trash2, AlertTriangle, ListOrdered, Pencil, BookText, Download, X } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Customer, Expense, Purchase, PurchaseReturn, Transaction, CustomerPayment, DateRange } from '@/lib/types';
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
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { DateRangePicker } from '@/components/date-range-picker';


type CombinedEntry = {
  id: string;
  originalId: string;
  timestamp: string;
  type: 'Sale' | 'Purchase' | 'Purchase Return' | 'Salary' | 'Expense' | 'Customer Payment' | 'Cash Advance';
  partner: string;
  details: string;
  amount: number;
  original: any;
  isCreditSale?: boolean;
  profit?: number;
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
    cashAdvances,
    expenses,
    customers,
    colorSettings, 
    deleteTransaction, 
    deletePurchase, 
    deletePurchaseReturn,
    deleteCustomerPayment,
    deleteExpense,
    deleteCashAdvance,
    isLoaded,
  } = useDatabase();
  const [searchTerm, setSearchTerm] = useState('');
  const [entryToDelete, setEntryToDelete] = useState<CombinedEntry | null>(null);
  const { toast } = useToast();
  const [localDateRange, setLocalDateRange] = useState<DateRange | undefined>();
  const isInitialDateSet = useRef(false);

  const combinedEntries = useMemo(() => {
    if (!isLoaded) return [];

    const getProfitForSale = (sale: Transaction, allPurchases: Purchase[]): number => {
      if (!sale.fuelType || !sale.volume || sale.volume <= 0 || !sale.timestamp || !isValid(new Date(sale.timestamp))) {
          return 0;
      }
  
      const saleTime = new Date(sale.timestamp).getTime();
      let latestPurchase: Purchase | null = null;
      let latestPurchaseTime = 0;
  
      for (const p of allPurchases) {
          if (p.fuelType && p.fuelType.toLowerCase() === sale.fuelType.toLowerCase() && p.timestamp && isValid(new Date(p.timestamp))) {
              const purchaseTime = new Date(p.timestamp).getTime();
              if (purchaseTime <= saleTime && purchaseTime > latestPurchaseTime) {
                  latestPurchaseTime = purchaseTime;
                  latestPurchase = p;
              }
          }
      }
      
      if (latestPurchase && latestPurchase.volume > 0 && typeof sale.pricePerLitre === 'number') {
          const costPerLitre = latestPurchase.totalCost / latestPurchase.volume;
          const profit = (sale.pricePerLitre - costPerLitre) * sale.volume;
          return profit;
      }
  
      return 0;
    }

    const sales: CombinedEntry[] = transactions.map(tx => {
      const isCredit = tx.customerId && tx.customerId !== 'walkin' && tx.customerName !== 'Walk-in Customer';
      const profit = getProfitForSale(tx, purchases);

      return {
        id: `sale-${tx.id}`,
        originalId: tx.id,
        timestamp: tx.timestamp,
        type: 'Sale',
        partner: tx.customerName || 'Walk-in Customer',
        details: tx.volume ? `${tx.volume.toFixed(2)}L of ${tx.fuelType}` : (tx.product || 'General Sale'),
        amount: tx.totalAmount,
        original: { ...tx },
        isCreditSale: isCredit,
        profit,
      }
    });

    const payments: CombinedEntry[] = customerPayments
        .filter(p => p.paymentMethod !== 'Salary')
        .map(p => ({
        id: `payment-${p.id}`,
        originalId: p.id,
        timestamp: p.timestamp,
        type: 'Customer Payment',
        partner: p.customerName,
        details: p.notes || `${p.paymentMethod} Payment`,
        amount: p.amount,
        original: { ...p },
    }));

    const advances: CombinedEntry[] = cashAdvances.map(ca => ({
        id: `advance-${ca.id}`,
        originalId: ca.id,
        timestamp: ca.timestamp,
        type: 'Cash Advance',
        partner: ca.customerName,
        details: ca.notes || 'Cash Advance',
        amount: ca.amount,
        original: { ...ca },
    }));

    
    const expenseEntries: CombinedEntry[] = expenses.map(e => ({
        id: `exp-${e.id}`,
        originalId: e.id,
        timestamp: e.timestamp,
        type: e.category === 'Salaries' ? 'Salary' : 'Expense',
        partner: e.category === 'Salaries' ? e.description.replace('Salary for ', '').replace(/ \(.*/, '') : 'Internal',
        details: e.description,
        amount: e.amount,
        original: { ...e },
    }));


    const allPurchases: CombinedEntry[] = purchases.map(p => ({
      id: `purchase-${p.id}`,
      originalId: p.id,
      timestamp: p.timestamp,
      type: 'Purchase',
      partner: p.supplier,
      details: p.volume ? `${p.volume.toFixed(2)}L of ${p.fuelType}` : p.fuelType,
      amount: p.totalCost,
      original: { ...p },
    }));

    const returns: CombinedEntry[] = purchaseReturns.map(pr => ({
      id: `return-${pr.id}`,
      originalId: pr.id,
      timestamp: pr.timestamp,
      type: 'Purchase Return',
      partner: pr.supplier,
      details: `${pr.volume.toFixed(2)}L of ${pr.fuelType}`,
      amount: pr.totalRefund,
      original: { ...pr },
    }));

    return [...sales, ...allPurchases, ...returns, ...payments, ...advances, ...expenseEntries].sort((a, b) => {
        const dateA = new Date(a.timestamp);
        const dateB = new Date(b.timestamp);
        if (!isValid(dateA)) return 1;
        if (!isValid(dateB)) return -1;
        return dateB.getTime() - dateA.getTime()
    });
  }, [isLoaded, transactions, purchases, purchaseReturns, customerPayments, cashAdvances, expenses]);

  useEffect(() => {
    if (isLoaded && combinedEntries.length > 0 && !isInitialDateSet.current) {
        const latestEntry = combinedEntries[0];
        if (latestEntry && isValid(new Date(latestEntry.timestamp))) {
            const latestDate = new Date(latestEntry.timestamp);
            setLocalDateRange({ from: startOfDay(latestDate), to: endOfDay(latestDate) });
        } else {
            setLocalDateRange({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
        }
        isInitialDateSet.current = true;
    } else if (isLoaded && !isInitialDateSet.current) {
        setLocalDateRange({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
        isInitialDateSet.current = true;
    }
  }, [isLoaded, combinedEntries]);

  const handleExportExcel = () => {
    const dataToExport = filteredEntries.map(entry => {
        const date = new Date(entry.timestamp);
        const typeLabel = entry.type === 'Sale' && entry.isCreditSale ? 'Credit Sale' : entry.type === 'Sale' ? 'Cash Sale' : entry.type === 'Customer Payment' ? 'Amount' : entry.type;
        return {
            'Date': isValid(date) ? format(date, 'dd-MMM-yyyy hh:mm a') : 'Invalid Date',
            'Type': typeLabel,
            'Partner': entry.partner,
            'Details': entry.details,
            'Amount (PKR)': entry.amount.toFixed(2),
            'Profit (PKR)': entry.type === 'Sale' && entry.profit ? entry.profit.toFixed(2) : '-'
        };
    });
    
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');
    XLSX.writeFile(workbook, 'AllTransactions.xlsx');
  };

  const filteredEntries = useMemo(() => {
    if (!localDateRange?.from) return [];
    
    const from = startOfDay(localDateRange.from);
    const to = localDateRange.to ? endOfDay(localDateRange.to) : endOfDay(localDateRange.from);

    let entries = combinedEntries.filter(entry => {
        const entryDate = new Date(entry.timestamp);
        return isValid(entryDate) && entryDate >= from && entryDate <= to;
    });

    if (!searchTerm) return entries;
    
    return entries.filter(entry =>
      (entry.partner && entry.partner.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (entry.type && entry.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (entry.details && entry.details.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [combinedEntries, searchTerm, localDateRange]);

  const groupedEntries = useMemo(() => {
    const groups = filteredEntries.reduce((acc, entry) => {
        const dateKey = format(new Date(entry.timestamp), 'yyyy-MM-dd');
        if (!acc[dateKey]) {
            acc[dateKey] = [];
        }
        acc[dateKey].push(entry);
        return acc;
    }, {} as Record<string, CombinedEntry[]>);

    for (const dateKey in groups) {
        groups[dateKey].sort((a,b) => a.type.localeCompare(b.type));
    }
    return groups;
  }, [filteredEntries]);

  const sortedDateKeys = useMemo(() => Object.keys(groupedEntries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()), [groupedEntries]);

  const topCustomers = useMemo(() => {
    if (!isLoaded || !localDateRange?.from) return [];

    let currentTransactions = transactions;
    const from = startOfDay(localDateRange.from);
    const to = localDateRange.to ? endOfDay(localDateRange.to) : endOfDay(localDateRange.from);
    currentTransactions = transactions.filter(tx => {
        const txDate = new Date(tx.timestamp);
        return isValid(txDate) && txDate >= from && txDate <= to;
    });
    
    const customerTotals = currentTransactions.reduce((acc, tx) => {
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

  }, [isLoaded, transactions, localDateRange]);
  
  const getEntryColor = (entry: CombinedEntry) => {
    const type = entry.type === 'Sale' && entry.isCreditSale ? 'Credit Sale' : entry.type;
    return colorSettings[type] || '#6b7280'; // default gray
  };

  const formatPhoneNumberForWhatsApp = (phone: string | number) => {
    if (typeof phone !== 'string') return '';
    return phone.replace(/[^0-9]/g, '');
  }

  const getCustomerForEntry = (entry: CombinedEntry): Customer | undefined => {
      if (entry.type === 'Sale' && entry.original && 'customerId' in entry.original && entry.original.customerId) {
          return customers.find(c => c.id === entry.original.customerId);
      }
       if (entry.type === 'Customer Payment' && entry.original && 'customerId' in entry.original && entry.original.customerId) {
          return customers.find(c => c.id === entry.original.customerId);
      }
       if (entry.type === 'Cash Advance' && entry.original && 'customerId' in entry.original && entry.original.customerId) {
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
            case 'Customer Payment':
            case 'Salary': deleteCustomerPayment(entryToDelete.originalId); break;
            case 'Cash Advance': deleteCashAdvance(entryToDelete.originalId); break;
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
                 <div className="flex items-center gap-2 flex-wrap">
                    <DateRangePicker date={localDateRange} onDateChange={setLocalDateRange} />
                    <Input 
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="max-w-sm"
                    />
                    <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4"/> Print</Button>
                    <Button variant="outline" onClick={handleExportExcel}><Download className="mr-2 h-4 w-4"/> Excel</Button>
                </div>
            </div>
            </CardHeader>
            <CardContent>
            {isLoaded && sortedDateKeys.length > 0 ? (
                <Accordion type="multiple" className="w-full space-y-4" defaultValue={sortedDateKeys}>
                    {sortedDateKeys.map(dateKey => {
                        const dayEntries = groupedEntries[dateKey];
                        return (
                            <AccordionItem value={dateKey} key={dateKey} className="border border-input rounded-lg overflow-hidden bg-background shadow-sm">
                                <AccordionTrigger className="p-4 text-lg hover:no-underline data-[state=open]:bg-muted/50">
                                    <div className="flex justify-between w-full pr-4 items-center">
                                        <span className="font-semibold text-primary">{format(new Date(dateKey), 'EEEE, dd MMMM yyyy')}</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-4 pb-4">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Time</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Partner</TableHead>
                                                <TableHead>Details</TableHead>
                                                <TableHead className="text-right">Amount (PKR)</TableHead>
                                                <TableHead className="text-right">Profit (PKR)</TableHead>
                                                <TableHead className="text-center">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {dayEntries.map(entry => {
                                                const customer = getCustomerForEntry(entry);
                                                const isPrintable = entry.type === 'Sale' || entry.type === 'Purchase';
                                                const date = new Date(entry.timestamp);
                                                const color = getEntryColor(entry);
                                                const typeLabel = entry.type === 'Sale' && entry.isCreditSale ? 'Credit Sale' : entry.type === 'Sale' ? 'Cash Sale' : entry.type === 'Customer Payment' ? 'Amount' : entry.type;

                                                return (
                                                <TableRow key={entry.id}>
                                                    <TableCell className="font-medium whitespace-nowrap" style={{ color }}>
                                                        {isValid(date) ? format(date, 'hh:mm a') : 'Invalid Time'}
                                                    </TableCell>
                                                    <TableCell>
                                                    <Badge 
                                                        className="text-xs border"
                                                        style={{ 
                                                            backgroundColor: `${color}20`, 
                                                            color: color,
                                                            borderColor: `${color}40`,
                                                        }}
                                                    >{typeLabel}</Badge>
                                                    </TableCell>
                                                    <TableCell className="font-medium">{entry.partner}</TableCell>
                                                    <TableCell className={cn(
                                                        entry.details.toLowerCase().includes('diesel') && 'text-green-600',
                                                        (entry.details.toLowerCase().includes('unleaded') || entry.details.toLowerCase().includes('premium')) && 'text-destructive'
                                                    )}>{entry.details}</TableCell>
                                                    <TableCell className="text-right font-semibold font-mono" style={{ color }}>
                                                        {entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-blue-600">
                                                    {entry.type === 'Sale' && typeof entry.profit === 'number' ? entry.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-center space-x-0.5">
                                                        <Button asChild variant="ghost" size="icon" title="Edit">
                                                            <Link href={entry.type === 'Purchase' ? '/settings' : '/customers'}>
                                                                <Pencil className="w-4 h-4" />
                                                            </Link>
                                                        </Button>
                                                        {isPrintable && (
                                                        <Button asChild variant="ghost" size="icon" title="Print Invoice">
                                                            <Link href={`/invoice/${entry.type.toLowerCase().replace(' ', '')}/${entry.originalId}`}>
                                                            <Printer className="w-4 h-4" />
                                                            </Link>
                                                        </Button>
                                                        )}
                                                        {customer?.contact && (
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
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
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
                                        <Link href={`/customers/${customer.id}/ledger`} title="View Ledger">
                                            <BookText className="w-4 h-4" />
                                        </Link>
                                    </Button>
                                    <Button variant="ghost" size="icon" asChild>
                                        <Link href="/customers" title="Edit Customer">
                                            <Pencil className="w-4 h-4" />
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
