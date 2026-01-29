
'use client';

import { useMemo } from 'react';
import { useDatabase } from '@/hooks/use-database';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown, ShoppingCart } from 'lucide-react';
import { startOfDay, endOfDay, isValid } from 'date-fns';

export default function ProfitLossReportPage() {
  const {
    transactions,
    otherIncomes,
    expenses,
    isLoaded,
    dateRange,
  } = useDatabase();

  const filteredData = useMemo(() => {
    if (!isLoaded) return { transactions: [], otherIncomes: [], expenses: [] };

    if (!dateRange || !dateRange.from) {
      return { transactions, otherIncomes, expenses };
    }

    const from = startOfDay(dateRange.from);
    const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);

    const filterByDate = (items: any[]) => items.filter(item => {
      const itemDate = new Date(item.timestamp);
      return isValid(itemDate) && itemDate >= from && itemDate <= to;
    });

    return {
      transactions: filterByDate(transactions),
      otherIncomes: filterByDate(otherIncomes),
      expenses: filterByDate(expenses),
    };
  }, [isLoaded, transactions, otherIncomes, expenses, dateRange]);


  const profitSummary = useMemo(() => {
    const { transactions, otherIncomes, expenses } = filteredData;

    const totalSalesAmount = transactions.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const costOfGoodsSold = transactions.reduce((sum, sale) => sum + (sale.costPrice || 0), 0);
    const salesProfit = totalSalesAmount - costOfGoodsSold;

    const totalOtherIncome = otherIncomes.reduce((sum, income) => sum + income.amount, 0);

    const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    const netProfit = salesProfit + totalOtherIncome - totalExpenses;

    return {
        totalSalesAmount,
        costOfGoodsSold,
        salesProfit,
        totalOtherIncome,
        totalExpenses,
        netProfit,
    };
  }, [filteredData]);

  if (!isLoaded) {
    return <p>Loading...</p>
  }

  return (
    <div className="p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle>Real-Time Profit/Loss Report</CardTitle>
          <CardDescription>
            Live profit/loss calculation for the selected period.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Sales Amount</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">PKR {profitSummary.totalSalesAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Cost of Goods Sold (COGS)</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-destructive">PKR {profitSummary.costOfGoodsSold.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Sales Profit (Gross)</CardTitle>
                        <TrendingUp className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">PKR {profitSummary.salesProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                         <p className="text-xs text-muted-foreground">Total Sales - Cost of Goods</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Other Income</CardTitle>
                        <TrendingUp className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">PKR {profitSummary.totalOtherIncome.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                        <TrendingDown className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-destructive">PKR {profitSummary.totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    </CardContent>
                </Card>
                <Card className="col-span-1 md:col-span-2 lg:col-span-3">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-4xl font-bold ${profitSummary.netProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>PKR {profitSummary.netProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                        <p className="text-xs text-muted-foreground">Sales Profit + Other Income - Total Expenses</p>
                    </CardContent>
                </Card>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
