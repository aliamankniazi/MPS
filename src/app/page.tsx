

'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, isValid } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DollarSign, Users, TrendingUp, ArrowRight, ListOrdered } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';
import Link from 'next/link';

export default function DashboardPage() {
  const { transactions, purchases, expenses, otherIncomes, isLoaded } = useDatabase();

  const financialSummary = useMemo(() => {
    if (!isLoaded) return null;

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


    return {
      totalRevenue,
      netProfit,
      activeCustomers,
      bestSaleDay
    };
  }, [isLoaded, transactions, purchases, expenses, otherIncomes]);

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

    const customerTotals = transactions.reduce((acc, tx) => {
        if (tx.customerId && tx.customerName) {
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

  }, [isLoaded, transactions]);
  
  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">A quick overview of your business performance.</p>
        </div>
        <div className="flex items-center gap-2">
            <Button asChild variant="outline">
                <Link href="/sales">Pick a date range</Link>
            </Button>
            <Button asChild>
                <Link href="/sales">New Sale</Link>
            </Button>
        </div>
      </div>
      
      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">PKR {financialSummary?.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '...'}</div>
            <p className="text-xs text-muted-foreground">For selected period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${financialSummary && financialSummary.netProfit < 0 ? 'text-destructive' : ''}`}>PKR {financialSummary?.netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '...'}</div>
            <p className="text-xs text-muted-foreground">After all costs & expenses</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Best Sale Day</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{financialSummary?.bestSaleDay.date ? format(new Date(financialSummary.bestSaleDay.date), 'PP') : 'N/A'}</div>
            <p className="text-xs text-muted-foreground">PKR {financialSummary?.bestSaleDay.amount.toLocaleString() || '0'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{financialSummary?.activeCustomers || '...'}</div>
            <p className="text-xs text-muted-foreground">Customers with recorded sales</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><ListOrdered /> Top 5 Customers</CardTitle>
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
                                <TableCell className="p-2 text-right">
                                    <Button variant="ghost" size="icon" asChild>
                                        <Link href={`/customers/${customer.id}/ledger`}>
                                            <ArrowRight className="w-4 h-4" />
                                        </Link>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                         {topCustomers.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground p-8">No customer sales data available.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Sales Chart</CardTitle>
            <CardDescription>A look at your sales revenue based on the date filter.</CardDescription>
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
        
      </div>
    </div>
  );
}
