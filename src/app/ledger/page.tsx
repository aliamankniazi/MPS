

'use client';

import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { format, isValid, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { BookOpen, DollarSign, Trash2, AlertTriangle, TrendingUp, TrendingDown, LayoutDashboard, Printer, Download, Package, BarChart2, Calendar as CalendarIcon, X } from 'lucide-react';
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
import Link from 'next/link';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { Transaction } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


type LedgerEntry = {
  id: string;
  timestamp: string;
  description: string;
  type: 'Sale' | 'Purchase' | 'Expense' | 'Purchase Return' | 'Sale Return' | 'Other Income' | 'Supplier Payment' | 'Investment' | 'Withdrawal' | 'Customer Payment' | 'Salary' | 'Cash Advance' | 'Stock Surplus' | 'Stock Shortage';
  debit: number;
  credit: number;
  balance: number;
  original: any;
};

type GroupedEntries = {
  [monthKey: string]: {
    entries: LedgerEntry[];
    openingBalance: number;
    closingBalance: number;
    totalDebit: number;
    totalCredit: number;
    totalSales: number;
    totalCashSales: number;
    totalCreditSales: number;
    totalSaleReturns: number;
    totalPurchases: number;
    totalPurchaseReturns: number;
    totalRecovery: number;
    totalCashAdvance: number;
    totalSupplierPayment: number;
    totalExpenses: number;
    totalOtherIncomes: number;
    totalInvestments: number;
    totalWithdrawals: number;
    totalStockSurplus: number;
    totalStockShortage: number;
  }
}

const TRANSACTION_TYPES = [
    'Sale', 'Purchase', 'Expense', 'Purchase Return', 'Sale Return', 'Other Income', 
    'Customer Payment', 'Supplier Payment', 'Cash Advance', 'Investment', 'Withdrawal', 'Salary',
    'Stock Surplus', 'Stock Shortage'
];


export default function LedgerPage() {
  const { 
    transactions, 
    purchases, 
    expenses, 
    purchaseReturns,
    saleReturns,
    otherIncomes, 
    supplierPayments, 
    investments, 
    customerPayments,
    cashAdvances,
    stockAdjustments,
    fuelPrices,
    isLoaded,
    deleteTransaction,
    deletePurchase,
    deleteExpense,
    deletePurchaseReturn,
    deleteSaleReturn,
    deleteOtherIncome,
    deleteSupplierPayment,
    deleteInvestment,
    deleteCustomerPayment,
    deleteCashAdvance,
  } = useDatabase();
  
  const [entryToDelete, setEntryToDelete] = useState<LedgerEntry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedType, setSelectedType] = useState<string>('');
  const { toast } = useToast();

  const groupedEntries = useMemo(() => {
    if (!isLoaded) return {};

    let combined: Omit<LedgerEntry, 'balance'>[] = [];

    transactions.forEach(tx => {
      const isCreditSale = tx.paymentMethod === 'Credit' || (tx.customerId && tx.customerName !== 'Walk-in Customer' && !tx.paymentMethod);
      combined.push({
        id: `tx-${tx.id}`,
        timestamp: tx.timestamp,
        description: `Sale: ${tx.product || tx.fuelType} to ${tx.customerName || 'Walk-in'}`,
        type: 'Sale',
        debit: tx.totalAmount, 
        credit: isCreditSale ? 0 : tx.totalAmount,
        original: tx,
      })
    });
    customerPayments.forEach(cp => {
        const isSalary = cp.paymentMethod === 'Salary';
        combined.push({
          id: `cp-${cp.id}`,
          timestamp: cp.timestamp,
          description: cp.notes || `Payment from ${cp.customerName}`,
          type: isSalary ? 'Salary' : 'Customer Payment',
          debit: 0,
          credit: cp.amount,
          original: cp,
        })
    });
     cashAdvances.forEach(ca => combined.push({
      id: `ca-${ca.id}`,
      timestamp: ca.timestamp,
      description: ca.notes || `Cash Advance to ${ca.customerName}`,
      type: 'Cash Advance',
      debit: ca.amount,
      credit: 0,
      original: ca,
    }));
    purchases.forEach(p => combined.push({
      id: `pur-${p.id}`,
      timestamp: p.timestamp,
      description: `Purchase from ${p.supplier}: ${p.volume ? `${p.volume.toFixed(2)}L of ${p.fuelType}` : p.fuelType}`,
      type: 'Purchase',
      debit: p.totalCost,
      credit: 0,
      original: p,
    }));
     supplierPayments.forEach(sp => combined.push({
      id: `sp-${sp.id}`,
      timestamp: sp.timestamp,
      description: `Payment to ${sp.supplierName}`,
      type: 'Supplier Payment',
      debit: 0,
      credit: sp.amount,
      original: sp,
    }));
    expenses.forEach(e => combined.push({
        id: `exp-${e.id}`,
        timestamp: e.timestamp,
        description: `Expense: ${e.description}`,
        type: 'Expense',
        debit: e.amount,
        credit: 0,
        original: e,
    }));
    purchaseReturns.forEach(pr => combined.push({
        id: `pr-${pr.id}`,
        timestamp: pr.timestamp,
        description: `Return to ${pr.supplier}: ${pr.volume.toFixed(2)}L of ${pr.fuelType}`,
        type: 'Purchase Return',
        debit: 0,
        credit: pr.totalRefund,
        original: pr,
    }));
    saleReturns.forEach(sr => {
      combined.push({
        id: `sr-${sr.id}`,
        timestamp: sr.timestamp,
        description: `Return from ${sr.customerName}: ${sr.volume.toFixed(2)}L of ${sr.fuelType}`,
        type: 'Sale Return',
        debit: sr.totalRefund,
        credit: 0,
        original: sr,
      });
    });
    otherIncomes.forEach(oi => combined.push({
        id: `oi-${oi.id}`,
        timestamp: oi.timestamp,
        description: `Income: ${oi.description}`,
        type: 'Other Income',
        debit: 0,
        credit: oi.amount,
        original: oi,
    }));
    investments.forEach(inv => {
        if (inv.type === 'Investment') {
            combined.push({
                id: `inv-${inv.id}`,
                timestamp: inv.timestamp,
                description: `Investment from ${inv.partnerName}`,
                type: 'Investment',
                debit: 0,
                credit: inv.amount,
                original: inv,
            });
        } else {
            combined.push({
                id: `wdr-${inv.id}`,
                timestamp: inv.timestamp,
                description: `Withdrawal by ${inv.partnerName}`,
                type: 'Withdrawal',
                debit: inv.amount,
                credit: 0,
                original: inv,
            });
        }
    });

    stockAdjustments.forEach(adj => {
        const adjDate = new Date(adj.timestamp);
        if (adj.adjustment > 0) { // Surplus
            const salePrice = fuelPrices[adj.fuelType] || 0;
            combined.push({
                id: `adj-${adj.id}`,
                timestamp: adj.timestamp,
                description: `Stock Surplus: ${adj.adjustment.toFixed(2)}L of ${adj.fuelType}`,
                type: 'Stock Surplus',
                debit: 0,
                credit: adj.adjustment * salePrice,
                original: adj,
            });
        } else { // Shortage
            const lastPurchase = purchases
                .filter(p => p.fuelType === adj.fuelType && new Date(p.timestamp) <= adjDate)
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
            const purchasePrice = lastPurchase ? lastPurchase.totalCost / lastPurchase.volume : 0;
            combined.push({
                id: `adj-${adj.id}`,
                timestamp: adj.timestamp,
                description: `Stock Shortage: ${Math.abs(adj.adjustment).toFixed(2)}L of ${adj.fuelType}`,
                type: 'Stock Shortage',
                debit: Math.abs(adj.adjustment) * purchasePrice,
                credit: 0,
                original: adj,
            });
        }
    });
    
    combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let runningBalance = 0;
    const allEntriesWithBalance = combined.map(entry => {
        let balanceChange = entry.credit - entry.debit;
        if(entry.type === 'Sale'){
            balanceChange = (entry.original as Transaction).paymentMethod !== 'Credit' ? 0 : -entry.debit;
        }
        runningBalance += balanceChange;
        return { ...entry, balance: runningBalance };
    });

    let filteredEntries = allEntriesWithBalance;

    if (searchTerm) {
        filteredEntries = filteredEntries.filter(e => e.description.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    if (selectedType && selectedType !== 'all') {
        filteredEntries = filteredEntries.filter(e => e.type === selectedType);
    }
    if (selectedDate) {
        filteredEntries = filteredEntries.filter(e => isValid(new Date(e.timestamp)) && isSameDay(new Date(e.timestamp), selectedDate));
    }


    return filteredEntries.reduce((acc: GroupedEntries, entry: LedgerEntry) => {
      const date = new Date(entry.timestamp);
      if (!isValid(date)) return acc;

      const monthKey = format(date, 'MMMM yyyy');
      if (!acc[monthKey]) {
        const monthStart = startOfMonth(date);
        const openingBalance = allEntriesWithBalance
          .filter(e => isValid(new Date(e.timestamp)) && new Date(e.timestamp) < monthStart)
          .reduce((bal, item) => {
            let change = item.credit - item.debit;
            if(item.type === 'Sale'){
                change = (item.original as Transaction).paymentMethod !== 'Credit' ? 0 : -item.debit;
            }
            return bal + change;
          }, 0);

        acc[monthKey] = { 
          entries: [],
          openingBalance,
          closingBalance: 0,
          totalDebit: 0,
          totalCredit: 0,
          totalSales: 0,
          totalCashSales: 0,
          totalCreditSales: 0,
          totalSaleReturns: 0,
          totalPurchases: 0,
          totalPurchaseReturns: 0,
          totalRecovery: 0,
          totalCashAdvance: 0,
          totalSupplierPayment: 0,
          totalExpenses: 0,
          totalOtherIncomes: 0,
          totalInvestments: 0,
          totalWithdrawals: 0,
          totalStockSurplus: 0,
          totalStockShortage: 0,
        };
      }
      
      acc[monthKey].entries.push(entry);
      return acc;

    }, {});

  }, [isLoaded, transactions, purchases, expenses, purchaseReturns, saleReturns, otherIncomes, customerPayments, supplierPayments, investments, cashAdvances, stockAdjustments, fuelPrices, searchTerm, selectedDate, selectedType]);
  
  const monthKeys = Object.keys(groupedEntries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  monthKeys.forEach(key => {
    let runningBalance = groupedEntries[key].openingBalance;
    groupedEntries[key].entries.forEach(entry => {
      let balanceChange = entry.credit - entry.debit;
        if(entry.type === 'Sale'){
            balanceChange = (entry.original as Transaction).paymentMethod !== 'Credit' ? 0 : -entry.debit;
        }
      runningBalance += balanceChange;
      entry.balance = runningBalance;
    });
    const monthData = groupedEntries[key];
    monthData.closingBalance = runningBalance;
    monthData.totalDebit = monthData.entries.reduce((sum, e) => sum + e.debit, 0);
    monthData.totalCredit = monthData.entries.reduce((sum, e) => sum + e.credit, 0);
    
    monthData.totalSales = monthData.entries
        .filter(e => e.type === 'Sale')
        .reduce((sum, e) => sum + (e.original as Transaction).totalAmount, 0);

    monthData.totalCashSales = monthData.entries
        .filter(e => e.type === 'Sale' && e.credit > 0)
        .reduce((sum, e) => sum + e.credit, 0);

    monthData.totalCreditSales = monthData.entries
        .filter(e => e.type === 'Sale' && (e.original as Transaction).paymentMethod === 'Credit')
        .reduce((sum, e) => sum + e.debit, 0);

    monthData.totalSaleReturns = monthData.entries.filter(e => e.type === 'Sale Return').reduce((sum, e) => sum + e.debit, 0);
    
    monthData.totalPurchases = monthData.entries.filter(e => e.type === 'Purchase').reduce((sum, e) => sum + e.debit, 0);
    monthData.totalPurchaseReturns = monthData.entries.filter(e => e.type === 'Purchase Return').reduce((sum, e) => sum + e.credit, 0);

    monthData.totalRecovery = monthData.entries.filter(e => e.type === 'Customer Payment' || e.type === 'Salary').reduce((sum, e) => sum + e.credit, 0);
    monthData.totalOtherIncomes = monthData.entries.filter(e => e.type === 'Other Income').reduce((sum, e) => sum + e.credit, 0);
    monthData.totalInvestments = monthData.entries.filter(e => e.type === 'Investment').reduce((sum, e) => sum + e.credit, 0);

    monthData.totalCashAdvance = monthData.entries.filter(e => e.type === 'Cash Advance').reduce((sum, e) => sum + e.debit, 0);
    monthData.totalSupplierPayment = monthData.entries.filter(e => e.type === 'Supplier Payment').reduce((sum, e) => sum + e.debit, 0);
    monthData.totalExpenses = monthData.entries.filter(e => e.type === 'Expense').reduce((sum, e) => sum + e.debit, 0);
    monthData.totalWithdrawals = monthData.entries.filter(e => e.type === 'Withdrawal').reduce((sum, e) => sum + e.debit, 0);

    monthData.totalStockSurplus = monthData.entries.filter(e => e.type === 'Stock Surplus').reduce((sum, e) => sum + e.credit, 0);
    monthData.totalStockShortage = monthData.entries.filter(e => e.type === 'Stock Shortage').reduce((sum, e) => sum + e.debit, 0);
  });
  
  const handleDeleteEntry = () => {
    if (!entryToDelete) return;
    
    const [typePrefix, id] = entryToDelete.id.split(/-(.*)/s);

    try {
        switch(typePrefix) {
            case 'tx': deleteTransaction(id); break;
            case 'pur': deletePurchase(id); break;
            case 'cp': deleteCustomerPayment(id); break;
            case 'sp': deleteSupplierPayment(id); break;
            case 'exp': deleteExpense(id); break;
            case 'pr': deletePurchaseReturn(id); break;
            case 'sr': deleteSaleReturn(id); break;
            case 'oi': deleteOtherIncome(id); break;
            case 'inv': deleteInvestment(id); break;
            case 'wdr': deleteInvestment(id); break;
            case 'ca': deleteCashAdvance(id); break;
            default:
                throw new Error('Could not delete entry of unknown type.');
        }

        toast({
            title: 'Entry Deleted',
            description: `The ${entryToDelete.type} entry has been successfully deleted.`,
        });
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Error Deleting',
            description: error.message || 'An unexpected error occurred.',
        });
    } finally {
        setEntryToDelete(null);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedDate(undefined);
    setSelectedType('');
  }

  const hasActiveFilters = searchTerm || selectedDate || selectedType;
  const currentMonthKey = format(new Date(), 'MMMM yyyy');


  return (
    <>
    <div className="p-4 md:p-8 space-y-6">
       <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><BookOpen /> General Journal</h1>
          <p className="text-muted-foreground">A chronological record of all financial transactions.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2">
           <Input 
            placeholder="Search descriptions..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="w-full md:w-48"
          />
           <Popover>
            <PopoverTrigger asChild>
                <Button
                variant={"outline"}
                className={cn("w-full justify-start text-left font-normal md:w-48", !selectedDate && "text-muted-foreground")}
                >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, "PPP") : <span>Filter by date</span>}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus /></PopoverContent>
           </Popover>
            <Select value={selectedType} onValueChange={(value) => setSelectedType(value === 'all' ? '' : value)}>
                <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {TRANSACTION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
            </Select>

           {hasActiveFilters && <Button variant="ghost" onClick={clearFilters}><X className="mr-2 h-4 w-4"/>Clear</Button>}
        </div>
       </header>

      <Card>
        <CardHeader>
            <CardTitle>Journal Entries</CardTitle>
            <CardDescription>{hasActiveFilters ? 'Showing filtered results.' : 'All transactions grouped by month.'}</CardDescription>
        </CardHeader>
        <CardContent>
            {monthKeys.length > 0 ? (
                <Accordion type="multiple" className="w-full space-y-4" defaultValue={[currentMonthKey, ...monthKeys.filter(k => k !== currentMonthKey)]}>
                    {monthKeys.map(monthKey => {
                       const monthData = groupedEntries[monthKey];
                       if (monthData.entries.length === 0) return null;
                        const totalInflows = monthData.totalCashSales + monthData.totalRecovery + monthData.totalOtherIncomes + monthData.totalInvestments + monthData.totalPurchaseReturns + monthData.totalStockSurplus;
                        const totalOutflows = monthData.totalCreditSales + monthData.totalCashAdvance + monthData.totalExpenses + monthData.totalSaleReturns + monthData.totalWithdrawals + monthData.totalStockShortage;
                        const totalSupplierActivity = monthData.totalPurchases - monthData.totalSupplierPayment;
                        return (
                        <AccordionItem value={monthKey} key={monthKey} className="border-b-0">
                            <Card>
                                <AccordionTrigger className="hover:no-underline p-4 text-lg">
                                    <div className="flex justify-between w-full pr-4 items-center">
                                        <span className="font-semibold">{monthKey}</span>
                                        <div className="hidden md:grid grid-cols-1 lg:grid-cols-3 gap-x-6 gap-y-1 text-sm text-right">
                                            <div className="flex justify-end items-center gap-x-4">
                                                <div className="flex flex-col"><span className="text-muted-foreground text-xs">Cash Sale</span> <span className="font-mono text-green-600">PKR {monthData.totalCashSales.toLocaleString(undefined, {minimumFractionDigits: 0})}</span></div>
                                                <div className="flex flex-col"><span className="text-muted-foreground text-xs">Recovery</span> <span className="font-mono text-green-600">PKR {monthData.totalRecovery.toLocaleString(undefined, {minimumFractionDigits: 0})}</span></div>
                                                <div className="flex flex-col"><span className="text-muted-foreground text-xs">Surplus Stock</span> <span className="font-mono text-green-600">PKR {monthData.totalStockSurplus.toLocaleString(undefined, {minimumFractionDigits: 0})}</span></div>
                                                <div className="flex flex-col"><span className="text-muted-foreground text-xs font-bold">= Total</span> <span className="font-mono text-green-600 font-bold">PKR {(monthData.totalCashSales + monthData.totalRecovery + monthData.totalStockSurplus).toLocaleString(undefined, {minimumFractionDigits: 0})}</span></div>
                                            </div>
                                            <div className="flex justify-end items-center gap-x-4">
                                                <div className="flex flex-col"><span className="text-muted-foreground text-xs">Credit Sale</span> <span className="font-mono text-blue-600">PKR {monthData.totalCreditSales.toLocaleString(undefined, {minimumFractionDigits: 0})}</span></div>
                                                <div className="flex flex-col"><span className="text-muted-foreground text-xs">Cash Advance</span> <span className="font-mono text-destructive">PKR {monthData.totalCashAdvance.toLocaleString(undefined, {minimumFractionDigits: 0})}</span></div>
                                                <div className="flex flex-col"><span className="text-muted-foreground text-xs">Expenses</span> <span className="font-mono text-destructive">PKR {monthData.totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 0})}</span></div>
                                                <div className="flex flex-col"><span className="text-muted-foreground text-xs">Short Stock</span> <span className="font-mono text-destructive">PKR {monthData.totalStockShortage.toLocaleString(undefined, {minimumFractionDigits: 0})}</span></div>
                                                <div className="flex flex-col"><span className="text-muted-foreground text-xs font-bold">= Total</span> <span className="font-mono text-destructive font-bold">PKR {(monthData.totalCreditSales + monthData.totalCashAdvance + monthData.totalExpenses + monthData.totalStockShortage).toLocaleString(undefined, {minimumFractionDigits: 0})}</span></div>
                                            </div>
                                            <div className="flex justify-end items-center gap-x-4">
                                                <div className="flex flex-col"><span className="text-muted-foreground text-xs">Purchases</span> <span className="font-mono text-destructive">PKR {monthData.totalPurchases.toLocaleString(undefined, {minimumFractionDigits: 0})}</span></div>
                                                <div className="flex flex-col"><span className="text-muted-foreground text-xs">Supplier Payment</span> <span className="font-mono text-green-600">PKR {monthData.totalSupplierPayment.toLocaleString(undefined, {minimumFractionDigits: 0})}</span></div>
                                                <div className="flex flex-col"><span className="text-muted-foreground text-xs font-bold">= Total</span> <span className="font-mono text-destructive font-bold">PKR {(monthData.totalPurchases - monthData.totalSupplierPayment).toLocaleString(undefined, {minimumFractionDigits: 0})}</span></div>
                                            </div>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-2 pb-2">
                                     <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Date & Time</TableHead>
                                                <TableHead>Particulars</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead className="text-right">Debit</TableHead>
                                                <TableHead className="text-right">Credit</TableHead>
                                                <TableHead className="text-right">Balance</TableHead>
                                                <TableHead className="text-center">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                                                <TableCell colSpan={5} className="font-bold">Opening Balance</TableCell>
                                                <TableCell className={cn("text-right font-semibold font-mono", monthData.openingBalance >= 0 ? 'text-primary' : 'text-destructive')}>
                                                {monthData.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell />
                                            </TableRow>
                                            {monthData.entries.slice().reverse().map(entry => {
                                                const date = new Date(entry.timestamp);
                                                const isCreditEntry = entry.credit > 0;
                                                return (
                                                <TableRow key={entry.id}>
                                                    <TableCell>{isValid(date) ? format(date, 'dd/MM/yy hh:mm a') : 'Invalid Date'}</TableCell>
                                                    <TableCell>{entry.description}</TableCell>
                                                    <TableCell>
                                                         <Badge 
                                                            variant={isCreditEntry ? 'outline' : 'destructive'}
                                                            className={cn('text-xs', isCreditEntry && 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700')}
                                                            >{entry.type}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                         <span className={cn("font-mono", entry.type === 'Sale' && entry.debit > 0 ? 'text-blue-600' : 'text-destructive')}>{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span className="font-mono text-green-600">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</span>
                                                    </TableCell>
                                                    <TableCell className={cn("font-semibold font-mono text-right", entry.balance >= 0 ? 'text-primary' : 'text-destructive')}>
                                                        {entry.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                         <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setEntryToDelete(entry)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                        <TableFooter>
                                            <TableRow className="bg-muted/50 font-bold text-base">
                                                <TableCell colSpan={5} className="text-right">Closing Balance</TableCell>
                                                <TableCell colSpan={2} className={cn("text-right font-mono", monthData.closingBalance >= 0 ? 'text-primary' : 'text-destructive')}>
                                                    {monthData.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </TableCell>
                                            </TableRow>
                                        </TableFooter>
                                     </Table>
                                </AccordionContent>
                            </Card>
                        </AccordionItem>
                        )
                    })}
                </Accordion>
            ) : <p className="text-center p-8 text-muted-foreground">{hasActiveFilters ? 'No transactions match your filters.' : 'No transactions found.'}</p>}
        </CardContent>
      </Card>
    </div>
    
    <AlertDialog open={!!entryToDelete} onOpenChange={(isOpen) => !isOpen && setEntryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the entry for: <br />
              <strong className="font-medium text-foreground">{entryToDelete?.description}</strong>
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







    

    




    

    




