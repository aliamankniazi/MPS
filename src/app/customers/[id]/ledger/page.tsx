
'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isValid, startOfDay, endOfDay } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { BookUser, ArrowLeft, User, Phone, Car, Trash2, AlertTriangle, Percent, Search, Calendar as CalendarIcon } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from '@/lib/types';
import { DateRangePicker } from '@/components/date-range-picker';


type LedgerEntry = {
  id: string;
  timestamp: string;
  description: string;
  type: 'Sale' | 'Payment' | 'Cash Advance' | 'Purchase' | 'Supplier Payment' | 'Salary' | 'Investment' | 'Withdrawal';
  debit: number;
  credit: number;
  balance: number;
  original: any;
};

export default function CustomerLedgerPage() {
  const params = useParams();
  const entityId = params.id as string;
  const { 
    customers, 
    suppliers, 
    businessPartners, 
    transactions, 
    customerPayments, 
    cashAdvances, 
    purchases, 
    supplierPayments, 
    investments, 
    deleteTransaction, 
    deletePurchase, 
    deleteCustomerPayment, 
    deleteCashAdvance, 
    deleteSupplierPayment, 
    deleteInvestment,
    isLoaded,
    dateRange: globalDateRange,
  } = useDatabase();
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>(globalDateRange);
  const [entryToDelete, setEntryToDelete] = useState<LedgerEntry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const { entity, entityType } = useMemo(() => {
    if (!isLoaded) return { entity: null, entityType: null };
    const customer = customers.find(c => c.id === entityId);
    if (customer) return { entity: customer, entityType: 'Customer' };
    const supplier = suppliers.find(s => s.id === entityId);
    if (supplier) return { entity: supplier, entityType: 'Supplier' };
    const partner = businessPartners.find(p => p.id === entityId);
    if (partner) return { entity: partner, entityType: 'Partner' };
    return { entity: null, entityType: null };
  }, [entityId, customers, suppliers, businessPartners, isLoaded]);

  const { entries, finalBalance } = useMemo(() => {
    if (!entity) return { entries: [], finalBalance: 0 };
    const combined: Omit<LedgerEntry, 'balance'>[] = [];

    if (entityType === 'Customer') {
        const customerTransactions = transactions.filter(tx => tx.customerId === entityId);
        const customerPaymentsReceived = customerPayments.filter(p => p.customerId === entityId);
        const customerCashAdvances = cashAdvances.filter(ca => ca.customerId === entityId);

        customerTransactions.forEach(tx => combined.push({
          id: `tx-${tx.id}`,
          timestamp: tx.timestamp,
          description: tx.volume ? `${tx.volume.toFixed(2)}L of ${tx.fuelType}` : (tx.product || 'General Sale'),
          type: 'Sale',
          debit: tx.totalAmount,
          credit: 0,
          original: tx
        }));

        customerPaymentsReceived.forEach(p => {
            const isSalary = p.paymentMethod === 'Salary';
            combined.push({
              id: `pay-${p.id}`,
              timestamp: p.timestamp,
              description: p.notes || (isSalary ? `Salary to ${p.customerName}` : `Payment from ${p.customerName}`),
              type: isSalary ? 'Salary' : 'Payment',
              debit: 0,
              credit: p.amount,
              original: p
            })
        });
        
        customerCashAdvances.forEach(ca => {
            combined.push({
              id: `adv-${ca.id}`,
              timestamp: ca.timestamp,
              description: ca.notes || 'Cash Advance',
              type: 'Cash Advance',
              debit: ca.amount,
              credit: 0,
              original: ca
            })
        });
    } else if (entityType === 'Supplier') {
        const supplierPurchases = purchases.filter(p => p.supplierId === entityId);
        const supplierPaymentsMade = supplierPayments.filter(sp => sp.supplierId === entityId);

        supplierPurchases.forEach(p => combined.push({
            id: `pur-${p.id}`,
            timestamp: p.timestamp,
            description: p.volume ? `${p.volume.toFixed(2)}L of ${p.fuelType}` : (p.fuelType || 'General Purchase'),
            type: 'Purchase',
            credit: p.totalCost, // Credit to supplier's account
            debit: 0,
            original: p
        }));

        supplierPaymentsMade.forEach(sp => combined.push({
            id: `spay-${sp.id}`,
            timestamp: sp.timestamp,
            description: `Payment Made (${sp.paymentMethod})`,
            type: 'Supplier Payment',
            debit: sp.amount,
            credit: 0,
            original: sp
        }));
    } else if (entityType === 'Partner') {
        const partnerInvestments = investments.filter(inv => inv.partnerId === entityId);
        
        partnerInvestments.forEach(inv => {
            if (inv.type === 'Investment') {
                combined.push({
                    id: `inv-${inv.id}`,
                    timestamp: inv.timestamp,
                    description: inv.notes || 'Investment',
                    type: 'Investment',
                    credit: inv.amount, // Credit to partner's capital account
                    debit: 0,
                    original: inv
                });
            } else {
                combined.push({
                    id: `wdr-${inv.id}`,
                    timestamp: inv.timestamp,
                    description: inv.notes || 'Withdrawal',
                    type: 'Withdrawal',
                    debit: inv.amount, // Debit from partner's capital account
                    credit: 0,
                    original: inv
                });
            }
        });
    }

    combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const openingBalance = ('openingBalance' in entity && entity.openingBalance) ? entity.openingBalance : 0;
    
    const balanceBeforeRange = combined
      .filter(e => dateRange?.from && isValid(new Date(e.timestamp)) && new Date(e.timestamp) < startOfDay(dateRange.from))
      .reduce((bal, entry) => {
        if (entityType === 'Customer') {
            return bal + (entry.debit - entry.credit);
        } else { // Supplier or Partner
            return bal + (entry.credit - entry.debit);
        }
      }, openingBalance);
      
    const filteredByDate = dateRange?.from
      ? combined.filter(entry => {
          const entryDate = new Date(entry.timestamp);
          if (!isValid(entryDate)) return false;
          const from = startOfDay(dateRange.from);
          const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);
          return entryDate >= from && entryDate <= to;
      })
      : combined;
  
    const filteredEntries = searchTerm
      ? filteredByDate.filter(entry => 
          entry.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          entry.type.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : filteredByDate;

    let runningBalance = dateRange?.from ? balanceBeforeRange : openingBalance;

    const entriesWithBalance: LedgerEntry[] = filteredEntries.map(entry => {
      const date = new Date(entry.timestamp);
      if(!isValid(date)) {
        return { ...entry, balance: runningBalance, timestamp: 'Invalid Date' };
      }
      
      if (entityType === 'Customer') {
        runningBalance += entry.debit - entry.credit;
      } else if (entityType === 'Supplier' || entityType === 'Partner') {
        runningBalance += entry.credit - entry.debit;
      }
      return { ...entry, balance: runningBalance };
    });

    return { entries: entriesWithBalance.reverse(), finalBalance: runningBalance };
  }, [entity, entityType, transactions, customerPayments, cashAdvances, purchases, supplierPayments, investments, entityId, dateRange, searchTerm]);

  const handleDeleteEntry = () => {
    if (!entryToDelete) return;
    
    const [typePrefix, id] = entryToDelete.id.split(/-(.*)/s);

    try {
        switch(typePrefix) {
            case 'tx': deleteTransaction(id); break;
            case 'pur': deletePurchase(id); break;
            case 'pay': deleteCustomerPayment(id); break;
            case 'adv': deleteCashAdvance(id); break;
            case 'spay': deleteSupplierPayment(id); break;
            case 'inv': deleteInvestment(id); break;
            case 'wdr': deleteInvestment(id); break;
            default:
                throw new Error('Could not delete entry of unknown type.');
        }

        toast({
            title: 'Entry Moved to Recycle Bin',
            description: `The ${entryToDelete.type} entry has been moved to the recycle bin.`,
        });
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: error.message || 'An unexpected error occurred.',
        });
    } finally {
        setEntryToDelete(null);
    }
  };


  if (!isLoaded) {
    return (
        <div className="p-4 md:p-8 space-y-8">
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-64" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-24 w-full" />
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-4 w-80 mt-2" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-96 w-full" />
                </CardContent>
            </Card>
        </div>
    );
  }

  if (!entity) {
    return (
      <div className="p-4 md:p-8 text-center">
        <h2 className="text-2xl font-bold text-destructive">Partner Not Found</h2>
        <p className="text-muted-foreground">The partner with the specified ID could not be found.</p>
        <Button asChild className="mt-4">
          <Link href="/partner-ledger"><ArrowLeft className="mr-2 h-4 w-4" />Back to Partner Ledger</Link>
        </Button>
      </div>
    );
  }

  const isCustomer = entityType === 'Customer';
  const isPartner = entityType === 'Partner';

  const balanceColorClass = () => {
      if (entityType === 'Customer') {
          return finalBalance > 0 ? 'text-destructive' : 'text-green-600';
      }
      if (entityType === 'Supplier' || entityType === 'Partner') {
          return finalBalance >= 0 ? 'text-green-600' : 'text-destructive';
      }
      return '';
  }

  const rowBalanceColorClass = (balance: number) => {
    if (entityType === 'Customer') {
        return balance > 0 ? 'text-destructive' : 'text-green-600';
    }
    if (entityType === 'Supplier' || entityType === 'Partner') {
        return balance >= 0 ? 'text-green-600' : 'text-destructive';
    }
    return '';
  }

  return (
    <div className="p-4 md:p-8 space-y-8">
       <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-3">
                <User /> {entityType} Details
            </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground"/>
                <strong>Name:</strong> <span className={cn(balanceColorClass())}>{entity.name}</span>
            </div>
            {'contact' in entity && (
                <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground"/>
                    <strong>Contact:</strong> {entity.contact || 'N/A'}
                </div>
            )}
            {isCustomer && 'vehicleNumber' in entity && (
                <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-muted-foreground"/>
                    <strong>Vehicle No:</strong> {entity.vehicleNumber || 'N/A'}
                </div>
            )}
            {isPartner && 'sharePercentage' in entity && (
                 <div className="flex items-center gap-2">
                    <Percent className="w-4 h-4 text-muted-foreground"/>
                    <strong>Share:</strong> {entity.sharePercentage}%
                </div>
            )}
        </CardContent>
       </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookUser /> {entityType} Ledger: <span className={cn(balanceColorClass())}>{entity.name}</span>
              </CardTitle>
              <CardDescription>A record of all transactions for this {entityType.toLowerCase()}.</CardDescription>
            </div>
             <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full sm:w-48 pl-10" />
                </div>
                 <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                 <Button asChild variant="outline">
                    <Link href="/partner-ledger"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link>
                 </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mb-4">
              <div className="text-right p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Final Balance</p>
                  <p className={cn("text-2xl font-bold", balanceColorClass())}>PKR {finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
          </div>
          {entries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  let lastDate: string | null = null;
                  return entries.map(entry => {
                    const date = new Date(entry.timestamp);
                    const formattedDate = isValid(date) ? format(date, 'yyyy-MM-dd') : null;
                    const showSeparator = formattedDate && formattedDate !== lastDate;
                    lastDate = formattedDate;

                    const isSale = entry.type === 'Sale';
                    const isSalary = entry.type === 'Salary';

                    return (
                      <React.Fragment key={entry.id}>
                        {showSeparator && (
                          <TableRow className="bg-red-800 hover:bg-red-900">
                            <TableCell colSpan={7} className="text-center font-semibold text-white py-2">
                              {format(date, 'EEEE, dd MMMM yyyy')}
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow>
                          <TableCell className={cn(
                              "font-medium", 
                              isSale && 'text-destructive',
                              entry.type === 'Purchase' && 'text-green-600', 
                              entry.type === 'Payment' && 'text-teal-600',
                              entry.type === 'Cash Advance' && 'text-destructive'
                          )}>
                            {isValid(date) ? format(date, 'dd-MMM-yyyy hh:mm a') : 'Invalid Date'}
                          </TableCell>
                          <TableCell className={cn(
                              isSale && 'text-destructive',
                              isSalary && 'text-pink-600', 
                              entry.type === 'Purchase' && 'text-green-600', 
                              entry.type === 'Payment' && 'text-teal-600',
                              entry.type === 'Cash Advance' && 'text-destructive'
                          )}>{entry.description}</TableCell>
                          <TableCell>
                             <Badge 
                                variant={entry.debit > 0 ? 'destructive' : 'outline'}
                                className={cn('text-xs', 
                                    isSale && 'bg-red-100 text-red-800 border-red-200',
                                    entry.type === 'Payment' && 'bg-teal-100 text-teal-800 border-teal-200 dark:text-teal-300 dark:bg-teal-900/50 dark:border-teal-700',
                                    entry.type === 'Supplier Payment' && 'bg-pink-100 text-pink-800 border-pink-200',
                                    isSalary && 'bg-pink-100 text-pink-800 border-pink-200',
                                    entry.type === 'Purchase' && 'bg-green-100 text-green-800 border-green-200',
                                    entry.type === 'Investment' && 'bg-indigo-100 text-indigo-800 border-indigo-200',
                                    entry.type === 'Withdrawal' && 'bg-purple-100 text-purple-800 border-purple-200',
                                    entry.type === 'Cash Advance' && 'bg-red-100 text-red-800 border-red-200',
                                )}
                            >
                              {entry.type === 'Payment' ? 'Amount' : entry.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-destructive">
                              {entry.debit > 0 ? entry.debit.toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-green-600">
                              {entry.credit > 0 ? entry.credit.toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className={cn("text-right font-semibold font-mono", rowBalanceColorClass(entry.balance))}>
                              {entry.balance.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                              <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setEntryToDelete(entry)}
                              >
                                  <Trash2 className="w-4 h-4" />
                              </Button>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    )
                  });
                })()}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center text-muted-foreground p-8">
              <p>No transactions or payments recorded for this {entityType.toLowerCase()} yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!entryToDelete} onOpenChange={(isOpen) => !isOpen && setEntryToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
                This will move the entry to the recycle bin: <br />
                <strong className="font-medium text-foreground">{entryToDelete?.description}</strong>
            </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntry} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Yes, move to bin
            </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
    

    