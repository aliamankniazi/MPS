

'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
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
import type { Transaction, Product, Purchase, DateRange } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';


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
    colorSettings,
    isLoaded,
    dateRange,
    setDateRange,
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
  const [selectedType, setSelectedType] = useState<string>('');
  const [showJournal, setShowJournal] = useState(true);
  const { toast } = useToast();

  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [showDeleteSelectedDialog, setShowDeleteSelectedDialog] = useState(false);

  const allEntries = useMemo(() => {
    if (!isLoaded) return [];
    
    let combined: Omit<LedgerEntry, 'balance'>[] = [];

    const sortedPurchases = [...purchases].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    transactions.forEach(tx => {
        if (!tx.timestamp || !isValid(new Date(tx.timestamp))) return;
        const customerName = tx.customerName || 'Walk-in Customer';
        let description = `Sale: ${tx.volume ? `${tx.volume.toFixed(2)}L of ${tx.fuelType}`: tx.product} to ${customerName}`;
        if (tx.notes) {
          description += ` (${tx.notes})`;
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
        // For general journal, salary is a debit (expense), other payments are credit (cash in)
        combined.push({
          id: `cp-${cp.id}`,
          timestamp: cp.timestamp,
          description: cp.notes || (isSalary ? `Salary to ${cp.customerName}` : `Payment from ${cp.customerName}`),
          type: isSalary ? 'Salary' : 'Customer Payment',
          debit: isSalary ? cp.amount : 0,
          credit: isSalary ? 0 : cp.amount,
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
            credit: p.totalCost,
            debit: 0,
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
        if (isSalaryExpense) return; // Exclude salary expenses as they are handled by CustomerPayment 'Salary' type

        const description = e.description;
        combined.push({
            id: `exp-${e.id}`,
            timestamp: e.timestamp,
            description: description,
            type: 'Expense',
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
            debit: 0,
            credit: pr.totalRefund,
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
        if (adj.adjustment > 0) { // Surplus
            combined.push({
                id: `adj-${adj.id}`,
                timestamp: adj.timestamp,
                description: `Stock Surplus: ${adj.adjustment.toFixed(2)}L of ${adj.fuelType}`,
                type: 'Stock Surplus',
                debit: 0,
                credit: adj.value,
                original: adj,
            });
        } else { // Shortage
            combined.push({
                id: `adj-${adj.id}`,
                timestamp: adj.timestamp,
                description: `Stock Shortage: ${Math.abs(adj.adjustment).toFixed(2)}L of ${adj.fuelType}`,
                type: 'Stock Shortage',
                debit: adj.value,
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


  const filteredEntries = useMemo(() => {
    let entries = allEntries;

    if (searchTerm) {
        entries = entries.filter(e => e.description.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    if (selectedType && selectedType !== 'all') {
        entries = entries.filter(e => e.type === selectedType);
    }
    if (dateRange?.from) {
      const rangeStart = startOfDay(dateRange.from);
      const rangeEnd = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
      entries = entries.filter(e => {
        const entryDate = new Date(e.timestamp);
        return isValid(entryDate) && entryDate >= rangeStart && entryDate <= rangeEnd;
      });
    }
    return entries;
  }, [allEntries, searchTerm, dateRange, selectedType]);

  const groupedEntries = useMemo(() => {
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

  }, [filteredEntries, allEntries]);
  
  const dayKeys = Object.keys(groupedEntries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  dayKeys.forEach(key => {
    let runningBalance = groupedEntries[key].openingBalance;
    groupedEntries[key].entries.forEach(entry => {
        runningBalance += entry.credit - entry.debit;
        entry.balance = runningBalance;
    });
    groupedEntries[key].closingBalance = runningBalance;
  });

  const handleSelectEntry = useCallback((entryId: string, isSelected: boolean) => {
    setSelectedEntries(prev => {
        if (isSelected) {
            return [...prev, entryId];
        } else {
            return prev.filter(id => id !== entryId);
        }
    });
  }, []);

  const handleSelectAllForDay = useCallback((dayKey: string, isSelected: boolean) => {
      if (!groupedEntries[dayKey]) return;
      const dayEntryIds = groupedEntries[dayKey].entries.map(e => e.id).filter(id => id.includes('-'));
      
      setSelectedEntries(prev => {
        const otherDaySelections = prev.filter(id => !dayEntryIds.includes(id));
        if (isSelected) {
          return [...otherDaySelections, ...dayEntryIds];
        } else {
          return otherDaySelections;
        }
      });
  }, [groupedEntries]);

  const getEntryColor = (entry: LedgerEntry) => {
    const type = entry.type === 'Sale' && entry.isCreditSale ? 'Credit Sale' : entry.type;
    return colorSettings[type] || '#6b7280'; // default gray
  };
  
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

  const handleDeleteSelectedEntries = () => {
    if (selectedEntries.length === 0) return;

    let successCount = 0;
    let errorCount = 0;

    selectedEntries.forEach(entryId => {
        if (!entryId || !entryId.includes('-')) {
            errorCount++;
            return;
        }

        const [typePrefix, id] = entryId.split(/-(.*)/s);
        if (!id) {
            errorCount++;
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
                    throw new Error('Unknown entry type for deletion.');
            }
            successCount++;
        } catch (error: any) {
            errorCount++;
            console.error(`Failed to delete entry ${entryId}:`, error);
        }
    });

    if (successCount > 0) {
        toast({
            title: 'Entries Deleted',
            description: `${successCount} entries have been successfully deleted.`,
        });
    }
    if (errorCount > 0) {
        toast({
            variant: 'destructive',
            title: 'Deletion Error',
            description: `Failed to delete ${errorCount} entries.`,
        });
    }

    setSelectedEntries([]);
    setShowDeleteSelectedDialog(false);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDateRange(undefined);
    setSelectedType('');
  }

  const hasActiveFilters = searchTerm || dateRange?.from || selectedType;
  const currentDayKey = format(new Date(), 'yyyy-MM-dd');

  let runningEntryCount = filteredEntries.length;

  const getEntryLink = (entry: LedgerEntry): string => {
    if (entry.type === 'Sale') {
      return `/invoice/sale/${entry.original.id}`;
    }
    if (entry.type === 'Purchase') {
      return `/invoice/purchase/${entry.original.id}`;
    }
    if (entry.original.customerId) {
        return `/customers/${entry.original.customerId}/ledger`;
    }
    if (entry.original.supplierId) {
        return `/customers/${entry.original.supplierId}/ledger`;
    }
    if (entry.original.partnerId) {
        return `/customers/${entry.original.partnerId}/ledger`;
    }
    return '#'; // Default fallback
  }

  return (
    <>
    <div className="p-4 md:p-8 space-y-6">
       <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><BookOpen /> {showJournal ? 'General Journal' : 'Date Wise Business Report'}</h1>
          <p className="text-muted-foreground">{showJournal ? 'A chronological record of all financial transactions.' : 'A high-level business overview without individual journal entries.'}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2">
           <Input 
            placeholder="Search descriptions..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="w-full md:w-48"
          />
            <Select value={selectedType} onValueChange={(value) => setSelectedType(value === 'all' ? '' : value)}>
                <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {TRANSACTION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setShowJournal(!showJournal)}>{showJournal ? 'Show Business Report' : 'Show Full Journal'}</Button>

           {hasActiveFilters && <Button variant="ghost" onClick={clearFilters}><X className="mr-2 h-4 w-4"/>Clear</Button>}

           {selectedEntries.length > 0 && (
              <Button 
                variant="destructive" 
                onClick={() => setShowDeleteSelectedDialog(true)}
              >
                Delete Selected ({selectedEntries.length})
              </Button>
            )}
        </div>
       </header>

        <div className="grid gap-6 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Package /> Product Wise Sale Report</CardTitle>
                    <CardDescription>A summary of all product sales for the selected period.</CardDescription>
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
                    <CardDescription>A summary of overall profit for the selected period.</CardDescription>
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
            <CardTitle>Daily Overview</CardTitle>
            <CardDescription>{hasActiveFilters ? 'Showing filtered results.' : 'All transactions grouped by day.'}</CardDescription>
        </CardHeader>
        <CardContent>
            {dayKeys.length > 0 ? (
                <Accordion type="multiple" className="w-full space-y-4" defaultValue={[currentDayKey, ...dayKeys.filter(k => k !== currentDayKey)]}>
                    {dayKeys.map(dayKey => {
                       const dayData = groupedEntries[dayKey];
                       if (dayData.entries.length === 0 && !hasActiveFilters) return null;
                       
                       const dayEntryIds = dayData.entries.map(e => e.id).filter(id => id.includes('-'));
                       const areAllSelected = dayEntryIds.length > 0 && dayEntryIds.every(id => selectedEntries.includes(id));
                       const areSomeSelected = dayEntryIds.some(id => selectedEntries.includes(id));

                        return (
                        <AccordionItem value={dayKey} key={dayKey} className="border-b-0">
                            <Card>
                                <AccordionTrigger className="hover:no-underline p-4 text-lg">
                                    <div className="flex justify-between w-full pr-4">
                                        <span className="font-semibold">{format(new Date(dayKey), 'EEEE, dd MMMM yyyy')}</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-2 pb-2">
                                    <div className="p-4 rounded-lg bg-muted/50 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 text-sm mb-4">
                                        <div>
                                            <h4 className="font-semibold border-b pb-1 mb-1 text-green-600">Income</h4>
                                            <div className="flex justify-between"><span>Cash Sale:</span> <span className="font-mono">{dayData.dailySummary.cashSale.toLocaleString()}</span></div>
                                            <div className="flex justify-between"><span>Recovery:</span> <span className="font-mono">{dayData.dailySummary.recovery.toLocaleString()}</span></div>
                                            <div className="flex justify-between"><span>Other:</span> <span className="font-mono">{dayData.dailySummary.otherIncome.toLocaleString()}</span></div>
                                            <div className="flex justify-between"><span>Stock Surplus:</span> <span className="font-mono">{dayData.dailySummary.stockSurplus.toLocaleString()}</span></div>
                                        </div>
                                        <div>
                                            <h4 className="font-semibold border-b pb-1 mb-1 text-destructive">Expenses</h4>
                                            <div className="flex justify-between"><span>Credit Sale:</span> <span className="font-mono">{dayData.dailySummary.creditSale.toLocaleString()}</span></div>
                                            <div className="flex justify-between"><span>Cash Advance:</span> <span className="font-mono">{dayData.dailySummary.cashAdvance.toLocaleString()}</span></div>
                                            <div className="flex justify-between"><span>Expenses:</span> <span className="font-mono">{dayData.dailySummary.expenses.toLocaleString()}</span></div>
                                            <div className="flex justify-between"><span>Stock Shortage:</span> <span className="font-mono">{dayData.dailySummary.stockShortage.toLocaleString()}</span></div>
                                        </div>
                                        <div className="col-span-2 md:col-span-1">
                                            <h4 className="font-semibold border-b pb-1 mb-1 text-blue-600">Purchases</h4>
                                            <div className="flex justify-between"><span>Purchases:</span> <span className="font-mono">{dayData.dailySummary.purchases.toLocaleString()}</span></div>
                                            <div className="flex justify-between"><span>Supplier Payment:</span> <span className="font-mono">{dayData.dailySummary.supplierPayment.toLocaleString()}</span></div>
                                        </div>
                                        <div className="col-span-2 md:col-span-3 lg:col-span-2">
                                            <h4 className="font-semibold border-b pb-1 mb-1">Balance Summary</h4>
                                            <div className="flex justify-between"><span>Opening Balance:</span> <span className="font-mono">{dayData.openingBalance.toLocaleString(undefined, {minimumFractionDigits:0})}</span></div>
                                            <div className="flex justify-between"><span>Total Debits:</span> <span className="font-mono text-destructive">{dayData.totalDebit.toLocaleString(undefined, {minimumFractionDigits:0})}</span></div>
                                            <div className="flex justify-between"><span>Total Credits:</span> <span className="font-mono text-green-600">{dayData.totalCredit.toLocaleString(undefined, {minimumFractionDigits:0})}</span></div>
                                            <div className="flex justify-between font-bold"><span>Closing Balance:</span> <span className="font-mono">{dayData.closingBalance.toLocaleString(undefined, {minimumFractionDigits:0})}</span></div>
                                        </div>
                                    </div>
                                    {showJournal && (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-12 px-4">
                                                      <Checkbox
                                                        checked={areAllSelected ? true : areSomeSelected ? 'indeterminate' : false}
                                                        onCheckedChange={(checked) => handleSelectAllForDay(dayKey, !!checked)}
                                                        aria-label="Select all entries for this day"
                                                      />
                                                    </TableHead>
                                                    <TableHead>Sr #</TableHead>
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
                                                {dayData.entries.slice().reverse().map((entry) => {
                                                    const date = new Date(entry.timestamp);
                                                    const color = getEntryColor(entry);
                                                    const typeLabel = entry.type === 'Sale' && entry.isCreditSale ? 'Credit Sale' : entry.type === 'Sale' && !entry.isCreditSale ? 'Cash Sale' : entry.type === 'Customer Payment' ? 'Amount' : entry.type;
                                                    const currentSr = runningEntryCount--;
                                                    const link = getEntryLink(entry);

                                                    return (
                                                        <TableRow key={entry.id}>
                                                            <TableCell className="px-4">
                                                              <Checkbox
                                                                checked={selectedEntries.includes(entry.id)}
                                                                onCheckedChange={(checked) => handleSelectEntry(entry.id, !!checked)}
                                                                disabled={!entry.id.includes('-')}
                                                                aria-label="Select row"
                                                              />
                                                            </TableCell>
                                                            <TableCell>{currentSr}</TableCell>
                                                            <TableCell className="font-medium" style={{ color }}>
                                                                {isValid(date) ? format(date, 'dd/MM/yy hh:mm a') : 'Invalid Date'}
                                                            </TableCell>
                                                            <TableCell className="font-medium" style={{ color }}>
                                                                <Link href={link} className="hover:underline">
                                                                    {entry.description}
                                                                </Link>
                                                            </TableCell>
                                                            <TableCell>
                                                            <Badge 
                                                                className="text-xs border"
                                                                style={{
                                                                    backgroundColor: `${color}20`,
                                                                    color: color,
                                                                    borderColor: `${color}40`,
                                                                }}
                                                            >
                                                              {typeLabel}
                                                            </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono" style={{ color }}>
                                                                {entry.debit > 0 ? entry.debit.toFixed(2) : '-'}
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono" style={{ color }}>
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
                                        </Table>
                                    )}
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

      <AlertDialog open={showDeleteSelectedDialog} onOpenChange={setShowDeleteSelectedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected {selectedEntries.length} entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelectedEntries} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, delete {selectedEntries.length} entries
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

