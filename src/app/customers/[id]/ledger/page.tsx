
'use client';

import React, { useMemo, useState, use } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isValid, startOfDay, endOfDay, startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { BookUser, ArrowLeft, Trash2, Printer, Pencil, ShieldCheck } from 'lucide-react';
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
import { useAuth } from '@/hooks/use-auth';

type LedgerEntry = {
  id: string;
  timestamp: string;
  description: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
  original: any;
  category?: string;
  notes?: string;
  entityId?: string;
};

export default function CustomerLedgerPage(props: { params: Promise<{ id: string }>, searchParams: Promise<any> }) {
  const resolvedParams = use(props.params);
  const entityId = resolvedParams.id;
  
  const { 
    customers, suppliers, businessPartners, transactions, customerPayments, 
    cashAdvances, purchases, supplierPayments, investments, saleReturns,
    deleteTransaction, deletePurchase, deleteCustomerPayment, deleteCashAdvance, 
    deleteSupplierPayment, deleteInvestment, deleteSaleReturn, isLoaded,
  } = useDatabase();
  
  const { isPinVerified, confirmPin } = useAuth();
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

  const { entries, totalDebit, totalCredit, finalBalance } = useMemo(() => {
    if (!entity) return { entries: [], totalDebit: 0, totalCredit: 0, finalBalance: 0 };
    const combined: Omit<LedgerEntry, 'balance'>[] = [];

    if (entityType === 'Customer') {
        const customerTransactions = transactions.filter(tx => tx.customerId === entityId);
        const customerPaymentsReceived = customerPayments.filter(p => p.customerId === entityId);
        const customerCashAdvances = cashAdvances.filter(ca => ca.customerId === entityId);
        const customerSaleReturns = saleReturns.filter(sr => sr.customerId === entityId);

        customerTransactions.forEach(tx => {
          const isWalkIn = tx.isWalkIn ?? (!tx.customerId || tx.customerId === 'walkin');
          let debit = tx.totalAmount;
          let credit = isWalkIn ? tx.totalAmount : 0;

          combined.push({
            id: `tx-${tx.id}`,
            timestamp: tx.timestamp,
            description: tx.volume ? `${tx.volume.toFixed(2)}L of ${tx.fuelType}` : (tx.product || 'General Sale'),
            type: isWalkIn ? 'Cash Sale' : 'Credit Sale',
            debit,
            credit,
            original: tx,
            category: 'FUEL SALE',
            notes: tx.notes,
            entityId: tx.customerId
          });
        });

        customerPaymentsReceived.forEach(p => {
            const isSalary = p.paymentMethod === 'Salary';
            combined.push({
              id: `pay-${p.id}`,
              timestamp: p.timestamp,
              description: p.notes || (isSalary ? `Salary payment` : `Payment Received`),
              type: isSalary ? 'Salary' : 'Payment',
              debit: 0,
              credit: p.amount,
              original: p,
              category: isSalary ? 'EMPLOYEE BENEFITS' : 'PAYMENT',
              notes: p.notes,
              entityId: p.customerId
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
              original: ca,
              category: 'CASH ADVANCE',
              notes: ca.notes,
              entityId: ca.customerId
            })
        });
        
        customerSaleReturns.forEach(sr => combined.push({
          id: `sr-${sr.id}`,
          timestamp: sr.timestamp,
          description: `Return: ${sr.volume.toFixed(2)}L of ${sr.fuelType}`,
          type: 'Sale Return',
          debit: 0,
          credit: sr.totalRefund, 
          original: sr,
          category: 'RETURN',
          notes: sr.reason,
          entityId: sr.customerId
        }));

    } else if (entityType === 'Supplier') {
        purchases.filter(p => p.supplierId === entityId).forEach(p => combined.push({
            id: `pur-${p.id}`,
            timestamp: p.timestamp,
            description: `${p.volume.toFixed(2)}L of ${p.fuelType}`,
            type: 'Purchase',
            credit: p.totalCost,
            debit: 0,
            original: p,
            category: 'PURCHASE',
            entityId: p.supplierId
        }));

        supplierPayments.filter(sp => sp.supplierId === entityId).forEach(sp => combined.push({
            id: `spay-${sp.id}`,
            timestamp: sp.timestamp,
            description: `Payment Made (${sp.paymentMethod})`,
            type: 'Supplier Payment',
            debit: sp.amount,
            credit: 0,
            original: sp,
            category: 'PAYMENT',
            entityId: sp.supplierId
        }));
    } else if (entityType === 'Partner') {
        investments.filter(inv => inv.partnerId === entityId).forEach(inv => {
            combined.push({
                id: `inv-${inv.id}`,
                timestamp: inv.timestamp,
                type: inv.type,
                description: inv.notes || inv.type,
                debit: inv.type === 'Withdrawal' ? inv.amount : 0,
                credit: inv.type === 'Investment' ? inv.amount : 0,
                original: inv,
                category: 'CAPITAL',
                notes: inv.notes,
                entityId: inv.partnerId
            });
        });
    }

    combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const openingBalance = ('openingBalance' in (entity as any) && (entity as any).openingBalance) ? ((entity as any).openingBalance as number) : 0;
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
      ? filteredByDate.filter(entry => 
          entry.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (entry.notes && entry.notes.toLowerCase().includes(searchTerm.toLowerCase()))
        )
      : filteredByDate;

    let runningBalance = rangeFrom ? balanceBeforeRange : openingBalance;
    const entriesWithBalance: LedgerEntry[] = filteredEntries.map(entry => {
      if (entityType === 'Customer') runningBalance += entry.debit - entry.credit;
      else runningBalance += entry.credit - entry.debit;
      return { ...entry, balance: runningBalance };
    });

    const debit = filteredEntries.reduce((s, e) => s + e.debit, 0);
    const credit = filteredEntries.reduce((s, e) => s + e.credit, 0);

    return { entries: entriesWithBalance.reverse(), totalDebit: debit, totalCredit: credit, finalBalance: runningBalance };
  }, [entity, entityType, transactions, customerPayments, cashAdvances, saleReturns, purchases, supplierPayments, investments, entityId, dateRange, searchTerm]);

  const groupedEntries = useMemo(() => {
    const groups: Record<string, LedgerEntry[]> = {};
    entries.forEach(entry => {
      const dateKey = format(new Date(entry.timestamp), 'yyyy-MM-dd');
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(entry);
    });
    return groups;
  }, [entries]);

  const sortedDateKeys = useMemo(() => Object.keys(groupedEntries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()), [groupedEntries]);

  const handleQuickPeriod = (value: string) => {
    const now = new Date();
    if (value === 'this-month') setDateRange({ from: startOfMonth(now), to: endOfMonth(now) });
    else if (value === 'last-month') {
        const lastMonth = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        setDateRange({ from: lastMonth, to: endOfMonth(lastMonth) });
    } else if (value === 'all-time') setDateRange(undefined);
  };

  const handleDeleteEntry = () => {
    if (!entryToDelete) return;
    if (!isPinVerified() && deletePin !== '0200') {
      toast({ variant: 'destructive', title: 'Incorrect PIN' });
      return;
    }
    if (deletePin === '0200') confirmPin('0200');

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

  if (!isLoaded) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  if (!entity) return <div className="p-8 text-center text-destructive">Entity Not Found</div>;

  const getEditLink = (e: LedgerEntry) => {
    const [prefix, id] = e.id.split(/-(.*)/s);
    switch(prefix) {
        case 'tx': return `/sales?edit=${id}`; 
        case 'pur': return `/purchases?edit=${id}`;
        case 'pay': return `/customer-payments?edit=${id}`; 
        case 'adv': return `/cash-advances?edit=${id}`;
        case 'sr': return `/sale-returns?edit=${id}`;
        case 'inv': return `/investments?edit=${id}`;
        case 'spay': return `/supplier-payments?edit=${id}`;
        default: return '#';
    }
  };

  const balanceColor = (bal: number) => entityType === 'Customer' ? (bal > 0 ? 'text-destructive' : 'text-green-800') : (bal >= 0 ? 'text-green-800' : 'text-destructive');

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4 print:hidden">
        <div>
          <CardTitle className="text-2xl font-bold flex items-center gap-2"><BookUser /> {entityType} Ledger: <span className={cn(balanceColor(finalBalance))}>{entity.name}</span></CardTitle>
          <CardDescription>All transactions for this account.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full sm:w-48" />
          <Select onValueChange={handleQuickPeriod}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Quick Period"/></SelectTrigger>
            <SelectContent>
                <SelectItem value="this-month">This Month</SelectItem>
                <SelectItem value="last-month">Last Month</SelectItem>
                <SelectItem value="all-time">All Time</SelectItem>
            </SelectContent>
          </Select>
          <DateRangePicker date={dateRange} onDateChange={setDateRange} />
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print</Button>
          <Button asChild variant="outline"><Link href="/customers"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <Card className="bg-muted/50"><CardHeader className="py-2"><CardTitle className="text-xs uppercase">Total Debit</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">PKR {totalDebit.toLocaleString()}</div></CardContent></Card>
          <Card className="bg-muted/50"><CardHeader className="py-2"><CardTitle className="text-xs uppercase">Total Credit</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-800">PKR {totalCredit.toLocaleString()}</div></CardContent></Card>
          <Card className="bg-muted/50 border-2 border-primary/20"><CardHeader className="py-2"><CardTitle className="text-xs uppercase">Account Balance</CardTitle></CardHeader><CardContent><div className={cn("text-2xl font-bold", balanceColor(finalBalance))}>PKR {finalBalance.toLocaleString()}</div></CardContent></Card>
      </div>

      <div className="rounded-md border overflow-hidden">
          <Table>
              <TableHeader className="bg-muted/50">
                  <TableRow>
                      <TableHead className="w-12">No.</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-center print:hidden">Actions</TableHead>
                  </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDateKeys.map((dateKey) => {
                  const dayEntries = groupedEntries[dateKey];
                  const displayDate = format(new Date(dateKey), 'EEEE, dd MMMM yyyy');
                  
                  return (
                      <React.Fragment key={dateKey}>
                          <TableRow className="bg-red-600 hover:bg-red-700 border-none">
                              <TableCell colSpan={8} className="py-2 px-4 text-white font-bold h-10 align-middle">
                                  <span>{displayDate}</span>
                              </TableCell>
                          </TableRow>
                          {dayEntries.map((entry, index) => {
                              const serialNo = dayEntries.length - index;
                              return (
                              <TableRow key={entry.id} className="group">
                                  <TableCell className="text-xs font-mono text-muted-foreground">{serialNo}</TableCell>
                                  <TableCell className="font-medium whitespace-nowrap">{format(new Date(entry.timestamp), 'hh:mm a')}</TableCell>
                                  <TableCell>
                                      <div className="flex flex-col">
                                          <span className="font-bold text-red-600">{entry.description}</span>
                                          {entry.category && <span className="text-[10px] text-muted-foreground uppercase">{entry.category}</span>}
                                      </div>
                                  </TableCell>
                                  <TableCell className="text-xs italic text-muted-foreground min-w-[200px]">{entry.notes || ''}</TableCell>
                                  <TableCell className="text-right font-mono text-red-600 font-bold">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</TableCell>
                                  <TableCell className="text-right font-mono text-green-800 font-bold">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</TableCell>
                                  <TableCell className={cn("text-right font-mono font-bold", balanceColor(entry.balance))}>{entry.balance.toFixed(2)}</TableCell>
                                  <TableCell className="text-center print:hidden">
                                      <div className="flex justify-center gap-1">
                                          <Button asChild variant="ghost" size="icon" className="h-8 w-8 hover:text-primary">
                                              <Link href={getEditLink(entry)}><Pencil className="w-4 h-4" /></Link>
                                          </Button>
                                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setEntryToDelete(entry)}>
                                              <Trash2 className="w-4 h-4" />
                                          </Button>
                                      </div>
                                  </TableCell>
                              </TableRow>
                          )})}
                      </React.Fragment>
                  );
                })}
              </TableBody>
          </Table>
      </div>

      <AlertDialog open={!!entryToDelete} onOpenChange={(o) => { if (!o) { setEntryToDelete(null); setDeletePin(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="text-destructive"/> Delete Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete: <strong>{entryToDelete?.description}</strong>
              {!isPinVerified() && (
                <div className="mt-4 space-y-2">
                    <Label className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary"/> Security PIN Required:</Label>
                    <Input type="password" value={deletePin} onChange={(e) => setDeletePin(e.target.value)} placeholder="0200" maxLength={4} />
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntry} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
