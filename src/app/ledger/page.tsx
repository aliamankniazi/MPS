

'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { format, isValid, startOfMonth, endOfMonth, isSameDay, startOfDay, endOfDay } from 'date-fns';
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
import type { Transaction, Product } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


type LedgerEntry = {
  id: string;
  timestamp: string;
  description: string;
  type: 'Sale' | 'Purchase' | 'Expense' | 'Purchase Return' | 'Sale Return' | 'Other Income' | 'Supplier Payment' | 'Investment' | 'Withdrawal' | 'Customer Payment' | 'Salary' | 'Cash Advance' | 'Stock Surplus' | 'Stock Shortage' | 'Daily Closing Stock' | 'Salary Expense';
  debit: number;
  credit: number;
  balance: number;
  original: any;
  isCreditSale?: boolean;
};

type GroupedEntries = {
  [key: string]: {
    entries: LedgerEntry[];
    openingBalance: number;
    closingBalance: number;
    totalDebit: number;
    totalCredit: number;
    dailySummary: {
        cashSale: number;
        recovery: number;
        otherIncome: number;
        stockSurplus: number;
        creditSale: number;
        cashAdvance: number;
        expenses: number;
        stockShortage: number;
        purchases: number;
        supplierPayment: number;
    }
  }
}

const TRANSACTION_TYPES = [
    'Sale', 'Purchase', 'Expense', 'Purchase Return', 'Sale Return', 'Other Income', 
    'Customer Payment', 'Supplier Payment', 'Cash Advance', 'Investment', 'Withdrawal', 'Salary', 'Salary Expense',
    'Stock Surplus', 'Stock Shortage', 'Daily Closing Stock'
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
    products,
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

  const allEntries = useMemo(() => {
    if (!isLoaded) return [];
    
    let combined: Omit<LedgerEntry, 'balance'>[] = [];

    transactions.forEach(tx => {
        if (!tx.timestamp || !isValid(new Date(tx.timestamp))) return;
        const customerName = tx.customerName || 'Walk-in Customer';
        let description = `Sale to ${customerName}`;
        if (tx.product && tx.product !== 'undefined') {
          description = `Sale: ${tx.product} to ${customerName}`;
        } else if(tx.fuelType && tx.volume) {
          description = `Sale: ${tx.volume.toFixed(2)}L ${tx.fuelType} to ${customerName}`;
        }
        
        const isCreditSale = tx.customerId && tx.customerId !== 'walkin' && tx.customerName !== 'Walk-in Customer';

        combined.push({
            id: `tx-${tx.id}`,
            timestamp: tx.timestamp,
            description,
            type: 'Sale',
            debit: isCreditSale ? tx.totalAmount : 0,
            credit: !isCreditSale ? tx.totalAmount : 0,
            original: tx,
            isCreditSale: isCreditSale,
        });
    });
    
    customerPayments.forEach(cp => {
        if (!cp.timestamp || !isValid(new Date(cp.timestamp))) return;
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
    
     cashAdvances.forEach(ca => {
        if (!ca.timestamp || !isValid(new Date(ca.timestamp))) return;
        combined.push({
          id: `ca-${ca.id}`,
          timestamp: ca.timestamp,
          description: ca.notes || `Cash Advance to ${ca.customerName}`,
          type: 'Cash Advance',
          debit: ca.amount,
          credit: 0,
          original: ca,
        })
    });

    purchases.forEach(p => {
        if (!p.timestamp || !isValid(new Date(p.timestamp))) return;
        combined.push({
            id: `pur-${p.id}`,
            timestamp: p.timestamp,
            description: `Purchase from ${p.supplier}: ${p.volume ? `${p.volume.toFixed(2)}L of ${p.fuelType}` : p.fuelType}`,
            type: 'Purchase',
            credit: 0, 
            debit: p.totalCost,
            original: p,
        })
    });
     supplierPayments.forEach(sp => {
        if (!sp.timestamp || !isValid(new Date(sp.timestamp))) return;
        combined.push({
            id: `sp-${sp.id}`,
            timestamp: sp.timestamp,
            description: `Payment to ${sp.supplierName}`,
            type: 'Supplier Payment',
            debit: sp.amount, 
            credit: 0, 
            original: sp,
        })
    });
    expenses.forEach(e => {
        if (!e.timestamp || !isValid(new Date(e.timestamp))) return;
        const isSalaryExpense = e.category === 'Salaries';
        const description = isSalaryExpense ? e.description.replace('Salary for ', '') : e.description;
        combined.push({
            id: `exp-${e.id}`,
            timestamp: e.timestamp,
            description: description,
            type: isSalaryExpense ? 'Salary Expense' : 'Expense',
            debit: e.amount,
            credit: 0,
            original: e,
        })
    });
    purchaseReturns.forEach(pr => {
        if (!pr.timestamp || !isValid(new Date(pr.timestamp))) return;
        combined.push({
            id: `pr-${pr.id}`,
            timestamp: pr.timestamp,
            description: `Return to ${pr.supplier}: ${pr.volume.toFixed(2)}L of ${pr.fuelType}`,
            type: 'Purchase Return',
            debit: pr.totalRefund,
            credit: 0,
            original: pr,
        })
    });
    saleReturns.forEach(sr => {
      if (!sr.timestamp || !isValid(new Date(sr.timestamp))) return;
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
    otherIncomes.forEach(oi => {
        if (!oi.timestamp || !isValid(new Date(oi.timestamp))) return;
        combined.push({
            id: `oi-${oi.id}`,
            timestamp: oi.timestamp,
            description: `Income: ${oi.description}`,
            type: 'Other Income',
            debit: 0,
            credit: oi.amount,
            original: oi,
        })
    });
    investments.forEach(inv => {
        if (!inv.timestamp || !isValid(new Date(inv.timestamp))) return;
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
        if (!adj.timestamp || !isValid(new Date(adj.timestamp))) return;
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
                .filter(p => p.fuelType === adj.fuelType && isValid(new Date(p.timestamp)) && new Date(p.timestamp) <= adjDate)
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
    const finalEntries = combined.map(entry => {
        runningBalance += entry.credit - entry.debit;
        return { ...entry, balance: runningBalance };
    });

    return finalEntries;

  }, [isLoaded, transactions, purchases, expenses, purchaseReturns, saleReturns, otherIncomes, customerPayments, supplierPayments, investments, cashAdvances, stockAdjustments, fuelPrices, products]);

  const productWiseSales = useMemo(() => {
    if (!isLoaded || !products) return [];

    const salesByProduct = transactions.reduce((acc, tx) => {
        const productName = tx.product || tx.fuelType;
        if (!productName) return acc;
        if (!acc[productName]) {
            const productInfo = products.find(p => p.name === productName);
            acc[productName] = {
                product: productName,
                unit: productInfo?.unit || 'Liters',
                totalSold: 0,
                totalRevenue: 0,
            };
        }
        acc[productName].totalSold += tx.volume || 0;
        acc[productName].totalRevenue += tx.totalAmount;
        return acc;
    }, {} as Record<string, { product: string; unit: string; totalSold: number; totalRevenue: number }>);

    return Object.values(salesByProduct);
  }, [isLoaded, transactions, products]);

  const profitSummary = useMemo(() => {
    if (!isLoaded) return null;
    const totalRevenue = transactions.reduce((sum, tx) => sum + tx.totalAmount, 0) + otherIncomes.reduce((sum, oi) => sum + oi.amount, 0);
    const totalCostOfGoods = purchases.reduce((sum, p) => sum + p.totalCost, 0);
    const grossProfit = totalRevenue - totalCostOfGoods;
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = grossProfit - totalExpenses;

    return { totalRevenue, totalCostOfGoods, grossProfit, totalExpenses, netProfit };
  }, [isLoaded, transactions, otherIncomes, purchases, expenses]);


  const groupedEntries = useMemo(() => {
    let filteredEntries = allEntries;

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

      const dayKey = format(date, 'yyyy-MM-dd');
      if (!acc[dayKey]) {
        const dayStart = startOfDay(date);
        const openingBalance = allEntries
          .filter(e => isValid(new Date(e.timestamp)) && new Date(e.timestamp) < dayStart)
          .reduce((bal, item) => bal + item.credit - item.debit, 0);

        acc[dayKey] = { 
          entries: [],
          openingBalance,
          closingBalance: 0,
          totalDebit: 0,
          totalCredit: 0,
          dailySummary: {
            cashSale: 0, recovery: 0, otherIncome: 0, stockSurplus: 0,
            creditSale: 0, cashAdvance: 0, expenses: 0, stockShortage: 0,
            purchases: 0, supplierPayment: 0,
          }
        };
      }
      
      acc[dayKey].entries.push(entry);
      acc[dayKey].totalDebit += entry.debit;
      acc[dayKey].totalCredit += entry.credit;
      
      // Daily Summary Calculation
      if(entry.type === 'Sale' && !entry.isCreditSale) acc[dayKey].dailySummary.cashSale += entry.credit;
      if(entry.type === 'Sale' && entry.isCreditSale) acc[dayKey].dailySummary.creditSale += entry.debit;
      if(entry.type === 'Customer Payment' || entry.type === 'Salary') acc[dayKey].dailySummary.recovery += entry.credit;
      if(entry.type === 'Other Income') acc[dayKey].dailySummary.otherIncome += entry.credit;
      if(entry.type === 'Stock Surplus') acc[dayKey].dailySummary.stockSurplus += entry.credit;
      if(entry.type === 'Cash Advance') acc[dayKey].dailySummary.cashAdvance += entry.debit;
      if(entry.type === 'Expense' || entry.type === 'Salary Expense') acc[dayKey].dailySummary.expenses += entry.debit;
      if(entry.type === 'Stock Shortage') acc[dayKey].dailySummary.stockShortage += entry.debit;
      if(entry.type === 'Purchase') acc[dayKey].dailySummary.purchases += entry.credit;
      if(entry.type === 'Supplier Payment') acc[dayKey].dailySummary.supplierPayment += entry.debit;


      return acc;

    }, {});

  }, [allEntries, searchTerm, selectedDate, selectedType]);
  
  const dayKeys = Object.keys(groupedEntries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  dayKeys.forEach(key => {
    let runningBalance = groupedEntries[key].openingBalance;
    groupedEntries[key].entries.forEach(entry => {
        runningBalance += entry.credit - entry.debit;
        entry.balance = runningBalance;
    });
    groupedEntries[key].closingBalance = runningBalance;
  });
  
  const handleDeleteEntry = () => {
    if (!entryToDelete) {
        return;
    }
    
    if (!entryToDelete.id || !entryToDelete.id.includes('-')) {
        toast({
            variant: 'destructive',
            title: 'Delete Failed',
            description: 'This is a calculated entry and cannot be deleted.',
        });
        setEntryToDelete(null);
        return;
    }
    
    const [typePrefix, id] = entryToDelete.id.split(/-(.*)/s);
    if (!id) {
        toast({
            variant: 'destructive',
            title: 'Delete Failed',
            description: 'This is a calculated entry and cannot be deleted.',
        });
        setEntryToDelete(null);
        return;
    }

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
  const currentDayKey = format(new Date(), 'yyyy-MM-dd');


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

        <div className="grid gap-6 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Package /> Product Wise Sale Summary</CardTitle>
                    <CardDescription>A summary of all product sales for all time.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead className="text-right">Total Sold</TableHead>
                                <TableHead className="text-right">Avg Price/Unit</TableHead>
                                <TableHead className="text-right">Total Revenue</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {productWiseSales.map(item => (
                                <TableRow key={item.product}>
                                    <TableCell>{item.product}</TableCell>
                                    <TableCell className="text-right">{item.totalSold.toFixed(2)} {item.unit}</TableCell>
                                    <TableCell className="text-right">{(item.totalSold > 0 ? item.totalRevenue / item.totalSold : 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-right">{item.totalRevenue.toFixed(2)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><DollarSign /> Profit Summary</CardTitle>
                    <CardDescription>A summary of overall profit for all time.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                   <div className="flex justify-between items-center">
                        <span className="text-muted-foreground flex items-center gap-2"><TrendingUp className="text-green-500" /> Total Revenue</span>
                        <span className="font-semibold">PKR {profitSummary?.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                   </div>
                   <div className="flex justify-between items-center">
                        <span className="text-muted-foreground flex items-center gap-2"><TrendingDown className="text-red-500" /> Cost of Goods</span>
                        <span className="font-semibold">PKR {profitSummary?.totalCostOfGoods.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                   </div>
                    <div className="flex justify-between items-center font-bold text-lg border-t pt-2">
                        <span>Gross Profit</span>
                        <span>PKR {profitSummary?.grossProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                   </div>
                   <div className="flex justify-between items-center">
                        <span className="text-muted-foreground flex items-center gap-2"><TrendingDown className="text-red-500" /> Total Expenses</span>
                        <span className="font-semibold">PKR {profitSummary?.totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                   </div>
                   <div className={`flex justify-between items-center font-bold text-xl border-t-2 pt-2 ${profitSummary && profitSummary.netProfit < 0 ? 'text-red-500' : 'text-green-600'}`}>
                        <span>Net Profit</span>
                        <span>PKR {profitSummary?.netProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                   </div>
                </CardContent>
            </Card>
        </div>

      <Card>
        <CardHeader>
            <CardTitle>Journal Entries</CardTitle>
            <CardDescription>{hasActiveFilters ? 'Showing filtered results.' : 'All transactions grouped by day.'}</CardDescription>
        </CardHeader>
        <CardContent>
            {dayKeys.length > 0 ? (
                <Accordion type="multiple" className="w-full space-y-4" defaultValue={[currentDayKey, ...dayKeys.filter(k => k !== currentDayKey)]}>
                    {dayKeys.map(dayKey => {
                       const dayData = groupedEntries[dayKey];
                       if (dayData.entries.length === 0 && !hasActiveFilters) return null;
                       

                        return (
                        <AccordionItem value={dayKey} key={dayKey} className="border-b-0">
                            <Card>
                                <AccordionTrigger className="hover:no-underline p-4 text-lg">
                                    <div className="flex justify-between w-full pr-4">
                                        <span className="font-semibold">{format(new Date(dayKey), 'EEEE, dd MMMM yyyy')}</span>
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
                                          <TableRow className="bg-muted hover:bg-muted">
                                            <TableCell colSpan={7} className="text-center font-semibold text-foreground py-2">
                                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-6 gap-y-1 text-xs text-right">
                                                    <div className="flex flex-col border-r pr-4">
                                                        <div className="flex justify-between gap-2"><span className="text-muted-foreground">Opening Balance:</span> <span className="font-mono">{dayData.openingBalance.toLocaleString(undefined, {minimumFractionDigits:0})}</span></div>
                                                    </div>
                                                    <div className="flex flex-col border-r pr-4">
                                                        <div className="flex justify-between gap-2"><span className="text-muted-foreground text-xs">Total Debits:</span> <span className="font-mono text-destructive">{dayData.totalDebit.toLocaleString(undefined, {minimumFractionDigits:0})}</span></div>
                                                    </div>
                                                    <div className="flex flex-col border-r pr-4">
                                                        <div className="flex justify-between gap-2"><span className="text-muted-foreground text-xs">Total Credits:</span> <span className="font-mono text-green-600">{dayData.totalCredit.toLocaleString(undefined, {minimumFractionDigits:0})}</span></div>
                                                    </div>
                                                    <div className="flex flex-col col-span-2">
                                                         <div className="flex justify-between gap-2"><span className="text-muted-foreground">Closing Balance:</span> <span className="font-mono">{dayData.closingBalance.toLocaleString(undefined, {minimumFractionDigits:0})}</span></div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                          </TableRow>
                                            {dayData.entries.slice().reverse().map((entry, index) => {
                                                const date = new Date(entry.timestamp);
                                                
                                                const isCashSale = entry.type === 'Sale' && !entry.isCreditSale;
                                                const isCreditSale = entry.type === 'Sale' && !!entry.isCreditSale;
                                                const isSalary = entry.type === 'Salary' || entry.type === 'Salary Expense';
                                                const isExpense = entry.type === 'Expense' || entry.type === 'Salary Expense';
                                                const isPurchase = entry.type === 'Purchase';

                                                return (
                                                    <TableRow key={entry.id}>
                                                        <TableCell className={cn(
                                                            "font-medium",
                                                            isCreditSale && 'text-blue-600',
                                                            isCashSale && 'text-green-600',
                                                            isExpense && 'text-destructive',
                                                            isSalary && 'text-pink-600',
                                                            isPurchase && 'text-green-600',
                                                            entry.type === 'Customer Payment' && 'text-teal-600'
                                                        )}>
                                                            {isValid(date) ? format(date, 'dd/MM/yy hh:mm a') : 'Invalid Date'}
                                                        </TableCell>
                                                        <TableCell className={cn(
                                                            "font-medium",
                                                            isCreditSale && 'text-blue-600',
                                                            isCashSale && 'text-green-600',
                                                            isSalary && 'text-pink-600',
                                                            isExpense && 'text-destructive',
                                                            isPurchase && 'text-green-600',
                                                            entry.type === 'Customer Payment' && 'text-teal-600'
                                                        )}>{entry.description}</TableCell>
                                                        <TableCell>
                                                          <Badge 
                                                            variant={entry.debit > 0 ? 'destructive' : 'outline'}
                                                            className={cn('text-xs', 
                                                                (entry.type === 'Sale' && !entry.isCreditSale) && 'bg-green-100 text-green-800 border-green-200',
                                                                (entry.type === 'Sale' && entry.isCreditSale) && 'bg-blue-100 text-blue-800 border-blue-200',
                                                                (entry.type === 'Customer Payment') && 'bg-teal-100 text-teal-800 border-teal-200 dark:text-teal-300 dark:bg-teal-900/50 dark:border-teal-700',
                                                                entry.type === 'Supplier Payment' && 'bg-pink-100 text-pink-800 border-pink-200',
                                                                entry.type === 'Salary' && 'bg-pink-100 text-pink-800 border-pink-200',
                                                                entry.type === 'Salary Expense' && 'bg-pink-100 text-pink-800 border-pink-200',
                                                                entry.type === 'Purchase' && 'bg-green-100 text-green-800 border-green-200',
                                                                entry.type === 'Purchase Return' && 'bg-orange-100 text-orange-800 border-orange-200',
                                                                entry.type === 'Sale Return' && 'bg-yellow-100 text-yellow-800 border-yellow-200',
                                                                entry.type === 'Investment' && 'bg-indigo-100 text-indigo-800 border-indigo-200',
                                                                entry.type === 'Withdrawal' && 'bg-purple-100 text-purple-800 border-purple-200',
                                                                (entry.type === 'Other Income' || entry.type === 'Stock Surplus') && 'bg-green-100 text-green-800 border-green-200',
                                                                (entry.type === 'Cash Advance' || entry.type === 'Expense' || entry.type === 'Stock Shortage') && 'bg-red-100 text-red-800 border-red-200',
                                                          )}
                                                          >
                                                            {entry.type === 'Customer Payment' ? 'Amount' : entry.type}
                                                          </Badge>
                                                        </TableCell>
                                                        <TableCell className={cn("text-right font-mono text-destructive")}>
                                                            {entry.debit > 0 ? entry.debit.toFixed(2) : '-'}
                                                        </TableCell>
                                                        <TableCell className={cn("text-right font-mono text-green-600")}>
                                                            {entry.credit > 0 ? entry.credit.toFixed(2) : '-'}
                                                        </TableCell>
                                                        <TableCell className={cn("font-semibold font-mono text-right", entry.balance >= 0 ? 'text-primary' : 'text-destructive')}>
                                                            {entry.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Button 
                                                              variant="ghost" 
                                                              size="icon" 
                                                              className="text-destructive hover:text-destructive" 
                                                              onClick={() => setEntryToDelete(entry)}
                                                              disabled={!entry.id.includes('-')}
                                                            >
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
                                                <TableCell colSpan={2} className={cn("text-right font-mono", dayData.closingBalance >= 0 ? 'text-primary' : 'text-destructive')}>
                                                    {dayData.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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



    

    




    






    


    

    

    

    




