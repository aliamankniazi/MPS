
'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { format, isValid, startOfMonth, endOfMonth, isSameDay, startOfDay, endOfDay } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { BookOpen, DollarSign, Trash2, AlertTriangle, TrendingUp, TrendingDown, LayoutDashboard, Printer, Download, Package, BarChart2, X, Pencil } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { DateRangePicker } from '@/components/date-range-picker';


type LedgerEntry = {
  id: string;
  timestamp: string;
  description: string;
  partnerName: string;
  entityId?: string;
  type: 'Sale' | 'Purchase' | 'Expense' | 'Purchase Return' | 'Sale Return' | 'Other Income' | 'Supplier Payment' | 'Investment' | 'Withdrawal' | 'Customer Payment' | 'Salary' | 'Cash Advance' | 'Daily Closing Stock' | 'Salary Expense';
  debit: number;
  credit: number;
  balance: number;
  original: any;
  isCreditSale?: boolean;
  notes?: string;
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
        creditSale: number;
        cashAdvance: number;
        expenses: number;
        purchases: number;
        supplierPayment: number;
    }
  }
}

const TRANSACTION_TYPES = [
    'Sale', 'Purchase', 'Expense', 'Purchase Return', 'Sale Return', 'Other Income', 
    'Customer Payment', 'Supplier Payment', 'Cash Advance', 'Investment', 'Withdrawal', 'Salary', 'Salary Expense', 'Daily Closing Stock'
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
    fuelPrices,
    products,
    customers,
    suppliers,
    businessPartners,
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

  const entityBalances = useMemo(() => {
    if (!isLoaded) return {};
    const balances: Record<string, number> = {};

    // Customers
    customers.forEach(c => {
        const opening = c.openingBalance || 0;
        const sales = transactions.filter(tx => tx.customerId === c.id).reduce((sum, tx) => sum + tx.totalAmount, 0);
        const advances = cashAdvances.filter(ca => ca.customerId === c.id).reduce((sum, ca) => sum + ca.amount, 0);
        const payments = customerPayments.filter(p => p.customerId === c.id).reduce((sum, p) => sum + p.amount, 0);
        balances[c.id] = opening + sales + advances - payments;
    });

    // Suppliers
    suppliers.forEach(s => {
        const opening = s.openingBalance || 0;
        const purchasesTotal = purchases.filter(p => p.supplierId === s.id).reduce((sum, p) => sum + p.totalCost, 0);
        const paymentsTotal = supplierPayments.filter(sp => sp.supplierId === s.id).reduce((sum, sp) => sum + sp.amount, 0);
        balances[s.id] = opening + purchasesTotal - paymentsTotal;
    });

    // Business Partners (their investment capital, separate from any customer balance they may have)
    businessPartners.forEach(p => {
        const investmentsTotal = investments.filter(i => i.partnerId === p.id && i.type === 'Investment').reduce((sum, i) => sum + i.amount, 0);
        const withdrawalsTotal = investments.filter(i => i.partnerId === p.id && i.type === 'Withdrawal').reduce((sum, i) => sum + i.amount, 0);
        balances[p.id] = (balances[p.id] || 0) + investmentsTotal - withdrawalsTotal;
    });


    return balances;
  }, [isLoaded, customers, suppliers, businessPartners, transactions, purchases, customerPayments, supplierPayments, cashAdvances, investments]);


  const allEntries = useMemo(() => {
    if (!isLoaded) return [];
    
    let combined: Omit<LedgerEntry, 'balance'>[] = [];

    transactions.forEach(tx => {
        if (!tx.timestamp || !isValid(new Date(tx.timestamp))) return;
        
        const customer = customers.find(c => c.id === tx.customerId);
        const customerName = customer ? customer.name : (tx.customerName || 'Walk-in Customer');

        const description = tx.volume ? `${tx.volume.toFixed(2)}L of ${tx.fuelType}`: (tx.product || 'General Sale');
        
        const isCreditSale = tx.customerId && tx.customerId !== 'walkin' && tx.customerName !== 'Walk-in Customer';

        combined.push({
            id: `tx-${tx.id}`,
            timestamp: tx.timestamp,
            description,
            partnerName: customerName,
            entityId: tx.customerId,
            type: 'Sale',
            debit: isCreditSale ? tx.totalAmount : 0,
            credit: !isCreditSale ? tx.totalAmount : 0,
            original: tx,
            isCreditSale: isCreditSale,
            notes: tx.notes,
        });
    });
    
    customerPayments.forEach(cp => {
        if (!cp.timestamp || !isValid(new Date(cp.timestamp))) return;
        if (cp.paymentMethod === 'Salary') return; // Exclude salary payments as they're handled by expenses

        const customer = customers.find(c => c.id === cp.customerId);
        const customerName = customer ? customer.name : cp.customerName;

        const description = `Payment Received`;
        combined.push({
          id: `cp-${cp.id}`,
          timestamp: cp.timestamp,
          description,
          partnerName: customerName,
          entityId: cp.customerId,
          type: 'Customer Payment',
          debit: 0,
          credit: cp.amount,
          original: cp,
          notes: cp.notes,
        })
    });
    
     cashAdvances.forEach(ca => {
        if (!ca.timestamp || !isValid(new Date(ca.timestamp))) return;

        const customer = customers.find(c => c.id === ca.customerId);
        const customerName = customer ? customer.name : ca.customerName;

        combined.push({
          id: `ca-${ca.id}`,
          timestamp: ca.timestamp,
          description: 'Cash Advance',
          partnerName: customerName,
          entityId: ca.customerId,
          type: 'Cash Advance',
          debit: ca.amount,
          credit: 0,
          original: ca,
          notes: ca.notes,
        })
    });

    purchases.forEach(p => {
        if (!p.timestamp || !isValid(new Date(p.timestamp))) return;
        
        const supplier = suppliers.find(s => s.id === p.supplierId);
        const supplierName = supplier ? supplier.name : p.supplier;

        const description = p.volume ? `${p.volume.toFixed(2)}L of ${p.fuelType}` : (p.fuelType || 'General Purchase');
        combined.push({
            id: `pur-${p.id}`,
            timestamp: p.timestamp,
            description,
            partnerName: supplierName,
            entityId: p.supplierId,
            type: 'Purchase',
            credit: p.totalCost,
            debit: 0,
            original: p,
        })
    });

     supplierPayments.forEach(sp => {
        if (!sp.timestamp || !isValid(new Date(sp.timestamp))) return;

        const supplier = suppliers.find(s => s.id === sp.supplierId);
        const supplierName = supplier ? supplier.name : sp.supplierName;

        combined.push({
            id: `sp-${sp.id}`,
            timestamp: sp.timestamp,
            description: `Payment Made (${sp.paymentMethod})`,
            partnerName: supplierName,
            entityId: sp.supplierId,
            type: 'Supplier Payment',
            debit: sp.amount, 
            credit: 0, 
            original: sp,
        })
    });

    expenses.forEach(e => {
        if (!e.timestamp || !isValid(new Date(e.timestamp))) return;
        
        const isSalaryExpense = e.category === 'Salaries';
        const employeeNameFromDesc = e.description.replace('Salary for ', '').replace(/ \(.*/, '');
        const employeeAsCustomer = customers.find(c => c.name === employeeNameFromDesc && c.area === 'Employee');
        const partnerName = isSalaryExpense 
            ? (employeeAsCustomer ? employeeAsCustomer.name : employeeNameFromDesc) 
            : 'Internal';

        combined.push({
            id: `exp-${e.id}`,
            timestamp: e.timestamp,
            description: e.description,
            partnerName: partnerName,
            entityId: employeeAsCustomer?.id,
            type: isSalaryExpense ? 'Salary' : 'Expense',
            debit: e.amount,
            credit: 0,
            original: e,
        })
    });
    
    purchaseReturns.forEach(pr => {
        if (!pr.timestamp || !isValid(new Date(pr.timestamp))) return;

        const supplier = suppliers.find(s => s.id === pr.supplierId);
        const supplierName = supplier ? supplier.name : pr.supplier;

        combined.push({
            id: `pr-${pr.id}`,
            timestamp: pr.timestamp,
            description: `Return: ${pr.volume.toFixed(2)}L of ${pr.fuelType}`,
            partnerName: supplierName,
            entityId: pr.supplierId,
            type: 'Purchase Return',
            debit: 0,
            credit: pr.totalRefund,
            original: pr,
            notes: pr.reason,
        })
    });
    
    saleReturns.forEach(sr => {
      if (!sr.timestamp || !isValid(new Date(sr.timestamp))) return;

      const customer = customers.find(c => c.id === sr.customerId);
      const customerName = customer ? customer.name : sr.customerName;

      combined.push({
        id: `sr-${sr.id}`,
        timestamp: sr.timestamp,
        description: `Return: ${sr.volume.toFixed(2)}L of ${sr.fuelType}`,
        partnerName: customerName,
        entityId: sr.customerId,
        type: 'Sale Return',
        debit: sr.totalRefund,
        credit: 0,
        original: sr,
        notes: sr.reason,
      });
    });

    otherIncomes.forEach(oi => {
        if (!oi.timestamp || !isValid(new Date(oi.timestamp))) return;
        combined.push({
            id: `oi-${oi.id}`,
            timestamp: oi.timestamp,
            description: `Income: ${oi.description}`,
            partnerName: 'Internal',
            type: 'Other Income',
            debit: 0,
            credit: oi.amount,
            original: oi,
        })
    });
    
    investments.forEach(inv => {
        if (!inv.timestamp || !isValid(new Date(inv.timestamp))) return;

        const partner = businessPartners.find(p => p.id === inv.partnerId);
        const partnerName = partner ? partner.name : inv.partnerName;

        if (inv.type === 'Investment') {
            combined.push({
                id: `inv-${inv.id}`,
                timestamp: inv.timestamp,
                description: 'Investment',
                partnerName: partnerName,
                entityId: inv.partnerId,
                type: 'Investment',
                debit: 0,
                credit: inv.amount,
                original: inv,
                notes: inv.notes,
            });
        } else {
            combined.push({
                id: `wdr-${inv.id}`,
                timestamp: inv.timestamp,
                description: 'Withdrawal',
                partnerName: partnerName,
                entityId: inv.partnerId,
                type: 'Withdrawal',
                debit: inv.amount,
                credit: 0,
                original: inv,
                notes: inv.notes,
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

  }, [isLoaded, transactions, purchases, expenses, purchaseReturns, saleReturns, otherIncomes, customerPayments, supplierPayments, investments, cashAdvances, products, customers, suppliers, businessPartners]);

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
        const lowercasedTerm = searchTerm.toLowerCase();
        entries = entries.filter(e => 
            (e.description?.toLowerCase().includes(lowercasedTerm)) ||
            (e.partnerName?.toLowerCase().includes(lowercasedTerm)) ||
            (e.notes?.toLowerCase().includes(lowercasedTerm)) ||
            (e.type?.toLowerCase().includes(lowercasedTerm))
        );
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
    const rangeStart = dateRange?.from ? startOfDay(dateRange.from) : null;
    
    const openingBalanceForRange = rangeStart
      ? allEntries
          .filter(e => isValid(new Date(e.timestamp)) && new Date(e.timestamp) < rangeStart)
          .reduce((bal, item) => bal + item.credit - item.debit, 0)
      : 0;

    let lastDayClosingBalance = openingBalanceForRange;
    
    // Get unique day keys from filtered entries and sort them chronologically
    const dayKeysSorted = [...new Set(filteredEntries.map(e => format(new Date(e.timestamp), 'yyyy-MM-dd')))]
      .filter(key => isValid(new Date(key)))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const result: GroupedEntries = {};

    for (const dayKey of dayKeysSorted) {
      const dayEntries = filteredEntries.filter(e => format(new Date(e.timestamp), 'yyyy-MM-dd') === dayKey);
      
      const dayOpeningBalance = lastDayClosingBalance;

      const dayDebit = dayEntries.reduce((sum, e) => sum + e.debit, 0);
      const dayCredit = dayEntries.reduce((sum, e) => sum + e.credit, 0);

      lastDayClosingBalance = dayOpeningBalance + dayCredit - dayDebit;
      
      result[dayKey] = {
        entries: dayEntries,
        openingBalance: dayOpeningBalance,
        closingBalance: lastDayClosingBalance,
        totalDebit: dayDebit,
        totalCredit: dayCredit,
        dailySummary: dayEntries.reduce((summary, entry) => {
          if (entry.type === 'Sale' && !entry.isCreditSale) summary.cashSale += entry.credit;
          if (entry.type === 'Sale' && entry.isCreditSale) summary.creditSale += entry.debit;
          if (entry.type === 'Customer Payment' || entry.type === 'Salary') summary.recovery += entry.credit;
          if (entry.type === 'Other Income') summary.otherIncome += entry.credit;
          if (entry.type === 'Cash Advance') summary.cashAdvance += entry.debit;
          if (entry.type === 'Expense' || entry.type === 'Salary Expense') summary.expenses += entry.debit;
          if (entry.type === 'Purchase') summary.purchases += entry.credit;
          if (entry.type === 'Supplier Payment') summary.supplierPayment += entry.debit;
          return summary;
        }, { cashSale: 0, recovery: 0, otherIncome: 0, creditSale: 0, cashAdvance: 0, expenses: 0, purchases: 0, supplierPayment: 0 })
      };
    }
    
    return result;

  }, [filteredEntries, allEntries, dateRange]);
  
  const dayKeys = Object.keys(groupedEntries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  // This loop calculates the running balance for each individual entry *within* a day for display purposes.
  dayKeys.forEach(key => {
    let runningBalance = groupedEntries[key].openingBalance;
    groupedEntries[key].entries.forEach(entry => {
        runningBalance += entry.credit - entry.debit;
        entry.balance = runningBalance;
    });
  });

  const allFilteredEntryIds = useMemo(() =>
    filteredEntries.map(e => e.id).filter(id => id && id.includes('-'))
  , [filteredEntries]);

  const masterCheckboxState = useMemo(() => {
    if (allFilteredEntryIds.length === 0) return false;
    const intersectionCount = allFilteredEntryIds.filter(id => selectedEntries.includes(id)).length;

    if (intersectionCount === 0) return false;
    if (intersectionCount === allFilteredEntryIds.length) return true;
    return 'indeterminate';
  }, [allFilteredEntryIds, selectedEntries]);
  
  const handleExportExcel = () => {
    const dataToExport = filteredEntries.slice().reverse().map(entry => { // reverse to get chronological order for export
        const date = new Date(entry.timestamp);
        const typeLabel = entry.type === 'Sale' && entry.isCreditSale ? 'Credit Sale' : entry.type === 'Sale' && !entry.isCreditSale ? 'Cash Sale' : entry.type === 'Customer Payment' ? 'Amount' : entry.type;
        return {
            'Date': isValid(date) ? format(date, 'dd-MMM-yyyy hh:mm a') : 'Invalid Date',
            'Partner': entry.partnerName,
            'Notes': entry.notes || '',
            'Particulars': entry.description,
            'Type': typeLabel,
            'Debit (PKR)': entry.debit > 0 ? entry.debit.toFixed(2) : '',
            'Credit (PKR)': entry.credit > 0 ? entry.credit.toFixed(2) : '',
            'Balance (PKR)': entry.balance.toFixed(2),
        };
    });
    
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ledger');
    XLSX.writeFile(workbook, 'GeneralLedger.xlsx');
  };

  const handleSelectAllGlobal = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
        // When checking, add all currently filtered IDs to the selection
        setSelectedEntries(prev => [...new Set([...prev, ...allFilteredEntryIds])]);
    } else {
        // When unchecking, remove all currently filtered IDs from the selection
        const filteredIdSet = new Set(allFilteredEntryIds);
        setSelectedEntries(prev => prev.filter(id => !filteredIdSet.has(id)));
    }
  };

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
    if (!entry.entityId) return '#';

    if (entry.type === 'Sale') {
      return `/invoice/sale/${entry.original.id}`;
    }
    if (entry.type === 'Purchase') {
      return `/invoice/purchase/${entry.original.id}`;
    }
    if (entry.original.customerId || entry.type === 'Customer Payment' || entry.type === 'Cash Advance' || entry.type === 'Sale Return' ) {
        return `/customers/${entry.entityId}/ledger`;
    }
    if (entry.original.supplierId || entry.type === 'Supplier Payment' || entry.type === 'Purchase Return') {
        return `/customers/${entry.entityId}/ledger`;
    }
    if (entry.original.partnerId || entry.type === 'Investment' || entry.type === 'Withdrawal') {
        return `/customers/${entry.entityId}/ledger`;
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
            placeholder="Search journal..." 
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
            <DateRangePicker date={dateRange} onDateChange={setDateRange} />
            <Button variant="outline" onClick={() => setShowJournal(!showJournal)}>{showJournal ? 'Show Business Report' : 'Show Full Journal'}</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4"/> Print</Button>
            <Button variant="outline" onClick={handleExportExcel}><Download className="mr-2 h-4 w-4"/> Excel</Button>

           {hasActiveFilters && <Button variant="ghost" onClick={clearFilters}><X className="mr-2 h-4 w-4"/>Clear</Button>}

           <div className="flex items-center space-x-2 border-l pl-4 ml-4">
              <Checkbox
                id="select-all-global"
                checked={masterCheckboxState}
                onCheckedChange={handleSelectAllGlobal}
              />
              <Label htmlFor="select-all-global" className="text-sm font-medium">
                Select All ({allFilteredEntryIds.length})
              </Label>
            </div>

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
                       if (!dayData || dayData.entries.length === 0) return null;
                       
                       const dayEntryIds = dayData.entries.map(e => e.id).filter(id => id.includes('-'));
                       const areAllSelected = dayEntryIds.length > 0 && dayEntryIds.every(id => selectedEntries.includes(id));
                       const areSomeSelected = dayEntryIds.some(id => selectedEntries.includes(id));

                        return (
                        <AccordionItem value={dayKey} key={dayKey} className="border border-red-500 rounded-lg overflow-hidden bg-background shadow-sm">
                            <AccordionTrigger className="hover:no-underline p-4 text-lg data-[state=open]:bg-muted/50">
                                <div className="flex justify-between w-full pr-4 items-center">
                                    <span className="font-semibold text-red-500">{format(new Date(dayKey), 'EEEE, dd MMMM yyyy')}</span>
                                    <div className="flex gap-4 text-sm font-normal">
                                        <span>Previous Closing: <span className="font-mono text-muted-foreground">{dayData.openingBalance.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits: 2})}</span></span>
                                        <span>Day's Closing: <span className="font-mono font-semibold">{dayData.closingBalance.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits: 2})}</span></span>
                                    </div>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4 bg-background">
                                <div className="p-4 rounded-lg bg-muted/50 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 text-sm mb-4">
                                    <div>
                                        <h4 className="font-semibold border-b pb-1 mb-1 text-green-600">Income</h4>
                                        <div className="flex justify-between"><span>Cash Sale:</span> <span className="font-mono">{dayData.dailySummary.cashSale.toLocaleString()}</span></div>
                                        <div className="flex justify-between"><span>Recovery:</span> <span className="font-mono">{dayData.dailySummary.recovery.toLocaleString()}</span></div>
                                        <div className="flex justify-between"><span>Other:</span> <span className="font-mono">{dayData.dailySummary.otherIncome.toLocaleString()}</span></div>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold border-b pb-1 mb-1 text-destructive">Expenses</h4>
                                        <div className="flex justify-between"><span>Credit Sale:</span> <span className="font-mono">{dayData.dailySummary.creditSale.toLocaleString()}</span></div>
                                        <div className="flex justify-between"><span>Cash Advance:</span> <span className="font-mono">{dayData.dailySummary.cashAdvance.toLocaleString()}</span></div>
                                        <div className="flex justify-between"><span>Expenses:</span> <span className="font-mono">{dayData.dailySummary.expenses.toLocaleString()}</span></div>
                                    </div>
                                    <div className="col-span-2 md:col-span-1">
                                        <h4 className="font-semibold border-b pb-1 mb-1 text-blue-600">Purchases</h4>
                                        <div className="flex justify-between"><span>Purchases:</span> <span className="font-mono">{dayData.dailySummary.purchases.toLocaleString()}</span></div>
                                        <div className="flex justify-between"><span>Supplier Payment:</span> <span className="font-mono">{dayData.dailySummary.supplierPayment.toLocaleString()}</span></div>
                                    </div>
                                    <div className="col-span-2 md:col-span-3 lg:col-span-2">
                                        <h4 className="font-semibold border-b pb-1 mb-1">Balance Summary</h4>
                                        <div className="flex justify-between"><span>Previous Closing:</span> <span className="font-mono">{dayData.openingBalance.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits: 2})}</span></div>
                                        <div className="flex justify-between"><span>Total Debits:</span> <span className="font-mono text-destructive">{dayData.totalDebit.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits: 2})}</span></div>
                                        <div className="flex justify-between"><span>Total Credits:</span> <span className="font-mono text-green-600">{dayData.totalCredit.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits: 2})}</span></div>
                                        <div className="flex justify-between font-bold"><span>Day's Closing Balance:</span> <span className="font-mono">{dayData.closingBalance.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits: 2})}</span></div>
                                    </div>
                                </div>
                                {showJournal && (
                                    <div className="border rounded-md">
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
                                                <TableHead>Partner</TableHead>
                                                <TableHead>Notes</TableHead>
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
                                                            {isValid(date) ? format(date, 'dd-MMM-yyyy hh:mm a') : 'Invalid Date'}
                                                        </TableCell>
                                                        <TableCell className="font-medium" style={{ color }}>
                                                            <Link href={link} className="hover:underline" rel="noopener noreferrer">
                                                                {entry.partnerName}
                                                            </Link>
                                                            {entry.entityId && entityBalances[entry.entityId] !== undefined && (
                                                                <div className="text-xs text-muted-foreground">
                                                                    Cur. Bal: {entityBalances[entry.entityId].toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>{entry.notes || ''}</TableCell>
                                                        <TableCell className="font-medium" style={{ color }}>
                                                            {entry.description}
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
                                                            <Button asChild variant="ghost" size="icon" title="Edit">
                                                                <Link href="/customers">
                                                                    <Pencil className="w-4 h-4" />
                                                                </Link>
                                                            </Button>
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
                                    </div>
                                )}
                            </AccordionContent>
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
