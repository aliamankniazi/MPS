'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isValid, startOfDay, endOfDay, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth, getYear } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Trash2, Printer, Pencil, ShieldCheck, Search, BarChart3, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
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
import type { DateRange } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '@/components/date-range-picker';
import { useAuth } from '@/hooks/use-auth';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";

type LedgerEntry = {
  id: string;
  originalId: string;
  timestamp: string;
  description: string;
  partnerName: string;
  entityId?: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
  original: any;
  notes?: string;
};

type GroupedEntries = { 
  [key: string]: { 
    entries: LedgerEntry[]; 
    openingBalance: number; 
    closingBalance: number; 
    totalDebit: number; 
    totalCredit: number; 
  } 
};

const TRANSACTION_TYPES = [
  { value: 'cash_sale', label: 'Cash Sale' },
  { value: 'credit_sale', label: 'Credit Sale' },
  { value: 'Purchase', label: 'Purchase' },
  { value: 'Expense', label: 'Expense' },
  { value: 'Salary', label: 'Salary' },
  { value: 'Customer Payment', label: 'Customer Payment' },
  { value: 'Supplier Payment', label: 'Supplier Payment' },
  { value: 'Cash Advance', label: 'Cash Advance' },
  { value: 'Investment', label: 'Investment' },
  { value: 'Withdrawal', label: 'Withdrawal' },
  { value: 'Sale Return', label: 'Sale Return' },
  { value: 'Purchase Return', label: 'Purchase Return' },
  { value: 'Other Income', label: 'Other Income' },
  { value: 'Meter Reading', label: 'Meter Reading' },
];

const chartConfig = {
  sales: {
    label: "Sales",
    color: "hsl(var(--chart-2))", // Green
  },
  purchases: {
    label: "Purchases",
    color: "hsl(var(--chart-3))", // Yellow/Amber
  },
  expenses: {
    label: "Expenses",
    color: "hsl(var(--chart-5))", // Red
  },
  investment: {
    label: "Investment",
    color: "hsl(var(--chart-1))", // Blue
  },
  withdrawal: {
    label: "Withdrawal",
    color: "hsl(var(--chart-4))", // Orange
  },
} satisfies ChartConfig;

export default function LedgerPage() {
  const { 
    transactions, purchases, expenses, purchaseReturns, saleReturns, 
    otherIncomes, supplierPayments, investments, customerPayments, 
    cashAdvances, machineReadings, colorSettings, isLoaded, 
    deleteTransaction, deletePurchase, deleteExpense, deleteSaleReturn, 
    deleteOtherIncome, deleteSupplierPayment, deleteInvestment, 
    deleteCustomerPayment, deleteCashAdvance, deleteMachineReading
  } = useDatabase();
  
  const { isPinVerified, confirmPin } = useAuth();
  const [entryToDelete, setEntryToDelete] = useState<LedgerEntry | null>(null);
  const [deletePin, setDeletePin] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const { toast } = useToast();
  
  const [localDateRange, setLocalDateRange] = useState<DateRange | undefined>({
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date())
  });

  const allEntries = useMemo(() => {
    if (!isLoaded) return [];
    let combined: Omit<LedgerEntry, 'balance'>[] = [];

    transactions.forEach(tx => {
        const isWalkIn = tx.isWalkIn ?? (!tx.customerId || tx.customerId === 'walkin');
        combined.push({ 
          id: `tx-${tx.id}`, 
          originalId: tx.id,
          timestamp: tx.timestamp, 
          description: tx.volume ? `${tx.volume.toFixed(2)}L of ${tx.fuelType}` : (tx.product || 'Sale'), 
          partnerName: tx.customerName || 'Walk-in Customer', 
          entityId: tx.customerId, 
          type: isWalkIn ? 'cash_sale' : 'credit_sale', 
          debit: isWalkIn ? 0 : tx.totalAmount, 
          credit: isWalkIn ? tx.totalAmount : 0, 
          original: tx, 
          notes: tx.notes 
        });
    });

    customerPayments.forEach(cp => { 
      if (cp.paymentMethod !== 'Salary') {
        combined.push({ 
          id: `cp-${cp.id}`, 
          originalId: cp.id,
          timestamp: cp.timestamp, 
          description: 'Payment Received', 
          partnerName: cp.customerName, 
          entityId: cp.customerId, 
          type: 'Customer Payment', 
          debit: 0, 
          credit: cp.amount, 
          original: cp, 
          notes: cp.notes 
        }); 
      }
    });

    cashAdvances.forEach(ca => {
      combined.push({ 
        id: `ca-${ca.id}`, 
        originalId: ca.id,
        timestamp: ca.timestamp, 
        description: 'Cash Advance', 
        partnerName: ca.customerName, 
        entityId: ca.customerId, 
        type: 'Cash Advance', 
        debit: ca.amount, 
        credit: 0, 
        original: ca, 
        notes: ca.notes 
      });
    });

    purchases.forEach(p => {
      combined.push({ 
        id: `pur-${p.id}`, 
        originalId: p.id,
        timestamp: p.timestamp, 
        description: `${p.volume.toFixed(2)}L of ${p.fuelType}`, 
        partnerName: p.supplier, 
        entityId: p.supplierId, 
        type: 'Purchase', 
        debit: 0, 
        credit: p.totalCost, 
        original: p 
      });
    });

    supplierPayments.forEach(sp => {
      combined.push({ 
        id: `sp-${sp.id}`, 
        originalId: sp.id,
        timestamp: sp.timestamp, 
        description: `Payment Made (${sp.paymentMethod})`, 
        partnerName: sp.supplierName, 
        entityId: sp.supplierId, 
        type: 'Supplier Payment', 
        debit: sp.amount, 
        credit: 0, 
        original: sp 
      });
    });

    expenses.forEach(e => {
      combined.push({ 
        id: `exp-${e.id}`, 
        originalId: e.id,
        timestamp: e.timestamp, 
        description: e.description, 
        partnerName: e.category === 'Salaries' ? e.description.replace('Salary for ', '').replace(/ \(.*/, '') : 'Internal', 
        type: e.category === 'Salaries' ? 'Salary' : 'Expense', 
        debit: e.amount, 
        credit: 0, 
        original: e 
      });
    });

    saleReturns.forEach(sr => {
      combined.push({ 
        id: `sr-${sr.id}`, 
        originalId: sr.id,
        timestamp: sr.timestamp, 
        description: `Return: ${sr.volume.toFixed(2)}L ${sr.fuelType}`, 
        partnerName: sr.customerName, 
        entityId: sr.customerId, 
        type: 'Sale Return', 
        debit: 0, 
        credit: sr.totalRefund, 
        original: sr, 
        notes: sr.reason 
      });
    });

    purchaseReturns.forEach(pr => {
      combined.push({ 
        id: `pr-${pr.id}`, 
        originalId: pr.id,
        timestamp: pr.timestamp, 
        description: `Return: ${pr.volume.toFixed(2)}L ${pr.fuelType}`, 
        partnerName: pr.supplier, 
        entityId: pr.supplierId, 
        type: 'Purchase Return', 
        debit: pr.totalRefund, 
        credit: 0, 
        original: pr, 
        notes: pr.reason 
      });
    });

    otherIncomes.forEach(oi => {
      combined.push({ 
        id: `oi-${oi.id}`, 
        originalId: oi.id,
        timestamp: oi.timestamp, 
        description: oi.description, 
        partnerName: 'Internal', 
        type: 'Other Income', 
        debit: 0, 
        credit: oi.amount, 
        original: oi 
      });
    });

    investments.forEach(inv => {
        if (inv.type === 'Investment') {
          combined.push({ 
            id: `inv-${inv.id}`, 
            originalId: inv.id,
            timestamp: inv.timestamp, 
            description: 'Investment', 
            partnerName: inv.partnerName, 
            entityId: inv.partnerId, 
            type: 'Investment', 
            debit: 0, 
            credit: inv.amount, 
            original: inv, 
            notes: inv.notes 
          });
        } else {
          combined.push({ 
            id: `wdr-${inv.id}`, 
            originalId: inv.id,
            timestamp: inv.timestamp, 
            description: 'Withdrawal', 
            partnerName: inv.partnerName, 
            entityId: inv.partnerId, 
            type: 'Withdrawal', 
            debit: inv.amount, 
            credit: 0, 
            original: inv, 
            notes: inv.notes 
          });
        }
    });

    machineReadings.forEach(mr => {
        combined.push({
            id: `mr-${mr.id}`,
            originalId: mr.id,
            timestamp: mr.timestamp,
            description: `Closing: ${mr.volume.toLocaleString()} Ltr`,
            partnerName: mr.machineName,
            type: 'Meter Reading',
            debit: 0,
            credit: 0,
            original: mr,
            notes: `Fuel: ${mr.fuelType}`
        });
    });

    combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    let bal = 0; 
    return combined.map(e => { 
      bal += e.debit - e.credit; 
      return { ...e, balance: bal }; 
    });
  }, [isLoaded, transactions, purchases, expenses, purchaseReturns, saleReturns, otherIncomes, customerPayments, supplierPayments, investments, cashAdvances, machineReadings]);

  const monthlyChartData = useMemo(() => {
    if (!isLoaded) return [];

    const currentYear = getYear(localDateRange?.from || new Date());
    const yearStart = startOfYear(new Date(currentYear, 0, 1));
    const yearEnd = endOfYear(new Date(currentYear, 0, 1));
    
    const monthsInYear = eachMonthOfInterval({ start: yearStart, end: yearEnd });

    return monthsInYear.map(month => {
        const mStart = startOfMonth(month);
        const mEnd = endOfMonth(month);

        const monthEntries = allEntries.filter(e => {
            const d = new Date(e.timestamp);
            return isValid(d) && d >= mStart && d <= mEnd;
        });

        const sales = monthEntries
            .filter(e => e.type === 'cash_sale' || e.type === 'credit_sale')
            .reduce((sum, e) => {
                if (e.original && typeof e.original.totalAmount === 'number') {
                    return sum + e.original.totalAmount;
                }
                return sum + (e.debit || e.credit || 0);
            }, 0);

        const monthlyPurchases = monthEntries
            .filter(e => e.type === 'Purchase')
            .reduce((sum, e) => sum + e.credit, 0);

        const monthlyExpenses = monthEntries
            .filter(e => e.type === 'Expense' || e.type === 'Salary')
            .reduce((sum, e) => sum + e.debit, 0);

        const monthlyInvestments = monthEntries
            .filter(e => e.type === 'Investment')
            .reduce((sum, e) => sum + e.credit, 0);

        const monthlyWithdrawals = monthEntries
            .filter(e => e.type === 'Withdrawal')
            .reduce((sum, e) => sum + e.debit, 0);

        return {
            month: format(month, 'MMM'),
            sales,
            purchases: monthlyPurchases,
            expenses: monthlyExpenses,
            investment: monthlyInvestments,
            withdrawal: monthlyWithdrawals,
        };
    });
  }, [isLoaded, allEntries, localDateRange]);

  const filteredEntries = useMemo(() => {
    if (!localDateRange?.from) return [];
    const from = startOfDay(localDateRange.from);
    const to = localDateRange.to ? endOfDay(localDateRange.to) : endOfDay(from);
    
    let ent = allEntries.filter(e => isValid(new Date(e.timestamp)) && new Date(e.timestamp) >= from && new Date(e.timestamp) <= to);
    
    if (searchTerm) {
      ent = ent.filter(e => 
        e.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
        e.partnerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.notes && e.notes.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    if (selectedType && selectedType !== 'all') {
      ent = ent.filter(e => e.type === selectedType);
    }
    
    return ent;
  }, [allEntries, searchTerm, localDateRange, selectedType]);

  const groupedEntries: GroupedEntries = useMemo(() => {
    if (!localDateRange?.from) return {};
    const from = startOfDay(localDateRange.from);
    
    let lastBal = allEntries
      .filter(e => isValid(new Date(e.timestamp)) && new Date(e.timestamp) < from)
      .reduce((b, i) => b + i.debit - i.credit, 0);
      
    const result: GroupedEntries = {};
    const dayKeys = [...new Set(filteredEntries.map(e => format(new Date(e.timestamp), 'yyyy-MM-dd')))].sort();
    
    for (const key of dayKeys) {
        const dayEnt = filteredEntries.filter(e => format(new Date(e.timestamp), 'yyyy-MM-dd') === key);
        const opening = lastBal;
        const debit = dayEnt.reduce((s, e) => s + e.debit, 0);
        const credit = dayEnt.reduce((s, e) => s + e.credit, 0);
        lastBal = opening + debit - credit;
        result[key] = { 
          entries: dayEnt, 
          openingBalance: opening, 
          closingBalance: lastBal, 
          totalDebit: debit, 
          totalCredit: credit 
        };
    }
    return result;
  }, [filteredEntries, allEntries, localDateRange]);

  const sortedDateKeys = useMemo(() => Object.keys(groupedEntries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()), [groupedEntries]);

  const handleDeleteEntry = () => {
    if (!entryToDelete) return;
    if (!isPinVerified() && deletePin !== '0200') {
      toast({ variant: 'destructive', title: 'Incorrect PIN' });
      return;
    }
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
            case 'mr': deleteMachineReading(id); break;
        }
        toast({ title: 'Deleted', description: 'Entry has been moved to recycle bin.' });
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete entry.' });
    }
    setEntryToDelete(null); 
    setDeletePin('');
  };

  const getEditLink = (e: LedgerEntry) => {
    const [prefix, id] = e.id.split(/-(.*)/s);
    switch(prefix) {
        case 'tx': return `/sales?edit=${id}`; 
        case 'pur': return `/purchases?edit=${id}`;
        case 'cp': return `/customer-payments?edit=${id}`; 
        case 'sp': return `/supplier-payments?edit=${id}`;
        case 'exp': return `/expenses?edit=${id}`; 
        case 'sr': return `/sale-returns?edit=${id}`;
        case 'oi': return `/other-incomes?edit=${id}`; 
        case 'inv': case 'wdr': return `/investments?edit=${id}`;
        case 'ca': return `/cash-advances?edit=${id}`; 
        case 'mr': return `/machines`;
        default: return '#';
    }
  };

  const getPrintLink = (e: LedgerEntry) => {
    const [prefix, id] = e.id.split(/-(.*)/s);
    let type = '';
    switch(prefix) {
        case 'tx': type = 'sale'; break;
        case 'pur': type = 'purchase'; break;
        case 'cp': type = 'customerpayment'; break;
        case 'sp': type = 'supplierpayment'; break;
        case 'exp': type = 'expense'; break;
        case 'sr': type = 'salereturn'; break;
        case 'oi': type = 'otherincome'; break;
        case 'inv': type = 'investment'; break;
        case 'wdr': type = 'withdrawal'; break;
        case 'ca': type = 'cashadvance'; break;
        case 'mr': type = 'meterreading'; break;
    }
    return type ? `/invoice/${type}/${id}` : null;
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
       <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="text-primary" /> General Journal
          </h1>
          <p className="text-muted-foreground">Comprehensive record of all business transactions for the selected period.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2">
           <div className="relative w-full md:w-48">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search journal..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8" />
           </div>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {TRANSACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <DateRangePicker date={localDateRange} onDateChange={setLocalDateRange} />
            <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4"/> Print Journal</Button>
        </div>
       </header>

       <Card className="print:hidden border-l-4 border-l-primary">
          <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="w-4 h-4 text-primary" /> Monthly Financial Pulse ({getYear(localDateRange?.from || new Date())})
              </CardTitle>
              <CardDescription className="text-xs">Visualizing revenue, purchases, spending, and capital flow across the current year.</CardDescription>
          </CardHeader>
          <CardContent className="pb-4 pt-0">
            <ChartContainer config={chartConfig} className="h-[180px] w-full">
                <BarChart data={monthlyChartData}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                        dataKey="month"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                        fontSize={10}
                    />
                    <YAxis 
                        tickLine={false}
                        axisLine={false}
                        fontSize={10}
                        tickFormatter={(value) => `${value / 1000}k`}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} className="text-[10px]" />
                    <Bar dataKey="sales" fill="var(--color-sales)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="purchases" fill="var(--color-purchases)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="investment" fill="var(--color-investment)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="withdrawal" fill="var(--color-withdrawal)" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ChartContainer>
          </CardContent>
       </Card>

      <Card className="border-none shadow-none bg-transparent">
        <CardHeader className="px-0">
          <CardTitle className="text-xl">Daily Transaction Audit</CardTitle>
          <CardDescription>Reviewing your daily journal entries in detail.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
            {sortedDateKeys.length > 0 ? (
                <Accordion 
                  key={sortedDateKeys.join(',')} 
                  type="multiple" 
                  className="w-full space-y-6" 
                  defaultValue={sortedDateKeys}
                >
                    {sortedDateKeys.map(key => {
                       const day = groupedEntries[key];
                       const dateObj = new Date(key);
                        return (
                        <AccordionItem value={key} key={key} className="border border-input rounded-xl overflow-hidden bg-background shadow-md">
                            <AccordionTrigger className="p-0 hover:no-underline hover:bg-muted/20 transition-all">
                                <div className="flex flex-col sm:flex-row justify-between w-full items-stretch sm:items-center">
                                    <div className="flex items-center gap-4 py-4 px-6 bg-primary text-primary-foreground min-w-[280px] shadow-[inset_-4px_0_10px_-2px_rgba(0,0,0,0.1)]">
                                        <div className="flex flex-col items-center justify-center bg-background text-primary rounded-lg p-2 min-w-[60px] shadow-sm">
                                            <span className="text-xs uppercase font-bold">{format(dateObj, 'MMM')}</span>
                                            <span className="text-xl font-black">{format(dateObj, 'dd')}</span>
                                        </div>
                                        <div className="text-left">
                                            <p className="font-black text-lg leading-tight">{format(dateObj, 'EEEE')}</p>
                                            <p className="text-xs text-primary-foreground/80 font-medium uppercase tracking-wider">{format(dateObj, 'MMMM yyyy')}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-1 flex-wrap gap-4 py-4 px-6 justify-end items-center bg-muted/20">
                                        <div className="flex flex-col items-end border-r border-muted-foreground/20 pr-4">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><TrendingUp className="w-3 h-3 text-green-600"/> Total Credit</span>
                                            <span className="text-lg font-black text-green-700 font-mono">PKR {day.totalCredit.toLocaleString()}</span>
                                        </div>
                                        <div className="flex flex-col items-end border-r border-muted-foreground/20 pr-4">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><TrendingDown className="w-3 h-3 text-destructive"/> Total Debit</span>
                                            <span className="text-lg font-black text-destructive font-mono">PKR {day.totalDebit.toLocaleString()}</span>
                                        </div>
                                        <div className="flex flex-col items-end pr-4">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><Wallet className="w-3 h-3 text-primary"/> Closing Balance</span>
                                            <span className={cn("text-lg font-black font-mono", day.closingBalance > 0 ? 'text-destructive' : 'text-green-800')}>
                                                PKR {day.closingBalance.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="p-0 border-t">
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-muted/80">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="w-12 text-center">#</TableHead>
                                                <TableHead className="w-24">Time</TableHead>
                                                <TableHead className="min-w-[150px]">Partner/Entity</TableHead>
                                                <TableHead className="min-w-[200px]">Particulars</TableHead>
                                                <TableHead>Remarks</TableHead>
                                                <TableHead className="text-center w-32">Entry Type</TableHead>
                                                <TableHead className="text-right w-32">Debit (PKR)</TableHead>
                                                <TableHead className="text-right w-32">Credit (PKR)</TableHead>
                                                <TableHead className="text-right w-32">Running Bal</TableHead>
                                                <TableHead className="text-center w-24 print:hidden">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {day.entries.slice().reverse().map((e, index) => {
                                              const color = e.type === 'credit_sale' ? '#3B82F6' : (colorSettings[e.type === 'cash_sale' ? 'Sale' : e.type] || '#6b7280');
                                              const transactionNo = day.entries.length - index;
                                              const printLink = getPrintLink(e);
                                              return (
                                                <TableRow key={e.id} className="hover:bg-muted/30 group">
                                                    <TableCell className="text-xs font-mono text-muted-foreground text-center">{transactionNo}</TableCell>
                                                    <TableCell className="whitespace-nowrap font-medium" style={{ color }}>
                                                      {format(new Date(e.timestamp), 'hh:mm a')}
                                                    </TableCell>
                                                    <TableCell className="font-bold text-foreground/90">{e.partnerName}</TableCell>
                                                    <TableCell className="text-sm">{e.description}</TableCell>
                                                    <TableCell className="text-xs italic text-muted-foreground max-w-[200px] truncate">
                                                      {e.notes || ''}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge 
                                                            variant="outline" 
                                                            className={cn(
                                                                "text-[10px] uppercase font-bold",
                                                                e.type === 'Meter Reading' && 'bg-blue-50 text-blue-700 border-blue-200',
                                                                e.type === 'cash_sale' && 'bg-green-50 text-green-700 border-green-200',
                                                                e.type === 'credit_sale' && 'bg-blue-50 text-blue-700 border-blue-200',
                                                                e.type === 'Expense' && 'bg-red-50 text-red-700 border-red-200',
                                                            )}
                                                        >
                                                            {e.type.replace('_', ' ')}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right text-destructive font-mono font-bold">
                                                      {e.debit > 0 ? e.debit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-right text-green-800 font-mono font-bold">
                                                      {e.credit > 0 ? e.credit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}
                                                    </TableCell>
                                                    <TableCell className={cn("text-right font-bold font-mono", e.balance > 0 ? 'text-destructive' : 'text-green-800')}>
                                                      {e.type === 'Meter Reading' ? '-' : e.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                    </TableCell>
                                                    <TableCell className="text-center print:hidden">
                                                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <Button asChild variant="ghost" size="icon" title="Edit" className="h-8 w-8 text-muted-foreground hover:text-primary">
                                                              <Link href={getEditLink(e)}>
                                                                <Pencil className="w-4 h-4" />
                                                              </Link>
                                                            </Button>
                                                            {printLink && (
                                                              <Button asChild variant="ghost" size="icon" title="Print Slip" className="h-8 w-8 text-primary/70 hover:text-primary">
                                                                <Link href={printLink}>
                                                                  <Printer className="w-4 h-4" />
                                                                </Link>
                                                              </Button>
                                                            )}
                                                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => setEntryToDelete(e)} title="Delete">
                                                              <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                              )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                        )
                    })}
                </Accordion>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground p-24 border-2 border-dashed rounded-3xl bg-background/50">
                <BookOpen className="w-20 h-20 opacity-10" />
                <div className="text-center">
                    <h3 className="text-xl font-bold">Journal is Empty</h3>
                    <p className="max-w-xs mx-auto">No transactions were found for the selected date range. Try adjusting your filters above.</p>
                </div>
                <Button variant="outline" onClick={() => setLocalDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) })}>
                    Show This Month
                </Button>
              </div>
            )}
        </CardContent>
      </Card>

      <AlertDialog open={!!entryToDelete} onOpenChange={(o) => { if (!o) { setEntryToDelete(null); setDeletePin(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="w-5 h-5"/> Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>You are about to delete the following record from the journal:</p>
              <div className="p-3 bg-muted rounded-lg font-medium border text-foreground">
                <p>{entryToDelete?.description}</p>
                <p className="text-xs text-muted-foreground mt-1">{entryToDelete?.partnerName} • {entryToDelete && format(new Date(entryToDelete.timestamp), 'PP pp')}</p>
              </div>
              <p className="text-xs font-semibold text-destructive uppercase tracking-tighter">This record will be moved to the recycle bin and can be restored later.</p>
              
              {!isPinVerified() && (
                <div className="mt-4 space-y-2">
                  <Label className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary"/> Security PIN Required:</Label>
                  <Input type="password" value={deletePin} onChange={(e) => setDeletePin(e.target.value)} placeholder="Enter 4-digit PIN" maxLength={4} className="text-center tracking-[1em] text-lg font-black" />
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setEntryToDelete(null); setDeletePin(''); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntry} className="bg-destructive hover:bg-destructive/90 font-bold">Delete Entry</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
