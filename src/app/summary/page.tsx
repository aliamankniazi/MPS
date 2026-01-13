
'use client';

import { useState, useTransition, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDatabase } from '@/hooks/use-database';
import { generateSalesSummary } from '@/ai/flows/generate-sales-summary';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileText, Sparkles, AlertTriangle, TrendingUp, TrendingDown, DollarSign, BarChart2, Package } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { isToday } from 'date-fns';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';


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
  const { transactions, purchases, expenses, otherIncomes, products, isLoaded } = useDatabase();

  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const financialSummary = useMemo(() => {
    if (!isLoaded) return null;

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
  }, [transactions, purchases, expenses, otherIncomes, isLoaded]);
  
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

    const salesByProduct = transactions.reduce((acc, tx) => {
        const productName = tx.product || tx.fuelType;
        if (!productName || productName === 'undefined') return acc;
        
        if (!acc[productName]) {
            const productInfo = products.find(p => p.name === productName);
            acc[productName] = {
                product: productName,
                unit: productInfo?.unit || 'Ltr',
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


  const handleGenerateSummary = () => {
    setError('');
    setSummary('');
    startTransition(async () => {
      try {
        const todayTransactions = transactions.filter(tx => isToday(new Date(tx.timestamp)));
        if (todayTransactions.length === 0) {
          setError("No sales recorded today to generate a summary.");
          return;
        }

        const result = await generateSalesSummary({
          dailySalesData: JSON.stringify(todayTransactions),
        });
        setSummary(result.summary);
      } catch (e) {
        console.error(e);
        setError('Failed to generate summary. Please try again later.');
      }
    });
  };
  
  const hasTodayTransactions = isLoaded && transactions.some(tx => isToday(new Date(tx.timestamp)));

  return (
    <div className="p-4 md:p-8 space-y-8">
      <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign /> Financial Report
            </CardTitle>
            <CardDescription>An overview of your business's financial performance.</CardDescription>
          </CardHeader>
          <CardContent>
            {!isLoaded ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-8 w-2/3" />
              </div>
            ) : financialSummary ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
                 <Card className="lg:col-span-1">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">PKR {financialSummary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <p className="text-xs text-muted-foreground">From all sales and income sources</p>
                  </CardContent>
                </Card>
                 <Card className="lg:col-span-1">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">PKR {financialSummary.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <p className="text-xs text-muted-foreground">Revenue - COGS</p>
                  </CardContent>
                </Card>
                 <Card className="lg:col-span-1">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${financialSummary.netProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      PKR {financialSummary.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <p className="text-xs text-muted-foreground">After all expenses</p>
                  </CardContent>
                </Card>
                 <Card className="lg:col-span-1">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Cost of Goods</CardTitle>
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">PKR {financialSummary.totalCostOfGoods.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <p className="text-xs text-muted-foreground">From all fuel purchases</p>
                  </CardContent>
                </Card>
                 <Card className="lg:col-span-1">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Expenses</CardTitle>
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">PKR {financialSummary.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <p className="text-xs text-muted-foreground">Salaries, utilities, etc.</p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <p>No data available to generate a financial report.</p>
            )}
          </CardContent>
        </Card>
        
      <div className="grid lg:grid-cols-2 gap-8">
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Package /> Product Wise Sale Report
                </CardTitle>
                <CardDescription>A summary of sales for each product across all time.</CardDescription>
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
                        {isLoaded && productWiseSales.length > 0 ? (
                            productWiseSales.map(item => (
                                <TableRow key={item.product}>
                                    <TableCell className="font-medium">{item.product}</TableCell>
                                    <TableCell className="text-right">{item.totalSold.toFixed(2)} {item.unit}</TableCell>
                                    <TableCell className="text-right">{(item.totalSold > 0 ? item.totalRevenue / item.totalSold : 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-semibold">{item.totalRevenue.toFixed(2)}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                             <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    {isLoaded ? 'No product sales data available.' : 'Loading report...'}
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
                <FileText /> Daily Sales AI Summary
            </CardTitle>
            <CardDescription>
                Use AI to generate a summary of today's sales transactions.
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
                <p>Click the button below to generate a summary of today's sales.</p>
                </div>
            )}
            </CardContent>
            <CardFooter>
            <Button onClick={handleGenerateSummary} disabled={isPending || !hasTodayTransactions}>
                {isPending ? 'Generating...' : 'Generate Daily Summary'}
            </Button>
            {!isLoaded && <p className="text-sm text-muted-foreground ml-4">Loading transactions...</p>}
            {isLoaded && !hasTodayTransactions && <p className="text-sm text-muted-foreground ml-4">No sales data for today.</p>}
            </CardFooter>
        </Card>
      </div>
    </div>
  );
}
