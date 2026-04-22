'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { format, isValid, startOfDay, endOfDay, isSameDay } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { HandCoins, XCircle, Calendar as CalendarIcon, X, TrendingUp, TrendingDown, Wallet, BookText, Pencil, Trash2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useDatabase } from '@/hooks/use-database';
import { useToast } from '@/hooks/use-toast';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';


type CombinedEntry = {
  id: string;
  timestamp: string;
  entityId: string;
  entityName: string;
  entityType: 'Customer' | 'Supplier' | 'Partner';
  type: 'Sale' | 'Payment' | 'Cash Advance' | 'Purchase' | 'Supplier Payment' | 'Investment' | 'Withdrawal' | 'Sale Return' | 'Purchase Return';
  description: string;
  debit: number;
  credit: number;
  balance?: number;
  notes?: string;
};

export default function PartnerLedgerPage() {
  const { 
      customerPayments, 
      customers, 
      transactions, 
      cashAdvances, 
      suppliers, 
      purchases, 
      supplierPayments, 
      businessPartners, 
      investments,
      saleReturns,
      purchaseReturns,
      isLoaded,
      deleteTransaction,
      deleteCustomerPayment,
      deleteCashAdvance,
      deletePurchase,
      deleteSupplierPayment,
      deleteInvestment,
      deleteSaleReturn,
      deletePurchaseReturn,
  } = useDatabase();
  
  const { isPinVerified, confirmPin } = useAuth();
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [entryToDelete, setEntryToDelete] = useState<CombinedEntry | null>(null);
  const [deletePin, setDeletePin] = useState('');
  const { toast } = useToast();

  const entities = useMemo(() => {
    if (!isLoaded) return [];
    const entityMap = new Map<string, { id: string; name: string; type: 'Customer' | 'Supplier' | 'Partner' }>();
    customers.forEach(c => entityMap.set(c.id, { id: c.id, name: c.name, type: 'Customer' }));
    suppliers.forEach(s => entityMap.set(s.id, { id: s.id, name: s.name, type: 'Supplier' }));
    businessPartners.forEach(p => entityMap.set(p.id, { id: p.id, name: p.name, type: 'Partner' }));
    return Array.from(entityMap.values()).sort((a,b) => a.name.localeCompare(b.name));
  }, [customers, suppliers, businessPartners, isLoaded]);

  const { entries, totals, finalBalance, specialReport } = useMemo(() => {
    if (!isLoaded) return { entries: [], totals: { debit: 0, credit: 0 }, finalBalance: 0, specialReport: null };

    const combined: Omit<CombinedEntry, 'balance'>[] = [];

    transactions.forEach(tx => {
      if (tx.customerId) {
        const isCredit = tx.paymentMethod === 'Credit';
        combined.push({
          id: `tx-${tx.id}`,
          timestamp: tx.timestamp,
          entityId: tx.customerId,
          entityName: tx.customerName || 'N/A',
          entityType: 'Customer',
          type: 'Sale',
          description: tx.volume ? `${tx.volume.toFixed(2)}L of ${tx.fuelType}` : (tx.product || 'General Sale'),
          debit: tx.totalAmount,
          credit: isCredit ? 0 : tx.totalAmount, // Cash sales are Debit and Credit (wash)
          notes: tx.notes
        });
      }
    });

    customerPayments.forEach(p => {
      combined.push({
        id: `pay-${p.id}`,
        timestamp: p.timestamp,
        entityId: p.customerId,
        entityName: p.customerName,
        entityType: 'Customer',
        type: 'Payment',
        description: `Payment Received (${p.paymentMethod})`,
        debit: 0,
        credit: p.amount,
        notes: p.notes
      });
    });

    cashAdvances.forEach(ca => {
      combined.push({
        id: `adv-${ca.id}`,
        timestamp: ca.timestamp,
        entityId: ca.customerId,
        entityName: ca.customerName,
        entityType: 'Customer',
        type: 'Cash Advance',
        description: ca.notes || 'Cash Advance',
        debit: ca.amount,
        credit: 0,
        notes: ca.notes
      });
    });
    
    purchases.forEach(p => {
        combined.push({
            id: `pur-${p.id}`,
            timestamp: p.timestamp,
            entityId: p.supplierId,
            entityName: p.supplier,
            entityType: 'Supplier',
            type: 'Purchase',
            description: p.volume ? `${p.volume.toFixed(2)}L of ${p.fuelType}` : p.fuelType,
            debit: 0,
            credit: p.totalCost,
        });
    });

    supplierPayments.forEach(sp => {
        combined.push({
            id: `sp-${sp.id}`,
            timestamp: sp.timestamp,
            entityId: sp.supplierId,
            entityName: sp.supplierName,
            entityType: 'Supplier',
            type: 'Supplier Payment',
            description: `Payment Made (${sp.paymentMethod})`,
            debit: sp.amount,
            credit: 0,
        });
    });

    investments.forEach(inv => {
        combined.push({
            id: `inv-${inv.id}`,
            timestamp: inv.timestamp,
            entityId: inv.partnerId,
            entityName: inv.partnerName,
            entityType: 'Partner',
            type: inv.type,
            description: inv.notes || inv.type,
            debit: inv.type === 'Withdrawal' ? inv.amount : 0,
            credit: inv.type === 'Investment' ? inv.amount : 0,
            notes: inv.notes
        });
    });

    saleReturns.forEach(sr => {
        combined.push({
            id: `sr-${sr.id}`,
            timestamp: sr.timestamp,
            entityId: sr.customerId,
            entityName: sr.customerName,
            entityType: 'Customer',
            type: 'Sale Return',
            description: `Return: ${sr.volume.toFixed(2)}L of ${sr.fuelType}`,
            debit: 0,
            credit: sr.totalRefund,
            notes: sr.reason
        });
    });

    purchaseReturns.forEach(pr => {
        combined.push({
            id: `pr-${pr.id}`,
            timestamp: pr.timestamp,
            entityId: pr.supplierId,
            entityName: pr.supplier,
            entityType: 'Supplier',
            type: 'Purchase Return',
            description: `Return: ${pr.volume.toFixed(2)}L of ${pr.fuelType}`,
            debit: pr.totalRefund,
            credit: 0,
            notes: pr.reason
        });
    });

    combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const entityFilteredEntries = selectedEntityId 
      ? combined.filter(entry => entry.entityId === selectedEntityId)
      : combined;
      
    let reportData = null;
    if (selectedEntityId && entityFilteredEntries.length > 0) {
        const lastDebitEntry = [...entityFilteredEntries].reverse().find(e => e.debit > 0);
        const lastCreditEntry = [...entityFilteredEntries].reverse().find(e => e.credit > 0);
        const entityType = entities.find(e => e.id === selectedEntityId)?.type;
        let totalBal = 0;
        if (entityType === 'Partner' || entityType === 'Supplier') {
            totalBal = entityFilteredEntries.reduce((acc, entry) => acc + (entry.credit - entry.debit), 0);
        } else {
            totalBal = entityFilteredEntries.reduce((acc, entry) => acc + (entry.debit - entry.credit), 0);
        }
        reportData = { totalBalance: totalBal, lastDebit: lastDebitEntry?.debit || 0, lastCredit: lastCreditEntry?.credit || 0, entityType: entityType || 'Customer' };
    }

    let openingBalance = 0;
    let entriesForDisplay = entityFilteredEntries;
    
    if (selectedDate) {
      const startOfSelectedDay = startOfDay(selectedDate);
      openingBalance = entityFilteredEntries
        .filter(entry => isValid(new Date(entry.timestamp)) && new Date(entry.timestamp) < startOfSelectedDay)
        .reduce((acc, entry) => {
            const entityType = entities.find(e => e.id === entry.entityId)?.type;
            if(entityType === 'Partner' || entityType === 'Supplier') return acc + (entry.credit - entry.debit);
            return acc + (entry.debit - entry.credit);
        }, 0);
      entriesForDisplay = entityFilteredEntries.filter(entry => isSameDay(new Date(entry.timestamp), selectedDate));
    }

    let runningBalance = openingBalance;
    const entriesWithBalance: CombinedEntry[] = entriesForDisplay.map(entry => {
        const entityType = entities.find(e => e.id === entry.entityId)?.type;
        if(entityType === 'Partner' || entityType === 'Supplier') runningBalance += entry.credit - entry.debit;
        else runningBalance += entry.debit - entry.credit;
        return { ...entry, balance: runningBalance };
    });

    const calculatedTotals = entriesForDisplay.reduce((acc, entry) => { acc.debit += entry.debit; acc.credit += entry.credit; return acc; }, { debit: 0, credit: 0 });
    
    return { entries: entriesWithBalance.reverse(), totals: calculatedTotals, finalBalance: runningBalance, specialReport: reportData };
  }, [customerPayments, transactions, cashAdvances, purchases, supplierPayments, investments, saleReturns, purchaseReturns, selectedEntityId, selectedDate, isLoaded, entities]);
  
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
        else if (prefix === 'pur') deletePurchase(id);
        else if (prefix === 'sp') deleteSupplierPayment(id);
        else if (prefix === 'inv') deleteInvestment(id);
        else if (prefix === 'sr') deleteSaleReturn(id);
        else if (prefix === 'pr') deletePurchaseReturn(id);
        toast({ title: 'Entry Deleted' });
    } catch (e) { toast({ variant: 'destructive', title: 'Error' }); }
    setEntryToDelete(null);
    setDeletePin('');
  };

  const getBadgeVariant = (type: CombinedEntry['type']) => {
    if (['Sale', 'Cash Advance', 'Supplier Payment', 'Withdrawal'].includes(type)) return 'destructive';
    return 'outline';
  };

  const clearFilters = () => { setSelectedEntityId(''); setSelectedDate(undefined); };
  const hasActiveFilters = selectedEntityId || selectedDate;
  const selectedEntity = entities.find(e => e.id === selectedEntityId);

  const getEditLink = (entry: CombinedEntry) => {
    const [prefix, id] = entry.id.split(/-(.*)/s);
    switch(prefix) {
        case 'tx': return `/sales?edit=${id}`;
        case 'pur': return `/purchases?edit=${id}`;
        case 'pay': return `/customer-payments?edit=${id}`;
        case 'adv': return `/cash-advances?edit=${id}`;
        case 'inv': return `/investments?edit=${id}`;
        case 'sr': return `/sale-returns?edit=${id}`;
        case 'pr': return `/purchase-returns?edit=${id}`;
        case 'sp': return `/supplier-payments?edit=${id}`;
        default: return '#';
    }
  };


  return (
    <>
    <div className="p-4 md:p-8 space-y-6">
       <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HandCoins /> Unified Ledger</CardTitle>
          <CardDescription>A unified record of all transactions.</CardDescription>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-4">
              <Select value={selectedEntityId} onValueChange={(v) => setSelectedEntityId(v === 'all' ? '' : v)}>
                <SelectTrigger className="sm:w-[240px]"><SelectValue placeholder="Filter by partner..." /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Partners</SelectItem>{entities.map(e => (<SelectItem key={e.id} value={e.id}>{e.name} ({e.type})</SelectItem>))}</SelectContent>
              </Select>
              <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full sm:w-[240px] justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{selectedDate ? format(selectedDate, "PPP") : <span>Filter by date...</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus /></PopoverContent></Popover>
              {hasActiveFilters && <Button variant="ghost" onClick={clearFilters}><X className="mr-2 h-4 w-4" />Clear</Button>}
          </div>
        </CardHeader>
      </Card>

      {selectedEntityId && specialReport && selectedEntity && (
        <Card><CardHeader><CardTitle className="text-lg">{selectedEntity.type} Report for {selectedEntity.name}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet /> Total Balance</div>
                    <div className={`text-2xl font-bold ${specialReport.entityType === 'Partner' ? (specialReport.totalBalance >= 0 ? 'text-green-800' : 'text-destructive') : (specialReport.totalBalance > 0 ? 'text-destructive' : 'text-green-800')}`}>PKR {specialReport.totalBalance.toLocaleString()}</div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg"><div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingDown /> Last Debit</div><div className="text-2xl font-bold text-destructive">PKR {specialReport.lastDebit.toLocaleString()}</div></div>
                <div className="p-4 bg-muted/50 rounded-lg"><div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp /> Last Credit</div><div className="text-2xl font-bold text-green-800">PKR {specialReport.lastCredit.toLocaleString()}</div></div>
            </CardContent>
        </Card>
      )}

      <Card><CardHeader><CardTitle>Transaction History</CardTitle></CardHeader>
        <CardContent>
          {isLoaded && entries.length > 0 ? (
            <Table><TableHeader><TableRow><TableHead className="w-12">No.</TableHead><TableHead>Date</TableHead><TableHead>Partner</TableHead><TableHead>Description</TableHead><TableHead>Notes</TableHead><TableHead className="text-center">Type</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="text-center">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {entries.map((entry, index) => {
                    const date = new Date(entry.timestamp);
                    const serialNo = entries.length - index;
                    return (
                        <TableRow key={entry.id}>
                          <TableCell className="text-xs font-mono text-muted-foreground">{serialNo}</TableCell>
                          <TableCell className="font-medium whitespace-nowrap">{isValid(date) ? format(date, 'PP pp') : 'Invalid'}</TableCell>
                          <TableCell><div>{entry.entityName}</div><div className="text-xs text-muted-foreground">{entry.entityType}</div></TableCell>
                          <TableCell>{entry.description}</TableCell>
                          <TableCell className="text-xs italic text-muted-foreground max-w-[150px] truncate">{entry.notes || ''}</TableCell>
                          <TableCell className="text-center"><Badge variant={getBadgeVariant(entry.type)}>{entry.type}</Badge></TableCell>
                          <TableCell className="text-right font-mono text-destructive">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</TableCell>
                          <TableCell className="text-right font-mono text-green-800">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</TableCell>
                          <TableCell className={cn("text-right font-semibold font-mono", entry.balance && entry.balance > 0 ? 'text-destructive' : 'text-green-800')}>{entry.balance?.toFixed(2)}</TableCell>
                          <TableCell className="text-center space-x-1">
                            <Button asChild variant="ghost" size="icon" title="Edit">
                                <Link href={getEditLink(entry)}>
                                    <Pencil className="w-4 h-4" />
                                </Link>
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setEntryToDelete(entry)}><Trash2 className="w-4 h-4" /></Button>
                          </TableCell>
                        </TableRow>
                    )
                })}
              </TableBody>
               <TableFooter><TableRow><TableCell colSpan={6} className="font-bold text-right">Totals</TableCell><TableCell className="text-right font-bold text-destructive">PKR {totals.debit.toFixed(2)}</TableCell><TableCell className="text-right font-bold text-green-800">PKR {totals.credit.toFixed(2)}</TableCell><TableCell colSpan={2} /></TableRow></TableFooter>
            </Table>
          ) : <div className="text-center p-8 text-muted-foreground">No transactions found.</div>}
        </CardContent>
      </Card>
    </div>
    <AlertDialog open={!!entryToDelete} onOpenChange={(isOpen) => { if (!isOpen) { setEntryToDelete(null); setDeletePin(''); } }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><Trash2 className="text-destructive"/> Delete Entry?</AlertDialogTitle><AlertDialogDescription>Delete: {entryToDelete?.description}
        {!isPinVerified() && (
            <div className="mt-4 space-y-2">
                <Label className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary"/> Security PIN Required:</Label>
                <Input type="password" value={deletePin} onChange={(e) => setDeletePin(e.target.value)} placeholder="0200" maxLength={4} />
            </div>
        )}
        </AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel onClick={() => setDeletePin('')}>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteEntry} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
    </>
  );
}
