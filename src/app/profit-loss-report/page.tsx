
'use client';

import { useMemo } from 'react';
import { useDatabase } from '@/hooks/use-database';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown, ShoppingCart } from 'lucide-react';
import { startOfDay, endOfDay, isValid } from 'date-fns';
import type { Purchase } from '@/lib/types';

export default function ProfitLossReportPage() {
  const {
    transactions,
    otherIncomes,
    expenses,
    products,
    purchases,
    stockAdjustments,
    isLoaded,
    dateRange,
  } = useDatabase();

  const filteredData = useMemo(() => {
    if (!isLoaded) return { transactions: [], otherIncomes: [], expenses: [], purchases: [], stockAdjustments: [] };

    if (!dateRange || !dateRange.from) {
      return { transactions, otherIncomes, expenses, purchases, stockAdjustments };
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
      purchases: filterByDate(purchases),
      stockAdjustments: filterByDate(stockAdjustments),
    };
  }, [isLoaded, transactions, otherIncomes, expenses, purchases, stockAdjustments, dateRange]);


  const profitSummary = useMemo(() => {
    if (!isLoaded) return null;
    const { transactions, otherIncomes, expenses, stockAdjustments } = filteredData;
    
    const costOfGoodsSold = transactions.reduce((totalCost, sale) => {
        const productInfo = products.find(p => p.name === (sale.product || sale.fuelType));

        if (!productInfo) {
            return totalCost; 
        }

        if (productInfo.category === 'Main Product') {
            if (!sale.timestamp || !isValid(new Date(sale.timestamp)) || !sale.volume || sale.volume <= 0) {
                return totalCost;
            }
            
            const saleTime = new Date(sale.timestamp).getTime();
            let latestPurchase: Purchase | null = null;
            let latestPurchaseTime = 0;

            // Use all purchases for accurate COGS calculation, not just filtered ones
            for (const p of purchases) {
                if (p.fuelType && p.fuelType.toLowerCase() === sale.fuelType.toLowerCase() && p.timestamp && isValid(new Date(p.timestamp))) {
                    const purchaseTime = new Date(p.timestamp).getTime();
                    if (purchaseTime <= saleTime && purchaseTime > latestPurchaseTime) {
                        latestPurchaseTime = purchaseTime;
                        latestPurchase = p;
                    }
                }
            }
            
            if (latestPurchase && latestPurchase.volume > 0) {
                const costPerLitre = latestPurchase.totalCost / latestPurchase.volume;
                return totalCost + (costPerLitre * sale.volume);
            }

            return totalCost;
        } else { // Supplementary Product
            const quantity = sale.volume || 0;
            const purchasePrice = productInfo.purchasePrice || 0;
            return totalCost + (purchasePrice * quantity);
        }
    }, 0);


    const totalSalesAmount = transactions.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const salesProfit = totalSalesAmount - costOfGoodsSold;

    const totalOtherIncome = otherIncomes.reduce((sum, income) => sum + income.amount, 0);

    const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    const totalSurplus = stockAdjustments
      .filter(adj => adj.adjustment > 0)
      .reduce((sum, adj) => sum + adj.value, 0);

    const totalShortage = stockAdjustments
      .filter(adj => adj.adjustment < 0)
      .reduce((sum, adj) => sum + Math.abs(adj.value), 0);
      
    const netStockAdjustment = totalSurplus - totalShortage;

    const netProfit = salesProfit + totalOtherIncome - totalExpenses + netStockAdjustment;

    return {
        totalSalesAmount,
        costOfGoodsSold,
        salesProfit,
        totalOtherIncome,
        totalExpenses,
        netStockAdjustment,
        netProfit,
    };
  }, [isLoaded, filteredData, products, purchases]);

  if (!isLoaded || !profitSummary) {
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
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {profitSummary.netStockAdjustment >= 0 ? 'Stock Surplus' : 'Stock Loss'}
                        </CardTitle>
                        {profitSummary.netStockAdjustment >= 0 ? (
                            <TrendingUp className="h-4 w-4 text-green-500" />
                        ) : (
                            <TrendingDown className="h-4 w-4 text-red-500" />
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${profitSummary.netStockAdjustment >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                            PKR {Math.abs(profitSummary.netStockAdjustment).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        <p className="text-xs text-muted-foreground">Net value from stock adjustments</p>
                    </CardContent>
                </Card>
                <Card className="col-span-1 md:col-span-2 lg:col-span-3">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-4xl font-bold ${profitSummary.netProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>PKR {profitSummary.netProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                        <p className="text-xs text-muted-foreground">Sales Profit + Other Income - Expenses +/- Stock Adjustments</p>
                    </CardContent>
                </Card>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
