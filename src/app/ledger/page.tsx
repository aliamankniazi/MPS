

'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { format, isSameDay, startOfDay, isValid } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { BookOpen, DollarSign, Calendar as CalendarIcon, X, Trash2, AlertTriangle, TrendingUp, TrendingDown, LayoutDashboard, Printer, Download, Package } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
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
import { DataTable } from '@/components/ui/data-table';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';


type LedgerEntry = {
  id: string;
  timestamp: string;
  description: string;
  type: 'Sale' | 'Purchase' | 'Expense' | 'Purchase Return' | 'Other Income' | 'Supplier Payment' | 'Investment' | 'Withdrawal' | 'Customer Payment' | 'Salary' | 'Sale Return';
  debit: number;
  credit: number;
  balance: number;
  original: any;
};

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
  } = useDatabase();
  
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [entryToDelete, setEntryToDelete] = useState<LedgerEntry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const { entries, finalBalance, openingBalance, totals, productWiseSales, profitSummary } = useMemo(() => {
    if (!isLoaded) return { entries: [], finalBalance: 0, openingBalance: 0, totals: { debit: 0, credit: 0 }, productWiseSales: [], profitSummary: { totalRevenue: 0, costOfGoods: 0, grossProfit: 0, totalExpenses: 0, netProfit: 0 } };

    let combined: Omit<LedgerEntry, 'balance'>[] = [];

    // Sales and Payments
    transactions.forEach(tx => combined.push({
      id: `tx-${tx.id}`,
      timestamp: tx.timestamp,
      description: `Sale: ${tx.product || tx.fuelType} to ${tx.customerName || 'Walk-in'}`,
      type: 'Sale',
      debit: 0,
      credit: tx.totalAmount,
      original: tx,
    }));
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

    // Purchases and Supplier Payments
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
      debit: sp.amount,
      credit: 0,
      original: sp,
    }));


    // Expenses
    expenses.forEach(e => combined.push({
        id: `exp-${e.id}`,
        timestamp: e.timestamp,
        description: `Expense: ${e.description}`,
        type: 'Expense',
        debit: e.amount,
        credit: 0,
        original: e,
    }));
      
    // Returns
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


    // Incomes
    otherIncomes.forEach(oi => combined.push({
        id: `oi-${oi.id}`,
        timestamp: oi.timestamp,
        description: `Income: ${oi.description}`,
        type: 'Other Income',
        debit: 0,
        credit: oi.amount,
        original: oi,
    }));


    // Investments
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
    
    combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let calculatedOpeningBalance = 0;
    let entriesForDisplay = combined;
    let entriesForSummary = combined;

    if (selectedDate) {
      const dayStart = startOfDay(selectedDate);
      calculatedOpeningBalance = combined
        .filter(entry => {
            const entryDate = new Date(entry.timestamp);
            return isValid(entryDate) && entryDate < dayStart
        })
        .reduce((acc, entry) => acc + entry.credit - entry.debit, 0);
      
      entriesForDisplay = combined.filter(entry => isValid(new Date(entry.timestamp)) && isSameDay(new Date(entry.timestamp), selectedDate));
      entriesForSummary = entriesForDisplay;
    }
    
    if (searchTerm) {
        entriesForDisplay = entriesForDisplay.filter(entry => 
            entry.description.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }
    
    let runningBalance = calculatedOpeningBalance;
    const entriesWithBalance: LedgerEntry[] = entriesForDisplay.map(entry => {
      runningBalance += entry.credit - entry.debit;
      return { ...entry, balance: runningBalance };
    });
    
    const calculatedTotals = entriesForDisplay.reduce(
        (acc, entry) => {
            acc.debit += entry.debit;
            acc.credit += entry.credit;
            return acc;
        },
        { debit: 0, credit: 0 }
    );

    // Calculate Product Wise Sales based on the filtered entries
    const salesByProduct = entriesForSummary
      .filter(e => e.type === 'Sale')
      .reduce((acc, saleEntry) => {
        const tx = saleEntry.original as import('@/lib/types').Transaction;
        const productNameSource = tx.product || tx.fuelType || 'Uncategorized Sale';
        const products = productNameSource.split(',').map(p => p.trim());

        products.forEach(productName => {
           if (!acc[productName]) {
                acc[productName] = { totalSold: 0, totalRevenue: 0, count: 0, unit: 'items' };
                // A simple heuristic for units based on product name
                if (productName.toLowerCase().includes('diesel') || productName.toLowerCase().includes('unleaded') || productName.toLowerCase().includes('premium')) {
                    acc[productName].unit = 'Liters';
                } else if (productName.toLowerCase().includes('oil')) {
                     acc[productName].unit = 'Cans';
                }
            }
            // For multi-product sales, we approximate the contribution
            const productRevenue = tx.totalAmount / products.length;
            const productVolume = (tx.volume || products.length) / products.length;
            
            acc[productName].totalSold += productVolume;
            acc[productName].totalRevenue += productRevenue;
            acc[productName].count++;
        });

        return acc;
    }, {} as Record<string, { totalSold: number, totalRevenue: number, count: number, unit: string }>);

    const productWiseSalesData = Object.entries(salesByProduct).map(([product, data]) => ({
        product,
        totalSold: `${data.totalSold.toFixed(2)} ${data.unit}`,
        averagePrice: data.totalSold > 0 ? (data.totalRevenue / data.totalSold).toFixed(2) : '0.00',
        totalRevenue: data.totalRevenue.toFixed(2),
    }));

    // Calculate Profit Summary based on the filtered entries
    const totalRevenue = entriesForSummary.filter(e => ['Sale', 'Other Income'].includes(e.type)).reduce((sum, e) => sum + e.credit, 0);
    const totalReturns = entriesForSummary.filter(e => e.type === 'Sale Return').reduce((sum, e) => sum + e.debit, 0);
    
    const costOfGoods = entriesForSummary.filter(e => e.type === 'Purchase').reduce((sum, e) => sum + e.debit, 0);
    const costOfReturns = entriesForSummary.filter(e => e.type === 'Purchase Return').reduce((sum, e) => sum + e.credit, 0);
    
    const totalExpenses = entriesForSummary.filter(e => e.type === 'Expense').reduce((sum, e) => sum + e.debit, 0);
    
    const netRevenue = totalRevenue - totalReturns;
    const netCOGS = costOfGoods - costOfReturns;
    
    const grossProfit = netRevenue - netCOGS;
    const netProfit = grossProfit - totalExpenses;
    
    const profitSummaryData = { totalRevenue: netRevenue, costOfGoods: netCOGS, grossProfit, totalExpenses, netProfit };

    return { 
        entries: entriesWithBalance.reverse(), 
        finalBalance: runningBalance, 
        openingBalance: calculatedOpeningBalance,
        totals: calculatedTotals,
        productWiseSales: productWiseSalesData,
        profitSummary: profitSummaryData,
    };

  }, [isLoaded, transactions, purchases, expenses, purchaseReturns, saleReturns, otherIncomes, customerPayments, supplierPayments, investments, selectedDate, searchTerm]);
  
  const journalColumns = [
    { accessorKey: 'timestamp', header: 'Date & Time', cell: ({row}: any) => {
        const date = new Date(row.original.timestamp);
        return isValid(date) ? format(date, 'dd/MM/yy hh:mm a') : 'Invalid Date'
    }},
    { accessorKey: 'description', header: 'Particulars' },
    { accessorKey: 'type', header: 'Type', cell: ({row}: any) => {
        const type = row.original.type;
        const isCreditEntry = ['Sale', 'Purchase Return', 'Other Income', 'Investment', 'Customer Payment', 'Salary'].includes(type);
        return <Badge 
            variant={isCreditEntry ? 'outline' : 'destructive'}
            className={cn('text-xs', isCreditEntry && 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700')}
            >{type}</Badge>
    }},
    { accessorKey: 'debit', header: 'Debit (PKR)', cell: ({row}: any) => <span className="font-mono text-destructive">{row.original.debit > 0 ? row.original.debit.toFixed(2) : '-'}</span>, meta: { className: 'text-right' } },
    { accessorKey: 'credit', header: 'Credit (PKR)', cell: ({row}: any) => <span className="font-mono text-green-600">{row.original.credit > 0 ? row.original.credit.toFixed(2) : '-'}</span>, meta: { className: 'text-right' } },
    { accessorKey: 'balance', header: 'Balance (PKR)', cell: ({row}: any) => <span className={cn("font-semibold font-mono", row.original.balance >= 0 ? 'text-primary' : 'text-destructive')}>{row.original.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>, meta: { className: 'text-right' } },
    {
      id: 'actions',
      cell: ({ row }: any) => (
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setEntryToDelete(row.original)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const productSalesColumns = [
    { accessorKey: 'product', header: 'Product' },
    { accessorKey: 'totalSold', header: 'Total Sold', meta: { className: 'text-right' } },
    { accessorKey: 'averagePrice', header: 'Average Price / Unit', meta: { className: 'text-right' } },
    { accessorKey: 'totalRevenue', header: 'Total Revenue', meta: { className: 'text-right font-semibold' } },
  ];

  const exportToExcel = (data: any[], fileName: string) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = { Sheets: { 'data': worksheet }, SheetNames: ['data'] };
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {type: "application/octet-stream"});
    saveAs(blob, `${fileName}.xlsx`);
  }
  
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


  return (
    <>
    <div className="p-4 md:p-8 space-y-6">
       <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><BookOpen /> General Journal</h1>
          <p className="text-muted-foreground">A chronological record of all financial transactions.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input 
            placeholder="Search..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="w-full md:w-48"
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full md:w-[240px] justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, "PPP") : <span>Filter by date...</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus />
            </PopoverContent>
          </Popover>
          { (selectedDate || searchTerm) && <Button variant="ghost" onClick={() => { setSelectedDate(undefined); setSearchTerm(''); }}><X className="mr-2 h-4 w-4" /> Clear</Button> }
        </div>
       </header>
        
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Package /> Product Wise Sale Summary</CardTitle>
                        <CardDescription>
                          A summary of all product sales for {selectedDate ? format(selectedDate, "PPP") : 'all time'}.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                       <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-right">Total Sold</TableHead>
                                    <TableHead className="text-right">Average Price / Unit</TableHead>
                                    <TableHead className="text-right">Total Revenue</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoaded && productWiseSales.length > 0 ? (
                                    productWiseSales.map(item => (
                                        <TableRow key={item.product}>
                                            <TableCell className="font-medium">{item.product}</TableCell>
                                            <TableCell className="text-right">{item.totalSold}</TableCell>
                                            <TableCell className="text-right font-mono">{item.averagePrice}</TableCell>
                                            <TableCell className="text-right font-semibold font-mono">{parseFloat(item.totalRevenue).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">
                                            {isLoaded ? 'No sales data for this period.' : 'Loading sales data...'}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                             <TableFooter>
                                <TableRow className="font-bold text-base">
                                <TableCell colSpan={3} className="text-right">Total Revenue</TableCell>
                                <TableCell className="text-right font-mono">
                                    PKR {productWiseSales.reduce((sum, item) => sum + parseFloat(item.totalRevenue), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
            <div>
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><DollarSign/> Profit Summary</CardTitle>
                        <CardDescription>A summary of overall profit for {selectedDate ? format(selectedDate, "PPP") : 'all time'}.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        {isLoaded && profitSummary ? (
                            <>
                                <div className="flex justify-between items-center py-2 border-b">
                                    <span className="flex items-center gap-2 text-muted-foreground"><TrendingUp className="text-green-500"/>Net Revenue</span>
                                    <span className="font-semibold font-mono">{profitSummary.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                </div>
                                 <div className="flex justify-between items-center py-2 border-b">
                                    <span className="flex items-center gap-2 text-muted-foreground"><TrendingDown className="text-red-500"/>Cost of Goods</span>
                                    <span className="font-semibold font-mono">{profitSummary.costOfGoods.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b font-bold">
                                    <span>Gross Profit</span>
                                    <span className={cn("font-mono", profitSummary.grossProfit >= 0 ? 'text-green-600' : 'text-destructive')}>
                                        {profitSummary.grossProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b">
                                    <span className="flex items-center gap-2 text-muted-foreground"><TrendingDown className="text-red-500"/>Total Expenses</span>
                                    <span className="font-semibold font-mono">{profitSummary.totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 text-lg font-bold">
                                    <span>Net Profit</span>
                                    <span className={cn("font-mono", profitSummary.netProfit >= 0 ? 'text-primary' : 'text-destructive')}>
                                        {profitSummary.netProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                    </span>
                                </div>
                            </>
                        ) : <p>Loading summary...</p>}
                    </CardContent>
                </Card>
            </div>
        </div>

      <Card>
        <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                 <div>
                    <CardTitle>Journal Entries</CardTitle>
                </div>
                 <div className="flex items-center gap-2">
                    <Button variant="outline" asChild><Link href="/dashboard"><LayoutDashboard/> Go to Dashboard</Link></Button>
                    <Button variant="outline" onClick={() => window.print()}><Printer/> Print</Button>
                    <Button variant="outline" onClick={() => exportToExcel(entries, 'JournalEntries')}><Download/> Export to Excel</Button>
                </div>
            </div>
        </CardHeader>
        <CardContent>
            <DataTable columns={journalColumns} data={entries}>
                 {selectedDate && (
                  <Table>
                    <TableBody>
                        <TableRow className="bg-muted/30">
                            <TableCell colSpan={5} className="font-bold">Opening Balance</TableCell>
                            <TableCell className={`text-right font-semibold font-mono ${openingBalance >= 0 ? 'text-primary' : 'text-destructive'}`}>
                            {openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell />
                        </TableRow>
                    </TableBody>
                  </Table>
                )}
                 <TableFooter>
                    <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={3} className="text-right">Period Totals</TableCell>
                    <TableCell className="text-right font-mono text-destructive">{totals.debit.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-green-600">{totals.credit.toFixed(2)}</TableCell>
                    <TableCell colSpan={2}/>
                    </TableRow>
                    <TableRow className="bg-muted/50 font-bold text-lg">
                    <TableCell colSpan={5} className="text-right">Closing Balance</TableCell>
                    <TableCell colSpan={2} className={cn("text-right font-mono", finalBalance >= 0 ? 'text-primary' : 'text-destructive')}>
                        {finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    </TableRow>
                </TableFooter>
            </DataTable>
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
