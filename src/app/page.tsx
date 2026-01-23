
'use client';

import { useMemo, useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, isValid, startOfDay, endOfDay } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DollarSign, Users, TrendingUp, TrendingDown, ListOrdered, ShoppingCart, Calendar as CalendarIcon, Receipt, Fuel, BarChart2 } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';
import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import type { DateRange, FuelType } from '@/lib/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";


export default function DashboardPage() {
  const { transactions, purchases, expenses, otherIncomes, stockAdjustments, products, fuelStock, isLoaded, dateRange, setDateRange } = useDatabase();
  const [currentTime, setCurrentTime] = useState('');
    
  useEffect(() => {
    const timer = setInterval(() => {
        const now = new Date();
        const gregorianDate = now.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        const islamicDate = new Intl.DateTimeFormat('en-US-u-ca-islamic', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(now);

        const time = now.toLocaleString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        });

        setCurrentTime(`${gregorianDate} | ${islamicDate.replace(' AH', '')} | ${time}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const filteredData = useMemo(() => {
    if (!isLoaded) return { transactions: [], purchases: [], expenses: [], otherIncomes: [], stockAdjustments: [] };

    if (!dateRange || !dateRange.from) {
      return { transactions, purchases, expenses, otherIncomes, stockAdjustments };
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
      stockAdjustments: filterByDate(stockAdjustments),
    };
  }, [isLoaded, transactions, purchases, expenses, otherIncomes, stockAdjustments, dateRange]);


  const financialSummary = useMemo(() => {
    if (!isLoaded) return null;

    const { transactions, purchases, expenses, otherIncomes, stockAdjustments } = filteredData;

    const totalRevenue = transactions.reduce((sum, tx) => sum + tx.totalAmount, 0) + otherIncomes.reduce((sum, oi) => sum + oi.amount, 0);
    const totalCostOfGoods = purchases.reduce((sum, p) => sum + p.totalCost, 0);
    const totalExpenses = expenses.reduce((sum, ex) => sum + ex.amount, 0);
    const netProfit = totalRevenue - totalCostOfGoods - totalExpenses;
    const activeCustomers = new Set(transactions.map(tx => tx.customerId).filter(Boolean)).size;

    const salesByDay = transactions.reduce((acc, tx) => {
        const txDate = new Date(tx.timestamp);
        if (tx.timestamp && isValid(txDate)) {
            const date = txDate.toDateString();
            acc[date] = (acc[date] || 0) + tx.totalAmount;
        }
        return acc;
    }, {} as Record<string, number>);

    let bestSaleDay = { date: '', amount: 0 };
    for (const date in salesByDay) {
        if (salesByDay[date] > bestSaleDay.amount) {
            bestSaleDay = { date, amount: salesByDay[date] };
        }
    }
    
    const totalSurplus = stockAdjustments
      .filter(adj => adj.adjustment > 0)
      .reduce((sum, adj) => sum + adj.value, 0);

    const totalShortage = stockAdjustments
      .filter(adj => adj.adjustment < 0)
      .reduce((sum, adj) => sum + adj.value, 0);


    return {
      totalRevenue,
      totalPurchases: totalCostOfGoods,
      totalExpenses,
      netProfit,
      activeCustomers,
      bestSaleDay,
      totalSurplus,
      totalShortage,
    };
  }, [isLoaded, filteredData]);
  
  const productStats = useMemo(() => {
    if (!isLoaded || !products || !fuelStock) return [];

    const mainProducts = products.filter(p => p.category === 'Main Product');

    const sortedProducts = mainProducts.map(product => {
      const totalVolumeSold = filteredData.transactions
        .filter(t => (t.fuelType === product.name || t.product === product.name) && t.volume)
        .reduce((sum, t) => sum + t.volume, 0);
      return { ...product, totalVolumeSold };
    }).sort((a, b) => b.totalVolumeSold - a.totalVolumeSold);


    return sortedProducts.map(product => {
        const salesForProduct = transactions.filter(t => (t.fuelType === product.name || t.product === product.name));
        const purchasesForProduct = purchases.filter(p => p.fuelType === product.name);

        salesForProduct.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        purchasesForProduct.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const lastSale = salesForProduct[0];
        const lastPurchase = purchasesForProduct[0];
        const lastPurchaseRate = lastPurchase && lastPurchase.volume > 0 ? lastPurchase.totalCost / lastPurchase.volume : 0;
        
        const lastSaleRate = lastSale ? lastSale.pricePerLitre : product.price;
        const profitPerUnit = lastSaleRate > 0 && lastPurchaseRate > 0 ? lastSaleRate - lastPurchaseRate : 0;
        
        const totalProfit = filteredData.transactions
            .filter(t => (t.fuelType === product.name || t.product === product.name) && t.volume)
            .reduce((sum, t) => sum + (profitPerUnit * t.volume), 0);

        return {
            name: product.name,
            stock: fuelStock[product.name as FuelType] || 0,
            lastSaleRate: lastSaleRate,
            lastPurchaseRate: lastPurchaseRate,
            profitPerUnit: profitPerUnit,
            totalProfit: totalProfit,
            lastSaleDate: lastSale ? new Date(lastSale.timestamp) : null,
            lastPurchaseDate: lastPurchase ? new Date(lastPurchase.timestamp) : null,
        };
    });

  }, [isLoaded, products, transactions, purchases, fuelStock, filteredData]);

  const salesChartData = useMemo(() => {
    if (!isLoaded) return [];
    
    const endDate = new Date();
    
    const dailySales = transactions.reduce((acc, tx) => {
        const txDate = new Date(tx.timestamp);
        if (tx.timestamp && isValid(txDate)) {
            const date = format(txDate, 'yyyy-MM-dd');
            acc[date] = (acc[date] || 0) + tx.totalAmount;
        }
        return acc;
    }, {} as Record<string, number>);

    return Array.from({ length: 31 }, (_, i) => {
        const date = subDays(endDate, 30 - i);
        const formattedDate = format(date, 'yyyy-MM-dd');
        const shortDate = format(date, 'MMM d');
        return {
            date: shortDate,
            sales: dailySales[formattedDate] || 0,
        };
    });

  }, [isLoaded, transactions]);
  
  const topCustomers = useMemo(() => {
    if (!isLoaded) return [];

    const customerTotals = filteredData.transactions.reduce((acc, tx) => {
        if (tx.customerId && tx.customerName && tx.customerName !== 'Walk-in Customer') {
            acc[tx.customerId] = {
                id: tx.customerId,
                name: tx.customerName,
                total: (acc[tx.customerId]?.total || 0) + tx.totalAmount,
            };
        }
        return acc;
    }, {} as Record<string, { id: string; name: string; total: number }>);
    
    return Object.values(customerTotals)
        .sort((a,b) => b.total - a.total)
        .slice(0, 5);

  }, [isLoaded, filteredData.transactions]);

  const dailyProductSales = useMemo(() => {
    if (!isLoaded) return {};
    
    const salesByDayAndProduct = filteredData.transactions.reduce((acc, tx) => {
        if (tx.timestamp && isValid(new Date(tx.timestamp))) {
            const date = format(new Date(tx.timestamp), 'yyyy-MM-dd');
            if (!acc[date]) {
                acc[date] = {};
            }
            const productName = tx.product || tx.fuelType;
            if (!productName) return acc;
            if (!acc[date][productName]) {
                const productInfo = products.find(p => p.name === productName);
                acc[date][productName] = {
                    totalVolume: 0,
                    totalAmount: 0,
                    unit: productInfo?.unit || 'Ltr',
                };
            }
            acc[date][productName].totalVolume += tx.volume || 0;
            acc[date][productName].totalAmount += tx.totalAmount;
        }
        return acc;
    }, {} as Record<string, Record<string, { totalVolume: number; totalAmount: number; unit: string }>>);

    return salesByDayAndProduct;
    }, [isLoaded, filteredData.transactions, products]);

    const sortedDailySalesKeys = useMemo(() => {
        return Object.keys(dailyProductSales).sort((a,b) => new Date(b).getTime() - new Date(a).getTime())
    }, [dailyProductSales]);
  
  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <div className="flex items-baseline gap-4">
              <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
              <p className="text-xl font-bold text-blue-600">{currentTime}</p>
            </div>
            <p className="text-muted-foreground">A quick overview of your business performance.</p>
        </div>
        <div className="flex items-center gap-2">
             <Popover>
                <PopoverTrigger asChild>
                    <Button
                        id="date"
                        variant={"outline"}
                        className={cn(
                            "w-[300px] justify-start text-left font-normal",
                            !dateRange && "text-muted-foreground"
                        )}
                        >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (
                            dateRange.to ? (
                            <>
                                {format(dateRange.from, "dd-MMM-yyyy")} -{" "}
                                {format(dateRange.to, "dd-MMM-yyyy")}
                            </>
                            ) : (
                            format(dateRange.from, "dd-MMM-yyyy")
                            )
                        ) : (
                            <span>Pick a date range</span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                        key="dashboard-calendar"
                        initialFocus
                        mode="range"
                        defaultMonth={dateRange?.from}
                        selected={dateRange}
                        onSelect={setDateRange}
                        numberOfMonths={2}
                    />
                </PopoverContent>
            </Popover>
            <Button asChild variant="outline">
                <Link href="/reports">View All Reports</Link>
            </Button>
            <Button asChild>
                <Link href="/sales">New Sale</Link>
            </Button>
        </div>
      </div>

       <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-6">
          {/* Stat Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-600">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">PKR {financialSummary?.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '...'}</div>
                <p className="text-xs text-muted-foreground">For selected period</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-600">Total Purchases</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-pink-600">PKR {financialSummary?.totalPurchases.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '...'}</div>
                <p className="text-xs text-muted-foreground">Total cost of goods</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-600">Total Expenses</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">PKR {financialSummary?.totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '...'}</div>
                <p className="text-xs text-muted-foreground">For selected period</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-600">Stock Surplus</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">PKR {financialSummary?.totalSurplus.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '...'}</div>
                <p className="text-xs text-muted-foreground">Value of surplus stock</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-600">Stock Shortage</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">PKR {financialSummary?.totalShortage.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '...'}</div>
                <p className="text-xs text-muted-foreground">Value of stock shortage</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-600">Net Profit</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${financialSummary && financialSummary.netProfit < 0 ? 'text-destructive' : 'text-green-600'}`}>PKR {financialSummary?.netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '...'}</div>
                <p className="text-xs text-muted-foreground">After all costs & expenses</p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-blue-600">Sales Chart</CardTitle>
              <CardDescription>A look at your sales revenue over the last 30 days.</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={salesChartData}>
                  <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                  <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(value) => `PKR ${Number(value) / 1000}k`} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip
                      contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          borderColor: 'hsl(var(--border))',
                          borderRadius: 'var(--radius)',
                          fontSize: '12px'
                      }}
                      labelStyle={{ fontWeight: 'bold' }}
                      formatter={(value) => [`PKR ${Number(value).toLocaleString()}`, 'Sales']}
                  />
                  <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorSales)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {productStats.map(stat => (
                <Card key={stat.name}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-medium flex items-center gap-2 text-blue-600"><Fuel size={16} />{stat.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Stock Available</span>
                            <span className="font-mono font-semibold">{stat.stock.toLocaleString(undefined, { maximumFractionDigits: 2 })} Ltr</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Last Sale Rate</span>
                            <span className="font-mono font-semibold">PKR {stat.lastSaleRate.toFixed(2)}</span>
                        </div>
                         <div className="flex justify-between">
                            <span className="text-muted-foreground">Last Purchase Rate</span>
                            <span className="font-mono font-semibold">PKR {stat.lastPurchaseRate.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Profit / Unit</span>
                            <span className="font-mono font-semibold">PKR {stat.profitPerUnit.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold">
                            <span className="text-muted-foreground">Total Profit</span>
                            <span className="font-mono">PKR {stat.totalProfit.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Last Sale</span>
                            <span className="font-mono">{stat.lastSaleDate ? format(stat.lastSaleDate, 'dd MMM, yy') : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Last Purchase</span>
                            <span className="font-mono">{stat.lastPurchaseDate ? format(stat.lastPurchaseDate, 'dd MMM, yy') : 'N/A'}</span>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>

        </div>

        <div className="lg:col-span-2 space-y-6">
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-blue-600"><BarChart2 /> Daily Product Sales</CardTitle>
                    <CardDescription>A breakdown of sales by product for each day in the selected period.</CardDescription>
                </CardHeader>
                <CardContent>
                    {sortedDailySalesKeys.length > 0 ? (
                        <Accordion type="single" collapsible className="w-full">
                            {sortedDailySalesKeys.map(date => (
                                <AccordionItem value={date} key={date}>
                                    <AccordionTrigger>{format(new Date(date), 'EEEE, dd MMMM yyyy')}</AccordionTrigger>
                                    <AccordionContent>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Product</TableHead>
                                                    <TableHead className="text-right">Volume Sold</TableHead>
                                                    <TableHead className="text-right">Total Revenue</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {Object.entries(dailyProductSales[date]).map(([productName, data]) => (
                                                    <TableRow key={productName}>
                                                        <TableCell>{productName}</TableCell>
                                                        <TableCell className="text-right">{data.totalVolume.toFixed(2)} {data.unit}</TableCell>
                                                        <TableCell className="text-right font-mono">PKR {data.totalAmount.toFixed(2)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    ) : (
                        <div className="text-center text-muted-foreground p-8">
                            No sales data available for the selected period.
                        </div>
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-blue-600"><ListOrdered /> Top 5 Customers</CardTitle>
                    <CardDescription>Based on total sales in the selected period.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableBody>
                            {topCustomers.map((customer, index) => (
                                <TableRow key={customer.id}>
                                    <TableCell className="p-2">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback>{index + 1}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="font-medium">{customer.name}</div>
                                                <div className="text-sm text-muted-foreground">Total: PKR {customer.total.toLocaleString()}</div>
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {topCustomers.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground p-8">No customer sales data available.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-blue-600"><Users/>Active Customers</CardTitle>
                    <CardDescription>Total number of unique customers with transactions.</CardDescription>
                </CardHeader>
                 <CardContent>
                    <div className="text-4xl font-bold">{financialSummary?.activeCustomers || '...'}</div>
                 </CardContent>
            </Card>
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-blue-600"><TrendingUp/>Best Sale Day</CardTitle>
                    <CardDescription>The day with the highest recorded sales revenue.</CardDescription>
                </CardHeader>
                 <CardContent>
                    <div className="text-2xl font-bold">{financialSummary?.bestSaleDay.date ? format(new Date(financialSummary.bestSaleDay.date), 'dd-MMM-yyyy') : 'N/A'}</div>
                    <p className="text-muted-foreground">PKR {financialSummary?.bestSaleDay.amount.toLocaleString() || '0'}</p>
                 </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
