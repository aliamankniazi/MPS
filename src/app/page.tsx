
'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Users, TrendingUp, TrendingDown, Package, ListOrdered, History, Fuel } from 'lucide-react';
import { useTransactions } from '@/hooks/use-transactions';
import { usePurchases } from '@/hooks/use-purchases';
import { useExpenses } from '@/hooks/use-expenses';
import { useCustomers } from '@/hooks/use-customers';
import { useCustomerBalance } from '@/hooks/use-customer-balance';
import { useOtherIncomes } from '@/hooks/use-other-incomes';
import { useFuelStock } from '@/hooks/use-fuel-stock';
import Link from 'next/link';

export default function DashboardPage() {
  const { transactions, isLoaded: transactionsLoaded } = useTransactions();
  const { purchases, isLoaded: purchasesLoaded } = usePurchases();
  const { expenses, isLoaded: expensesLoaded } = useExpenses();
  const { otherIncomes, isLoaded: otherIncomesLoaded } = useOtherIncomes();
  const { customers, isLoaded: customersLoaded } = useCustomers();
  const { fuelStock, isLoaded: stockLoaded } = useFuelStock();

  const isLoaded = transactionsLoaded && purchasesLoaded && expensesLoaded && customersLoaded && otherIncomesLoaded && stockLoaded;

  const financialSummary = useMemo(() => {
    if (!isLoaded) return null;

    const totalRevenue = transactions.reduce((sum, tx) => sum + tx.totalAmount, 0) + otherIncomes.reduce((sum, oi) => sum + oi.amount, 0);
    const totalCostOfGoods = purchases.reduce((sum, p) => sum + p.totalCost, 0);
    const totalExpenses = expenses.reduce((sum, ex) => sum + ex.amount, 0);
    const netProfit = totalRevenue - totalCostOfGoods - totalExpenses;
    const totalIncome = otherIncomes.reduce((sum, oi) => sum + oi.amount, 0);
    const activeCustomers = new Set(transactions.map(tx => tx.customerId).filter(Boolean)).size;

    return {
      netRevenue: totalRevenue,
      netProfit,
      totalIncome,
      activeCustomers,
    };
  }, [isLoaded, transactions, purchases, expenses, otherIncomes]);

  const salesChartData = useMemo(() => {
    if (!isLoaded) return [];
    
    const endDate = new Date();
    const startDate = subDays(endDate, 30);
    
    const dailySales = transactions.reduce((acc, tx) => {
        const date = format(new Date(tx.timestamp), 'yyyy-MM-dd');
        acc[date] = (acc[date] || 0) + tx.totalAmount;
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
  
  const recentActivity = useMemo(() => {
    if (!isLoaded) return [];
    const sales = transactions.map(tx => ({ type: 'Sale' as const, ...tx }));
    const allActivity = [...sales].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return allActivity.slice(0, 5);
  }, [isLoaded, transactions]);


  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">A quick overview of the business performance.</p>
        </div>
        <div className="flex items-center gap-2">
            <Button asChild>
                <Link href="/">New Sale</Link>
            </Button>
        </div>
      </div>
      
      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">PKR {financialSummary?.netRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '...'}</div>
            <p className="text-xs text-muted-foreground">Total sales income</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${financialSummary && financialSummary.netProfit < 0 ? 'text-destructive' : ''}`}>PKR {financialSummary?.netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '...'}</div>
            <p className="text-xs text-muted-foreground">After all costs and expenses</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Other Income</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">PKR {financialSummary?.totalIncome.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '...'}</div>
            <p className="text-xs text-muted-foreground">From non-fuel sources</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{financialSummary?.activeCustomers || '...'}</div>
            <p className="text-xs text-muted-foreground">Customers with recent transactions</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Sales Chart</CardTitle>
            <CardDescription>A look at your sales performance over the last 30 days.</CardDescription>
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
        
        <Card className="lg:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><ListOrdered /> Top 5 Customers</CardTitle>
                <CardDescription>Based on total value in the whole period.</CardDescription>
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
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="p-2 text-right font-mono">PKR {customer.total.toLocaleString()}</TableCell>
                            </TableRow>
                        ))}
                         {topCustomers.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground p-8">No customer sales data available.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>

       <div className="grid gap-6 lg:grid-cols-5">
         <Card className="lg:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Package /> Product Stock</CardTitle>
                <CardDescription>A live glance of current inventory levels.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableBody>
                         <TableRow>
                            <TableCell className="font-medium flex items-center gap-2"><Fuel className="text-primary"/> Unleaded</TableCell>
                            <TableCell className="text-right font-mono">{stockLoaded ? `${fuelStock.Unleaded.toLocaleString()} L` : 'Loading...'}</TableCell>
                         </TableRow>
                          <TableRow>
                            <TableCell className="font-medium flex items-center gap-2"><Fuel className="text-primary"/> Premium</TableCell>
                            <TableCell className="text-right font-mono">{stockLoaded ? `${fuelStock.Premium.toLocaleString()} L` : 'Loading...'}</TableCell>
                         </TableRow>
                          <TableRow>
                            <TableCell className="font-medium flex items-center gap-2"><Fuel className="text-primary"/> Diesel</TableCell>
                            <TableCell className="text-right font-mono">{stockLoaded ? `${fuelStock.Diesel.toLocaleString()} L` : 'Loading...'}</TableCell>
                         </TableRow>
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
        
        <Card className="lg:col-span-3">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><History /> Recent Activity</CardTitle>
                <CardDescription>A feed of your latest transactions for all sales.</CardDescription>
            </CardHeader>
            <CardContent>
                 <Table>
                    <TableBody>
                        {recentActivity.map((activity) => (
                             <TableRow key={activity.id}>
                                <TableCell className="p-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full bg-opacity-10 ${activity.type === 'Sale' ? 'bg-green-500 text-green-500' : 'bg-blue-500 text-blue-500'}`}>
                                            <DollarSign className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="font-medium">{activity.type}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {activity.customerName || 'Walk-in'} - {activity.volume.toFixed(2)}L of {activity.fuelType}
                                            </div>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="p-3 text-right">
                                    <div className={`font-semibold ${activity.type === 'Sale' ? 'text-green-600' : 'text-blue-600'}`}>
                                        PKR {activity.totalAmount.toLocaleString()}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {format(new Date(activity.timestamp), 'PP pp')}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                         {recentActivity.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground p-8">No recent activity.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
       </div>
    </div>
  );
}
