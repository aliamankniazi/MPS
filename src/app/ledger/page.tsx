'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isValid, isSameDay, startOfDay, endOfDay, startOfToday, endOfToday } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { BookOpen, DollarSign, Trash2, TrendingUp, TrendingDown, Printer, Download, Package, X, AlertTriangle, Pencil, ShieldCheck } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';
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
import Link from 'next/link';
import * as XLSX from 'xlsx';
import type { Transaction, OtherIncome, Expense, DateRange, MachineReading } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { DateRangePicker } from '@/components/date-range-picker';
import { useAuth } from '@/hooks/use-auth';

type LedgerEntry = {
  id: string;
  timestamp: string;
  description: string;
  partnerName: string;
  entityId?: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
  original: any;
  isCreditSale?: boolean;
  isWalkIn?: boolean;
  notes?: string;
  journalColumn?: 'debit' | 'credit';
};

interface ProcessedReading extends MachineReading { previousReadingVolume?: number; dispensed: number; }
interface ComparisonSummary { fuelType: string; sales: number; dispensed: number; difference: number; }
type GroupedEntries = { [key: string]: { entries: LedgerEntry[]; openingBalance: number; closingBalance: number; totalDebit: number; totalCredit: number; dailySummary: any; machineReadings: ProcessedReading[]; comparisonSummary: ComparisonSummary[]; } };

const TRANSACTION_TYPES = ['Sale', 'Purchase', 'Expense', 'Purchase Return', 'Sale Return', 'Other Income', 'Customer Payment', 'Supplier Payment', 'Cash Advance', 'Investment', 'Withdrawal', 'Salary'];

export default function LedgerPage() {
  const { transactions, purchases, expenses, purchaseReturns, saleReturns, otherIncomes, supplierPayments, investments, customerPayments, cashAdvances, products, customers, suppliers, businessPartners, machineReadings, colorSettings, isLoaded, deleteTransaction, deletePurchase, deleteExpense, deleteSaleReturn, deleteOtherIncome, deleteSupplierPayment, deleteInvestment, deleteCustomerPayment, deleteCashAdvance } = useDatabase();
  const { isPinVerified, confirmPin } = useAuth();
  const [entryToDelete, setEntryToDelete] = useState<LedgerEntry | null>(null);
  const [deletePin, setDeletePin] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [showJournal, setShowJournal] = useState(true);
  const { toast } = useToast();
  const [localDateRange, setLocalDateRange] = useState<DateRange | undefined>();
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [showDeleteSelectedDialog, setShowDeleteSelectedDialog] = useState(false);

  const allEntries = useMemo(() => {
    if (!isLoaded) return [];
    let combined: Omit<LedgerEntry, 'balance'>[] = [];
    transactions.forEach(tx => {
        const isWalkIn = tx.isWalkIn ?? (!tx.customerId || tx.customerId === 'walkin');
        combined.push({ id: `tx-${tx.id}`, timestamp: tx.timestamp, description: tx.volume ? `${tx.volume.toFixed(2)}L of ${tx.fuelType}` : (tx.product || 'Sale'), partnerName: customers.find(c => c.id === tx.customerId)?.name || 'Walk-in', entityId: tx.customerId, type: isWalkIn ? 'cash_sale' : 'credit_sale', debit: isWalkIn ? 0 : tx.totalAmount, credit: isWalkIn ? tx.totalAmount : 0, original: tx, notes: tx.notes });
    });
    customerPayments.forEach(cp => { if (cp.paymentMethod !== 'Salary') combined.push({ id: `cp-${cp.id}`, timestamp: cp.timestamp, description: 'Payment Received', partnerName: cp.customerName, entityId: cp.customerId, type: 'Customer Payment', debit: 0, credit: cp.amount, original: cp, notes: cp.notes }); });
    cashAdvances.forEach(ca => combined.push({ id: `ca-${ca.id}`, timestamp: ca.timestamp, description: 'Cash Advance', partnerName: ca.customerName, entityId: ca.customerId, type: 'Cash Advance', debit: ca.amount, credit: 0, original: ca, notes: ca.notes }));
    purchases.forEach(p => combined.push({ id: `pur-${p.id}`, timestamp: p.timestamp, description: `${p.volume.toFixed(2)}L of ${p.fuelType}`, partnerName: p.supplier, entityId: p.supplierId, type: 'Purchase', debit: 0, credit: p.totalCost, original: p }));
    supplierPayments.forEach(sp => combined.push({ id: `sp-${sp.id}`, timestamp: sp.timestamp, description: `Payment Made (${sp.paymentMethod})`, partnerName: sp.supplierName, entityId: sp.supplierId, type: 'Supplier Payment', debit: sp.amount, credit: 0, original: sp }));
    expenses.forEach(e => combined.push({ id: `exp-${e.id}`, timestamp: e.timestamp, description: e.description, partnerName: e.category === 'Salaries' ? e.description.replace('Salary for ', '').replace(/ \(.*/, '') : 'Internal', type: e.category === 'Salaries' ? 'Salary' : 'Expense', debit: e.amount, credit: 0, original: e }));
    saleReturns.forEach(sr => combined.push({ id: `sr-${sr.id}`, timestamp: sr.timestamp, description: `Return: ${sr.volume.toFixed(2)}L ${sr.fuelType}`, partnerName: sr.customerName, entityId: sr.customerId, type: 'Sale Return', debit: 0, credit: sr.totalRefund, original: sr, notes: sr.reason }));
    purchaseReturns.forEach(pr => combined.push({ id: `pr-${pr.id}`, timestamp: pr.timestamp, description: `Return: ${pr.volume.toFixed(2)}L ${pr.fuelType}`, partnerName: pr.supplier, entityId: pr.supplierId, type: 'Purchase Return', debit: pr.totalRefund, credit: 0, original: pr, notes: pr.reason }));
    otherIncomes.forEach(oi => combined.push({ id: `oi-${oi.id}`, timestamp: oi.timestamp, description: oi.description, partnerName: 'Internal', type: 'Other Income', debit: 0, credit: oi.amount, original: oi }));
    investments.forEach(inv => {
        if (inv.type === 'Investment') combined.push({ id: `inv-${inv.id}`, timestamp: inv.timestamp, description: 'Investment', partnerName: inv.partnerName, entityId: inv.partnerId, type: 'Investment', debit: 0, credit: inv.amount, original: inv, notes: inv.notes });
        else combined.push({ id: `wdr-${inv.id}`, timestamp: inv.timestamp, description: 'Withdrawal', partnerName: inv.partnerName, entityId: inv.partnerId, type: 'Withdrawal', debit: inv.amount, credit: 0, original: inv, notes: inv.notes });
    });
    combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    let bal = 0; return combined.map(e => { bal += e.debit - e.credit; return { ...e, balance: bal }; });
  }, [isLoaded, transactions, purchases, expenses, purchaseReturns, saleReturns, otherIncomes, customerPayments, supplierPayments, investments, cashAdvances, customers]);

  const filteredEntries = useMemo(() => {
    if (!localDateRange?.from) return [];
    const from = startOfDay(localDateRange.from), to = localDateRange.to ? endOfDay(localDateRange.to) : endOfDay(from);
    let ent = allEntries.filter(e => isValid(new Date(e.timestamp)) && new Date(e.timestamp) >= from && new Date(e.timestamp) <= to);
    if (searchTerm) ent = ent.filter(e => e.description.toLowerCase().includes(searchTerm.toLowerCase()) || e.partnerName.toLowerCase().includes(searchTerm.toLowerCase()));
    if (selectedType && selectedType !== 'all') ent = ent.filter(e => e.type === selectedType);
    return ent;
  }, [allEntries, searchTerm, localDateRange, selectedType]);

  const groupedEntries: GroupedEntries = useMemo(() => {
    if (!localDateRange?.from) return {};
    const from = startOfDay(localDateRange.from);
    let lastBal = allEntries.filter(e => isValid(new Date(e.timestamp)) && new Date(e.timestamp) < from).reduce((b, i) => b + i.debit - i.credit, 0);
    const result: GroupedEntries = {};
    const dayKeys = [...new Set(filteredEntries.map(e => format(new Date(e.timestamp), 'yyyy-MM-dd')))].sort();
    for (const key of dayKeys) {
        const dayEnt = filteredEntries.filter(e => format(new Date(e.timestamp), 'yyyy-MM-dd') === key);
        const opening = lastBal;
        const debit = dayEnt.reduce((s, e) => s + e.debit, 0), credit = dayEnt.reduce((s, e) => s + e.credit, 0);
        lastBal = opening + debit - credit;
        result[key] = { entries: dayEnt, openingBalance: opening, closingBalance: lastBal, totalDebit: debit, totalCredit: credit, dailySummary: {}, machineReadings: [], comparisonSummary: [] };
    }
    return result;
  }, [filteredEntries, allEntries, localDateRange]);

  useEffect(() => {
    if (isLoaded && !localDateRange) setLocalDateRange({ from: startOfToday(), to: endOfToday() });
  }, [isLoaded, localDateRange]);

  const handleDeleteEntry = () => {
    if (!entryToDelete) return;
    if (!isPinVerified() && deletePin !== '0200') { toast({ variant: 'destructive', title: 'Incorrect PIN' }); return; }
    if (deletePin === '0200') confirmPin('0200');
    const [prefix, id] = entryToDelete.id.split(/-(.*)/s);
    try {
        switch(prefix) {
            case 'tx': deleteTransaction(id); break;
            case 'pur': deletePurchase(id); break;
            case 'cp': deleteCustomerPayment(id); break;
            case 'sp': deleteSupplierPayment(id); break;
            case 'exp': deleteExpense(id); break;
            case 'sr': deleteSaleReturn(id); break;
            case 'oi': deleteOtherIncome(id); break;
            case 'inv': case 'wdr': deleteInvestment(id); break;
            case 'ca': deleteCashAdvance(id); break;
        }
        toast({ title: 'Deleted' });
    } catch (e) {}
    setEntryToDelete(null); setDeletePin('');
  };

  const getEditLink = (e: LedgerEntry) => {
    const [p, id] = e.id.split(/-(.*)/s);
    switch(p) {
        case 'tx': return `/sales?edit=${id}`; case 'pur': return `/purchases?edit=${id}`;
        case 'cp': return `/customer-payments?edit=${id}`; case 'sp': return `/supplier-payments?edit=${id}`;
        case 'exp': return `/expenses?edit=${id}`; case 'sr': return `/sale-returns?edit=${id}`;
        case 'oi': return `/other-incomes?edit=${id}`; case 'inv': case 'wdr': return `/investments?edit=${id}`;
        case 'ca': return `/cash-advances?edit=${id}`; default: return '#';
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
       <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><BookOpen /> Journal</h1><p className="text-muted-foreground">Record of all transactions.</p></div>
        <div className="flex flex-col sm:flex-row items-center gap-2">
           <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full md:w-48" />
            <Select value={selectedType} onValueChange={setSelectedType}><SelectTrigger className="w-full md:w-48"><SelectValue placeholder="Filter type" /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem>{TRANSACTION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
            <DateRangePicker date={localDateRange} onDateChange={setLocalDateRange} /><Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4"/> Print</Button>
        </div>
       </header>
      <Card><CardHeader><CardTitle>Daily Overview</CardTitle></CardHeader><CardContent>
            {Object.keys(groupedEntries).length > 0 ? (
                <Accordion type="multiple" className="w-full space-y-4" defaultValue={[format(new Date(), 'yyyy-MM-dd')]}>
                    {Object.keys(groupedEntries).sort((a,b) => b.localeCompare(a)).map(key => {
                       const day = groupedEntries[key];
                        return (
                        <AccordionItem value={key} key={key} className="border border-red-500 rounded-lg overflow-hidden"><AccordionTrigger className="p-4"><div className="flex justify-between w-full pr-4"><span>{format(new Date(key), 'EEEE, dd MMMM yyyy')}</span><span className="font-mono">Closing: {day.closingBalance.toLocaleString()}</span></div></AccordionTrigger>
                            <AccordionContent className="p-4"><div className="border rounded-md"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Partner</TableHead><TableHead>Particulars</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="text-center">Actions</TableHead></TableRow></TableHeader><TableBody>
                                            {day.entries.slice().reverse().map(e => (<TableRow key={e.id}><TableCell className="whitespace-nowrap">{format(new Date(e.timestamp), 'hh:mm a')}</TableCell><TableCell className="font-bold">{e.partnerName}</TableCell><TableCell>{e.description}</TableCell><TableCell className="text-right text-destructive">{e.debit ? e.debit.toFixed(2) : '-'}</TableCell><TableCell className="text-right text-green-600">{e.credit ? e.credit.toFixed(2) : '-'}</TableCell><TableCell className="text-right font-bold">{e.balance.toFixed(2)}</TableCell><TableCell className="text-center space-x-1"><Button asChild variant="ghost" size="icon"><Link href={getEditLink(e)}><Pencil className="w-4 h-4" /></Link></Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => setEntryToDelete(e)}><Trash2 className="w-4 h-4" /></Button></TableCell></TableRow>))}
                                        </TableBody></Table></div></AccordionContent></AccordionItem>
                        )
                    })}
                </Accordion>
            ) : <p className="text-center p-8">No records.</p>}</CardContent></Card>
      <AlertDialog open={!!entryToDelete} onOpenChange={(o) => { if (!o) { setEntryToDelete(null); setDeletePin(''); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Entry?</AlertDialogTitle><AlertDialogDescription>This will permanently delete: <strong>{entryToDelete?.description}</strong>.
              {!isPinVerified() && (<div className="mt-4 space-y-2"><Label>Security PIN:</Label><Input type="password" value={deletePin} onChange={(e) => setDeletePin(e.target.value)} placeholder="0200" /></div>)}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteEntry} className="bg-destructive">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>
  );
}
