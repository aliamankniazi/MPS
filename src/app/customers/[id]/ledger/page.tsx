'use client';

import React, { useMemo, useState, useEffect, use } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isValid, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { BookUser, ArrowLeft, User, Trash2, Search, Printer, Download, AlertTriangle } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import type { DateRange } from '@/lib/types';
import { DateRangePicker } from '@/components/date-range-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx';

type LedgerEntry = {
  id: string;
  timestamp: string;
  description: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
  original: any;
};

export default function CustomerLedgerPage(props: { params: Promise<{ id: string }>, searchParams: Promise<any> }) {
  const resolvedParams = use(props.params);
  const entityId = resolvedParams.id;
  
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
    saleReturns,
    deleteTransaction, 
    deletePurchase, 
    deleteCustomerPayment, 
    deleteCashAdvance, 
    deleteSupplierPayment, 
    deleteInvestment,
    deleteSaleReturn,
    isLoaded,
  } = useDatabase();
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [entryToDelete, setEntryToDelete] = useState<LedgerEntry | null>(null);
  const [deletePin, setDeletePin] = useState('');
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

  const { entries, finalBalance, totalDebit, totalCredit } = useMemo(() => {
    if (!entity) return { entries: [], finalBalance: 0, totalDebit: 0, totalCredit: 0 };
    const combined: Omit<LedgerEntry, 'balance'>[] = [];

    if (entityType === 'Customer') {
        const customerTransactions = transactions.filter(tx => tx.customerId === entityId);
        const customerPaymentsReceived = customerPayments.filter(p => p.customerId === entityId);
        const customerCashAdvances = cashAdvances.filter(ca => ca.customerId === entityId);
        const customerSaleReturns = saleReturns.filter(sr => sr.customerId === entityId);

        customerTransactions.forEach(tx => {
          const isWalkIn = tx.isWalkIn ?? (tx.customerName === 'Walk-in Customer' || !tx.customerId || tx.customerId === 'walkin');
          
          let debit = 0;
          let credit = 0;
          if ((tx as any).journalColumn) {
            debit = (tx as any).journalColumn === 'debit' ? tx.totalAmount : 0;
            credit = (tx as any).journalColumn === 'credit' ? tx.totalAmount : 0;
          } else {
            debit = tx.totalAmount;
            credit = isWalkIn ? tx.totalAmount : 0;
          }

          combined.push({
            id: `tx-${tx.id}`,
            timestamp: tx.timestamp,
            description: tx.volume ? `${tx.volume.toFixed(2)}L of ${tx.fuelType}` : (tx.product || 'General Sale'),
            type: isWalkIn ? 'Cash Sale – Walk-in' : 'Credit Sale',
            debit,
            credit,
            original: tx
          });
        });

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
        
        customerSaleReturns.forEach(sr => combined.push({
          id: `sr-${sr.id}`,
          timestamp: sr.timestamp,
          description: `Return: ${sr.volume.toFixed(2)}L of ${sr.fuelType}`,
          type: 'Sale Return',
          debit: 0,
          credit: sr.totalRefund, 
          original: sr
        }));

    } else if (entityType === 'Supplier') {
        const supplierPurchases = purchases.filter(p => p.supplierId === entityId);
        const supplierPaymentsMade = supplierPayments.filter(sp => sp.supplierId === entityId);

        supplierPurchases.forEach(p => combined.push({
            id: `pur-${p.id}`,
            timestamp: p.timestamp,
            description: p.volume ? `${p.volume.toFixed(2)}L of ${p.fuelType}` : (p.fuelType || 'General Purchase'),
            type: 'Purchase',
            credit: p.totalCost,
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
            combined.push({
                id: `inv-${inv.id}`,
                timestamp: inv.timestamp,
                description: inv.notes || inv.type,
                type: inv.type,
                credit: inv.type === 'Investment' ? inv.amount : 0,
                debit: inv.type === 'Withdrawal' ? inv.amount : 0,
                original: inv
            });
        });
    }

    combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const openingBalance = ('openingBalance' in entity && entity.openingBalance) ? (entity.openingBalance as number) : 0;
    const rangeFrom = dateRange?.from ? startOfDay(dateRange.from) : null;
    const rangeTo = dateRange?.to ? endOfDay(dateRange.to) : (rangeFrom ? endOfDay(rangeFrom) : null);

    const balanceBeforeRange = combined
      .filter(e => rangeFrom && isValid(new Date(e.timestamp)) && new Date(e.timestamp) < rangeFrom)
      .reduce((bal, entry) => {
        if (entityType === 'Customer') return bal + (entry.debit - entry.credit);
        return bal + (entry.credit - entry.debit);
      }, openingBalance);

    const filteredByDate = rangeFrom && rangeTo
      ? combined.filter(entry => {
          const entryDate = new Date(entry.timestamp);
          return isValid(entryDate) && entryDate >= rangeFrom && entryDate <= rangeTo;
      })
      : combined;
  
    const filteredEntries = searchTerm
      ? filteredByDate.filter(entry => entry.description.toLowerCase().includes(searchTerm.toLowerCase()))
      : filteredByDate;

    const totalDebitForPeriod = filteredEntries.reduce((sum, e) => sum + e.debit, 0);
    const totalCreditForPeriod = filteredEntries.reduce((sum, e) => sum + e.credit, 0);

    let runningBalance = rangeFrom ? balanceBeforeRange : openingBalance;
    const entriesWithBalance: LedgerEntry[] = filteredEntries.map(entry => {
      if (entityType === 'Customer') runningBalance += entry.debit - entry.credit;
      else runningBalance += entry.credit - entry.debit;
      return { ...entry, balance: runningBalance };
    });

    return { entries: entriesWithBalance.reverse(), finalBalance: runningBalance, totalDebit: totalDebitForPeriod, totalCredit: totalCreditForPeriod };
  }, [entity, entityType, transactions, customerPayments, cashAdvances, saleReturns, purchases, supplierPayments, investments, entityId, dateRange, searchTerm]);

  const handleQuickPeriod = (value: string) => {
    const now = new Date();
    if (value === 'this-month') setDateRange({ from: startOfMonth(now), to: endOfMonth(now) });
    else if (value === 'last-month') {
        const lastMonth = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        setDateRange({ from: lastMonth, to: endOfMonth(lastMonth) });
    } else if (value === 'this-year') setDateRange({ from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31) });
    else if (value === 'all-time') setDateRange(undefined);
  };

  const handleExportExcel = () => {
    const dataToExport = entries.slice().reverse().map((entry, index) => ({
        '#': index + 1,
        'Date': isValid(new Date(entry.timestamp)) ? format(new Date(entry.timestamp), 'dd-MMM-yyyy hh:mm a') : 'Invalid Date',
        'Description': entry.description,
        'Type': entry.type,
        'Debit': entry.debit > 0 ? entry.debit.toFixed(2) : '',
        'Credit': entry.credit > 0 ? entry.credit.toFixed(2) : '',
        'Balance': entry.balance.toFixed(2),
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ledger');
    XLSX.writeFile(workbook, `${entity?.name}_Ledger.xlsx`);
  };

  const handleDeleteEntry = () => {
    if (!entryToDelete) return;

    if (deletePin !== '0200') {
      toast({
        variant: 'destructive',
        title: 'Incorrect PIN',
        description: 'Verification failed. Incorrect PIN.',
      });
      return;
    }

    const [prefix, id] = entryToDelete.id.split(/-(.*)/s);
    try {
        if (prefix === 'tx') deleteTransaction(id);
        else if (prefix === 'pay') deleteCustomerPayment(id);
        else if (prefix === 'adv') deleteCashAdvance(id);
        else if (prefix === 'sr') deleteSaleReturn(id);
        else if (prefix === 'pur') deletePurchase(id);
        else if (prefix === 'spay') deleteSupplierPayment(id);
        else if (prefix === 'inv') deleteInvestment(id);
        toast({ title: 'Entry Deleted' });
    } catch (e) { toast({ variant: 'destructive', title: 'Error' }); }
    setEntryToDelete(null);
    setDeletePin('');
  };

  if (!isLoaded) return (
    <div className="p-4 md:p-8 space-y-8">
        <Skeleton className="h-8 w-64"/>
        <Skeleton className="h-24 w-full"/>
        <Card>
            <CardContent className="pt-6">
                <Skeleton className="h-96 w-full" />
            </CardContent>
        </Card>
    </div>
  );

  if (!entity) return (
    <div className="p-8 text-center">
        <h2 className="text-2xl font-bold text-destructive">Not Found</h2>
        <Button asChild className="mt-4"><Link href="/partner-ledger">Back</Link></Button>
    </div>
  );

  const balanceColor = (bal: number) => entityType === 'Customer' ? (bal > 0 ? 'text-destructive' : 'text-green-600') : (bal >= 0 ? 'text-green-600' : 'text-destructive');

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4 print:hidden">
        <div>
          <CardTitle className="text-2xl font-bold flex items-center gap-2"><BookUser /> {entityType} Ledger: <span className={cn(balanceColor(finalBalance))}>{entity.name}</span></CardTitle>
          <CardDescription>A record of all transactions for this {entityType.toLowerCase()}.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full sm:w-48" />
          <Select onValueChange={handleQuickPeriod}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Quick Period"/></SelectTrigger>
            <SelectContent>
                <SelectItem value="this-month">This Month</SelectItem>
                <SelectItem value="last-month">Last Month</SelectItem>
                <SelectItem value="this-year">This Year</SelectItem>
                <SelectItem value="all-time">All Time</SelectItem>
            </SelectContent>
          </Select>
          <DateRangePicker date={dateRange} onDateChange={setDateRange} />
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print</Button>
          <Button variant="outline" onClick={handleExportExcel}><Download className="mr-2 h-4 w-4" /> Excel</Button>
          <Button asChild variant="outline"><Link href="/partner-ledger"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link></Button>
        </div>
      </div>

      <div id="ledger-content" className="space-y-8">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-3"><User /> {entityType} Details</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-3 gap-4 text-sm">
            <div><strong>Name:</strong> <span className={cn(balanceColor(finalBalance))}>{entity.name}</span></div>
            {'contact' in entity && <div><strong>Contact:</strong> {(entity as any).contact}</div>}
            {entityType === 'Customer' && 'vehicleNumber' in entity && <div><strong>Vehicle No:</strong> {(entity as any).vehicleNumber}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-3 mb-6">
                <Card className="bg-muted/50"><CardHeader className="py-2"><CardTitle className="text-xs uppercase">Total Debit</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">PKR {totalDebit.toLocaleString()}</div></CardContent></Card>
                <Card className="bg-muted/50"><CardHeader className="py-2"><CardTitle className="text-xs uppercase">Total Credit</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">PKR {totalCredit.toLocaleString()}</div></CardContent></Card>
                <Card className="bg-muted/50 border-2 border-primary/20"><CardHeader className="py-2"><CardTitle className="text-xs uppercase">Final Balance</CardTitle></CardHeader><CardContent><div className={cn("text-2xl font-bold", balanceColor(finalBalance))}>PKR {finalBalance.toLocaleString()}</div></CardContent></Card>
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead className="text-center print:hidden">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry, index) => {
                    const date = new Date(entry.timestamp);
                    const color = entry.original?.isWalkIn ? 'text-green-600' : (entry.type === 'Credit Sale' ? 'text-blue-600' : (entry.type === 'Payment' ? 'text-teal-600' : ''));
                    const serialNumber = entries.length - index;
                    
                    return (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono text-muted-foreground">{serialNumber}</TableCell>
                          <TableCell className="font-medium whitespace-nowrap">{isValid(date) ? format(date, 'dd-MMM-yyyy hh:mm a') : 'Invalid'}</TableCell>
                          <TableCell className={color}>{entry.description}</TableCell>
                          <TableCell><Badge variant={entry.debit > 0 ? 'destructive' : 'outline'}>{entry.type}</Badge></TableCell>
                          <TableCell className="text-right font-mono text-destructive">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</TableCell>
                          <TableCell className={cn("text-right font-semibold font-mono", balanceColor(entry.balance))}>{entry.balance.toFixed(2)}</TableCell>
                          <TableCell className="text-center print:hidden"><Button variant="ghost" size="icon" className="text-destructive" onClick={() => setEntryToDelete(entry)}><Trash2 className="w-4 h-4" /></Button></TableCell>
                        </TableRow>
                    );
                  })}
                </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!entryToDelete} onOpenChange={(isOpen) => { if (!isOpen) { setEntryToDelete(null); setDeletePin(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Delete Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete: <strong>{entryToDelete?.description}</strong>
              <div className="mt-4 space-y-2">
                <Label htmlFor="ledger-delete-pin">Enter PIN to confirm deletion:</Label>
                <Input
                  id="ledger-delete-pin"
                  type="password"
                  value={deletePin}
                  onChange={(e) => setDeletePin(e.target.value)}
                  placeholder="Enter 4-digit PIN"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setEntryToDelete(null); setDeletePin(''); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntry} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
