'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDatabase } from '@/hooks/use-database';
import { format, isValid, startOfDay, endOfDay } from 'date-fns';
import { TrendingUp, Printer, Download, Search, Filter, ShoppingCart, DollarSign, Percent, Fuel, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '@/components/date-range-picker';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

type ReportEntry = {
  id: string;
  date: string;
  itemOrParty: string;
  productName: string;
  type: 'Sale' | 'Purchase';
  purchaseAmount: number;
  saleAmount: number;
  profit: number;
  margin: number;
};

export default function ProfitMarginReportPage() {
  const { transactions, purchases, isLoaded, dateRange, setDateRange } = useDatabase();
  const [filterType, setFilterType] = useState<'all' | 'sale' | 'purchase'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const reportData = useMemo(() => {
    if (!isLoaded) return [];

    const from = dateRange?.from ? startOfDay(dateRange.from) : null;
    const to = dateRange?.to ? endOfDay(dateRange.to) : (from ? endOfDay(from) : null);

    const filterByDate = (itemDateStr: string) => {
      if (!from || !to) return true;
      const d = new Date(itemDateStr);
      return isValid(d) && d >= from && d <= to;
    };

    const entries: ReportEntry[] = [];

    // Process Purchases
    purchases.forEach(p => {
      if (filterByDate(p.timestamp)) {
        entries.push({
          id: p.id,
          date: p.timestamp,
          itemOrParty: `${p.supplier} (${p.fuelType})`,
          productName: p.fuelType,
          type: 'Purchase',
          purchaseAmount: p.totalCost,
          saleAmount: 0,
          profit: -p.totalCost,
          margin: 0,
        });
      }
    });

    // Process Sales (Transactions)
    transactions.forEach(tx => {
      if (filterByDate(tx.timestamp)) {
        const saleAmount = tx.totalAmount;
        const purchaseAmount = tx.costPrice || 0;
        const profit = saleAmount - purchaseAmount;
        const margin = saleAmount > 0 ? (profit / saleAmount) * 100 : 0;
        const product = tx.product || tx.fuelType || 'Unknown';

        entries.push({
          id: tx.id,
          date: tx.timestamp,
          itemOrParty: `${tx.customerName || 'Walk-in'} (${product})`,
          productName: product,
          type: 'Sale',
          purchaseAmount: purchaseAmount,
          saleAmount: saleAmount,
          profit: profit,
          margin: margin,
        });
      }
    });

    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [isLoaded, transactions, purchases, dateRange]);

  const filteredEntries = useMemo(() => {
    let result = reportData;

    if (filterType !== 'all') {
      result = result.filter(e => e.type.toLowerCase() === filterType);
    }

    if (searchTerm) {
      result = result.filter(e => e.itemOrParty.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    return result;
  }, [reportData, filterType, searchTerm]);

  const productSummaries = useMemo(() => {
    const summaryMap: Record<string, { sales: number; purchase: number; profit: number }> = {};
    
    filteredEntries.forEach(e => {
        const prod = e.productName || 'General';
        if (!summaryMap[prod]) summaryMap[prod] = { sales: 0, purchase: 0, profit: 0 };
        
        summaryMap[prod].sales += e.saleAmount;
        summaryMap[prod].purchase += e.purchaseAmount;
        summaryMap[prod].profit += e.profit;
    });
    
    return Object.entries(summaryMap).map(([name, data]) => ({
        name,
        ...data,
        margin: data.sales > 0 ? (data.profit / data.sales) * 100 : 0
    })).sort((a, b) => b.profit - a.profit);
  }, [filteredEntries]);

  const totals = useMemo(() => {
    const t = filteredEntries.reduce((acc, curr) => {
      acc.purchase += curr.purchaseAmount;
      acc.sale += curr.saleAmount;
      acc.profit += curr.profit;
      return acc;
    }, { purchase: 0, sale: 0, profit: 0 });

    const overallMargin = t.sale > 0 ? (t.profit / t.sale) * 100 : 0;
    return { ...t, margin: overallMargin };
  }, [filteredEntries]);

  const handleExportExcel = () => {
    const dataToExport = filteredEntries.map(e => ({
      'Date': format(new Date(e.date), 'dd-MMM-yyyy hh:mm a'),
      'Item/Party': e.itemOrParty,
      'Type': e.type,
      'Purchase Amount (PKR)': e.purchaseAmount.toFixed(2),
      'Sale Amount (PKR)': e.saleAmount.toFixed(2),
      'Profit/Loss (PKR)': e.profit.toFixed(2),
      'Margin (%)': e.margin.toFixed(2) + '%',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Profit Margin Report');
    XLSX.writeFile(workbook, 'ProfitMarginReport.xlsx');
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="text-primary" /> Real-Time Profit Margin Report
          </h1>
          <p className="text-muted-foreground">Monitor your real-time profitability and margins across all transactions.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker date={dateRange} onDateChange={setDateRange} />
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print</Button>
          <Button variant="outline" onClick={handleExportExcel}><Download className="mr-2 h-4 w-4" /> Excel</Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-muted/30">
          <CardHeader className="py-3"><CardTitle className="text-xs uppercase text-muted-foreground">Total Purchase</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-destructive">PKR {totals.purchase.toLocaleString()}</p></CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardHeader className="py-3"><CardTitle className="text-xs uppercase text-muted-foreground">Total Sale</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-700">PKR {totals.sale.toLocaleString()}</p></CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardHeader className="py-3"><CardTitle className="text-xs uppercase text-muted-foreground">Total Profit/Loss</CardTitle></CardHeader>
          <CardContent><p className={cn("text-2xl font-bold", totals.profit >= 0 ? "text-green-700" : "text-destructive")}>PKR {totals.profit.toLocaleString()}</p></CardContent>
        </Card>
        <Card className="bg-primary/10 border-primary/20">
          <CardHeader className="py-3"><CardTitle className="text-xs uppercase text-primary">Overall Profit Margin</CardTitle></CardHeader>
          <CardContent><p className={cn("text-2xl font-bold", totals.margin >= 0 ? "text-primary" : "text-destructive")}>{totals.margin.toFixed(2)}%</p></CardContent>
        </Card>
      </div>

      {productSummaries.length > 0 && (
          <div className="space-y-4">
              <h3 className="text-lg font-bold flex items-center gap-2 px-1">
                  <TrendingUp className="w-5 h-5 text-primary" /> Product Wise Performance
              </h3>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                  {productSummaries.map((ps) => (
                      <Card key={ps.name} className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
                          <CardHeader className="py-3 pb-1">
                              <CardTitle className="text-sm font-bold flex items-center gap-2 truncate">
                                  {ps.name.toLowerCase().includes('oil') ? <Package className="w-3.5 h-3.5" /> : <Fuel className="w-3.5 h-3.5" />}
                                  {ps.name}
                              </CardTitle>
                          </CardHeader>
                          <CardContent className="pb-3">
                              <div className="space-y-1">
                                  <div className="flex justify-between items-baseline">
                                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Net Profit</span>
                                      <span className={cn("text-sm font-black font-mono", ps.profit >= 0 ? "text-green-600" : "text-destructive")}>
                                          {ps.profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                      </span>
                                  </div>
                                  <div className="flex justify-between items-baseline">
                                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Margin</span>
                                      <span className={cn("text-sm font-black font-mono", ps.margin >= 0 ? "text-primary" : "text-destructive")}>
                                          {ps.margin.toFixed(2)}%
                                      </span>
                                  </div>
                              </div>
                          </CardContent>
                      </Card>
                  ))}
              </div>
          </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Audit Entries</CardTitle>
              <CardDescription>A merged view of sales and purchases for the selected period.</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search item or party..." 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                  className="pl-8" 
                />
              </div>
              <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
                <SelectTrigger className="w-full sm:w-40">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="All Entries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Combined Report</SelectItem>
                  <SelectItem value="sale">Sale entries</SelectItem>
                  <SelectItem value="purchase">Purchase entries</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item/Party</TableHead>
                  <TableHead className="text-right">Purchase Amount</TableHead>
                  <TableHead className="text-right">Sale Amount</TableHead>
                  <TableHead className="text-right">Profit/Loss</TableHead>
                  <TableHead className="text-right">Profit Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoaded && filteredEntries.length > 0 ? filteredEntries.map((e) => (
                  <TableRow key={e.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="whitespace-nowrap font-medium text-muted-foreground">
                      {format(new Date(e.date), 'dd-MMM-yyyy hh:mm a')}
                    </TableCell>
                    <TableCell className="font-bold">{e.itemOrParty}</TableCell>
                    <TableCell className="text-right font-mono text-destructive">
                      {e.purchaseAmount > 0 ? e.purchaseAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-700">
                      {e.saleAmount > 0 ? e.saleAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                    </TableCell>
                    <TableCell className={cn("text-right font-mono font-bold", e.profit >= 0 ? "text-green-700" : "text-destructive")}>
                      {e.profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className={cn("text-right font-bold", e.margin > 0 ? "text-primary" : e.margin < 0 ? "text-destructive" : "text-muted-foreground")}>
                      {e.margin !== 0 || e.saleAmount > 0 ? `${e.margin.toFixed(2)}%` : '-'}
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">
                      {isLoaded ? 'No records found for the selected filters.' : 'Loading report data...'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
