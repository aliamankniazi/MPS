'use client';

import { useState, useTransition, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDatabase } from '@/hooks/use-database';
import { generateSalesSummary } from '@/ai/flows/generate-sales-summary';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileText, Sparkles, AlertTriangle, TrendingUp, TrendingDown, DollarSign, BarChart2, Package, Printer, Download } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { startOfDay, endOfDay, isValid } from 'date-fns';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import type { Transaction, Purchase } from '@/lib/types';


const chartConfig = {
  totalRevenue: {
    label: "Revenue",
    color: "hsl(var(--chart-2))",
  },
  totalCostOfGoods: {
    label: "COGS",
    color: "hsl(var(--chart-4))",
  },
  netProfit: {
    label: "Net Profit",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;


export default function SummaryPage() {
  const { transactions, purchases, expenses, otherIncomes, products, customerPayments, cashAdvances, isLoaded, dateRange } = useDatabase();

  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const filteredData = useMemo(() => {
    if (!isLoaded) return { transactions: [], purchases: [], expenses: [], otherIncomes: [], customerPayments: [], cashAdvances: [] };

    if (!dateRange || !dateRange.from) {
      return { transactions, purchases, expenses, otherIncomes, customerPayments, cashAdvances };
    }

    const from = startOfDay(dateRange.from);
    const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);

    const filterByDate = (items: any[]) => items.filter(item => {
      const itemDate = new Date(item.timestamp);
      return isValid(itemDate) && itemDate >= from && itemDate <= to;
    });

    return {
      transactions: filterByDate(transactions),
      purchases: filterByDate(purchases),
      expenses: filterByDate(expenses),
      otherIncomes: filterByDate(otherIncomes),
      customerPayments: filterByDate(customerPayments),
      cashAdvances: filterByDate(cashAdvances),
    };
  }, [isLoaded, transactions, purchases, expenses, otherIncomes, customerPayments, cashAdvances, dateRange]);

  const financialSummary = useMemo(() => {
    if (!isLoaded) return null;

    const { transactions, purchases, expenses, otherIncomes } = filteredData;

    const totalFuelRevenue = transactions.reduce((sum, tx) => sum + tx.totalAmount, 0);
    const totalOtherRevenue = otherIncomes.reduce((sum, oi) => sum + oi.amount, 0);
    const totalRevenue = totalFuelRevenue + totalOtherRevenue;

    const totalExpenses = expenses.reduce((sum, ex) => sum + ex.amount, 0);
    const totalCostOfGoods = purchases.reduce((sum, p) => sum + p.totalCost, 0);

    const grossProfit = totalRevenue - totalCostOfGoods;
    const netProfit = grossProfit - totalExpenses;

    return {
      totalRevenue,
      totalExpenses,
      totalCostOfGoods,
      grossProfit,
      netProfit,
    };
  }, [isLoaded, filteredData]);
  
  const chartData = useMemo(() => {
      if (!financialSummary) return [];
      return [
        { 
          name: "Financials", 
          totalRevenue: financialSummary.totalRevenue,
          totalCostOfGoods: financialSummary.totalCostOfGoods,
          netProfit: financialSummary.netProfit > 0 ? financialSummary.netProfit : 0,
        }
      ];
  }, [financialSummary]);

  const productWiseSales = useMemo(() => {
    if (!isLoaded || !products) return [];
  
    const filteredTransactions: Transaction[] = filteredData.transactions;
  
    const salesByProduct = filteredTransactions.reduce((acc, tx) => {
      const productName = tx.product || tx.fuelType;
      if (!productName || productName === 'undefined') return acc;
  
      if (!acc[productName]) {
        const productInfo = products.find(p => p.name === productName);
        acc[productName] = {
          product: productName,
          unit: productInfo?.unit || 'Ltr',
          totalSold: 0,
          totalRevenue: 0,
          totalProfit: 0,
        };
      }
  
      acc[productName].totalSold += tx.volume || 0;
      acc[productName].totalRevenue += tx.totalAmount;
  
      let profit = 0;
      if (tx.fuelType && tx.volume > 0 && tx.timestamp && isValid(new Date(tx.timestamp))) {
        const saleTime = new Date(tx.timestamp).getTime();
        
        let latestPurchase: Purchase | null = null;
        let latestPurchaseTime = 0;
    
        for (const p of purchases) {
            if (p.fuelType && p.fuelType.toLowerCase() === tx.fuelType.toLowerCase() && p.timestamp && isValid(new Date(p.timestamp))) {
                const purchaseTime = new Date(p.timestamp).getTime();
                if (purchaseTime <= saleTime && purchaseTime > latestPurchaseTime) {
                    latestPurchaseTime = purchaseTime;
                    latestPurchase = p;
                }
            }
        }
        
        if (latestPurchase && latestPurchase.volume > 0 && typeof tx.pricePerLitre === 'number') {
            const costPerLitre = latestPurchase.totalCost / latestPurchase.volume;
            profit = (tx.pricePerLitre - costPerLitre) * tx.volume;
        }
      }
      acc[productName].totalProfit += profit;
  
      return acc;
    }, {} as Record<string, { product: string; unit: string; totalSold: number; totalRevenue: number; totalProfit: number }>);
  
    return Object.values(salesByProduct).map(item => {
      const avgSalePrice = item.totalSold > 0 ? item.totalRevenue / item.totalSold : 0;
      const profitPerUnit = item.totalSold > 0 ? item.totalProfit / item.totalSold : 0;
      const avgPurchasePrice = avgSalePrice - profitPerUnit;
  
      const productDetails = products.find(p => p.name === item.product);
      const isMainProduct = productDetails?.category === 'Main Product';
  
      return {
        ...item,
        key: item.product,
        avgPurchasePrice: isMainProduct ? avgPurchasePrice : 'N/A',
        profitPerUnit: isMainProduct ? profitPerUnit : 'N/A',
      };
    });
  }, [isLoaded, filteredData, products, purchases]);
  
  const handleExportExcel = () => {
    const dataToExport = productWiseSales.map(item => ({
      'Product': item.product,
      'Total Sold': `${item.totalSold.toFixed(2)} ${item.unit}`,
      'Avg Sale Price/Unit': (item.totalSold > 0 ? item.totalRevenue / item.totalSold : 0).toFixed(2),
      'Avg Purchase Price/Unit': typeof item.avgPurchasePrice === 'number' ? item.avgPurchasePrice.toFixed(2) : 'N/A',
      'Profit/Unit': typeof item.profitPerUnit === 'number' ? item.profitPerUnit.toFixed(2) : 'N/A',
      'Total Revenue': item.totalRevenue.toFixed(2),
      'Total Profit': typeof item.totalProfit === 'number' ? item.totalProfit.toFixed(2) : 'N/A',
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Product Sales Profit');
    XLSX.writeFile(workbook, 'ProductWiseSaleProfitReport.xlsx');
  };

  const dataForSummary = useMemo(() => {
    if (!isLoaded) return [];

    const { transactions, customerPayments, cashAdvances } = filteredData;

    const combinedData = [
      ...transactions.map(t => ({...t, type: 'Sale'})),
      ...customerPayments.map(p => ({...p, type: 'Customer Payment'})),
      ...cashAdvances.map(ca => ({...ca, type: 'Cash Advance'}))
    ];

    return combinedData;
  }, [isLoaded, filteredData]);


  const handleGenerateSummary = () => {
    setError('');
    setSummary('');
    startTransition(async () => {
      try {
        if (dataForSummary.length === 0) {
          setError("No activity recorded for the selected period to generate a summary.");
          return;
        }

        const result = await generateSalesSummary({
          activityData: JSON.stringify(dataForSummary),
        });
        setSummary([result.executiveSummary, result.salesAnalysis, result.expenseAnalysis, result.creditRecoveryStatus].filter(Boolean).join('\n\n'));
      } catch (e: any) {
        console.error(e);
        if (e.message && (e.message.toLowerCase().includes('rate limit') || e.message.toLowerCase().includes('rate exceeded'))) {
          setError('AI rate limit exceeded. Please wait a moment before trying again.');
        } else {
          setError('Failed to generate summary. Please try again later.');
        }
      }
    });
  };
  
  const hasData = isLoaded && dataForSummary.length > 0;

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div className="grid lg:grid-cols-2 gap-8">
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                    <Package /> Product Wise Sale Report
                </CardTitle>
                <CardDescription>A summary of sales for each product for the selected date range.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4"/> Print</Button>
                <Button variant="outline" onClick={handleExportExcel}><Download className="mr-2 h-4 w-4"/> Excel</Button>
              </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Total Sold</TableHead>
                            <TableHead className="text-right">Avg Sale Price</TableHead>
                            <TableHead className="text-right">Avg Purchase Price</TableHead>
                            <TableHead className="text-right">Profit/Unit</TableHead>
                            <TableHead className="text-right">Total Revenue</TableHead>
                            <TableHead className="text-right">Total Profit</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoaded && productWiseSales.length > 0 ? (
                            productWiseSales.map(item => (
                                <TableRow key={item.product}>
                                    <TableCell className="font-medium">{item.product}</TableCell>
                                    <TableCell className="text-right">{item.totalSold.toFixed(2)} {item.unit}</TableCell>
                                    <TableCell className="text-right">{(item.totalSold > 0 ? item.totalRevenue / item.totalSold : 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-right">{typeof item.avgPurchasePrice === 'number' ? item.avgPurchasePrice.toFixed(2) : item.avgPurchasePrice}</TableCell>
                                    <TableCell className="text-right">{typeof item.profitPerUnit === 'number' ? item.profitPerUnit.toFixed(2) : item.profitPerUnit}</TableCell>
                                    <TableCell className="text-right font-semibold">{item.totalRevenue.toFixed(2)}</TableCell>
                                    <TableCell className={cn("text-right font-semibold", typeof item.totalProfit === 'number' && item.totalProfit < 0 ? 'text-destructive' : 'text-green-600')}>{typeof item.totalProfit === 'number' ? item.totalProfit.toFixed(2) : item.totalProfit}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                             <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">
                                    {isLoaded ? 'No product sales data available for this period.' : 'Loading report...'}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

        <Card className="flex flex-col">
            <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <FileText /> Financial Activity AI Summary
            </CardTitle>
            <CardDescription>
                Use AI to generate a summary of financial activity for the selected period.
            </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col gap-4 min-h-[200px]">
            {error && (
                <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {isPending ? (
                <div className="space-y-4">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                </div>
            ) : summary ? (
                <div className="prose prose-sm sm:prose-base dark:prose-invert bg-muted/50 p-6 rounded-lg">
                <p>{summary}</p>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground flex-grow p-8 border-2 border-dashed rounded-lg">
                <Sparkles className="w-16 h-16" />
                <h3 className="text-xl font-semibold">Ready to Analyze</h3>
                <p>Click the button below to generate a summary of financial activity for the selected period.</p>
                </div>
            )}
            </CardContent>
            <CardFooter>
            <Button onClick={handleGenerateSummary} disabled={isPending || !hasData}>
                {isPending ? 'Generating...' : 'Generate Summary'}
            </Button>
            {!isLoaded && <p className="text-sm text-muted-foreground ml-4">Loading transactions...</p>}
            {isLoaded && !hasData && <p className="text-sm text-muted-foreground ml-4">No data for selected period.</p>}
            </CardFooter>
        </Card>
      </div>
    </div>
  );
}
