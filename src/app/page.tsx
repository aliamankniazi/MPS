'use client';

import { useMemo, useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, isValid, startOfDay, endOfDay, differenceInDays, startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DollarSign, Users, TrendingUp, TrendingDown, ListOrdered, ShoppingCart, Calendar as CalendarIcon, Receipt, Fuel, BarChart2, UserX, BookText, Medal } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';
import Link from 'next/link';
import { DateRangePicker } from '@/components/date-range-picker';
import type { DateRange, FuelType, Transaction, Purchase, Customer } from '@/lib/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from '@/lib/utils';

const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      aria-hidden="true"
      fill="currentColor"
      viewBox="0 0 448 512"
      {...props}
    >
      <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 .9c34.9 0 67.7 13.5 92.8 38.6 25.1 25.1 38.6 57.9 38.6 92.8 0 97.8-79.7 177.6-177.6 177.6-34.9 0-67.7-13.5-92.8-38.6s-38.6-57.9-38.6-92.8c0-97.8 79.7-177.6 177.6-177.6zm93.8 148.6c-3.3-1.5-19.8-9.8-23-11.5s-5.5-2.5-7.8 2.5c-2.3 5-8.7 11.5-10.7 13.8s-3.9 2.5-7.3 1c-3.3-1.5-14-5.2-26.6-16.5c-9.9-8.9-16.5-19.8-18.5-23s-2-5.5-.6-7.5c1.4-2 3-3.3 4.5-5.2s3-4.2 4.5-7.1c1.5-2.8.8-5.2-.4-6.8s-7.8-18.5-10.7-25.4c-2.8-6.8-5.6-5.8-7.8-5.8s-4.5-.4-6.8-.4-7.8 1.1-11.8 5.5c-4 4.4-15.2 14.8-15.2 36.1s15.5 41.9 17.5 44.8c2 2.8 30.4 46.4 73.8 65.4 10.8 4.8 19.3 7.6 25.9 9.8s11.1 1.5 15.2 1c4.8-.7 19.8-8.2 22.5-16.1s2.8-14.8 2-16.1c-.8-1.5-3.3-2.5-6.8-4z"></path>
    </svg>
);


export default function DashboardPage() {
  const { transactions, purchases, expenses, otherIncomes, stockAdjustments, products, customers, customerPayments, cashAdvances, fuelStock, isLoaded, dateRange, setDateRange } = useDatabase();
  const [currentTime, setCurrentTime] = useState('');

  const getPunjabiDate = (date: Date): { day: number; month: string; year: number } => {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11
    const day = date.getDate();
  
    // Based on Bikrami calendar for Punjab
    const monthData = [
      { name: 'ਚੇਤ', start: { m: 2, d: 14 } },
      { name: 'ਵਸਾਖ', start: { m: 3, d: 14 } },
      { name: 'ਜੇਠ', start: { m: 4, d: 15 } },
      { name: 'ਹਾੜ', start: { m: 5, d: 15 } },
      { name: 'ਸਾਵਣ', start: { m: 6, d: 16 } },
      { name: 'ਭਾਦੋਂ', start: { m: 7, d: 16 } },
      { name: 'Աਸੂ', start: { m: 8, d: 16 } },
      { name: 'ਕੱਤਕ', start: { m: 9, d: 16 } },
      { name: 'ਮੱਘਰ', start: { m: 10, d: 15 } },
      { name: 'ਪੋਹ', start: { m: 11, d: 14 } },
      { name: 'ਮਾਘ', start: { m: 0, d: 13 } },
      { name: 'ਫੱਗਣ', start: { m: 1, d: 12 } }
    ];

    let bikramiYear = year + 57;
    let desiDay = 0;
    let desiMonth = '';

    let gregorianYearForBikramiStart = year;
    if (month < 2 || (month === 2 && day < 14)) {
        gregorianYearForBikramiStart--;
        bikramiYear--; 
    }

    const monthStarts = monthData.map(m => ({
        ...m,
        startDate: new Date(m.start.m >= 2 ? gregorianYearForBikramiStart : gregorianYearForBikramiStart + 1, m.start.m, m.start.d)
    })).sort((a,b) => a.startDate.getTime() - b.startDate.getTime());
    
    for (let i = monthStarts.length - 1; i >= 0; i--) {
        if (date >= monthStarts[i].startDate) {
            desiMonth = monthStarts[i].name;
            desiDay = differenceInDays(date, monthStarts[i].startDate) + 1;
            break;
        }
    }
    
    return { day: desiDay, month: desiMonth, year: bikramiYear };
  };
    
  useEffect(() => {
    const timer = setInterval(() => {
        const now = new Date();
        const gregorianDate = now.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        const islamicDate = new Intl.DateTimeFormat('ur-PK-u-ca-islamic', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(now);
        
        const desiDate = getPunjabiDate(now);
        const punjabiDate = `${desiDate.day} ${desiDate.month} ${desiDate.year}`;

        const time = now.toLocaleString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        });

        setCurrentTime(`${gregorianDate} | ${islamicDate.replace(' AH', '')} | ${punjabiDate} | ${time}`);
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

    const { transactions, purchases, expenses, otherIncomes, stockAdjustments: filteredStockAdjustments } = filteredData;

    const totalFuelRevenue = transactions.reduce((sum, tx) => sum + tx.totalAmount, 0);
    const totalOtherIncomeValue = otherIncomes.reduce((sum, oi) => sum + oi.amount, 0);
    const totalRevenue = totalFuelRevenue + totalOtherIncomeValue;
    
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
    
    const totalSurplus = filteredStockAdjustments
      .filter(adj => adj.adjustment > 0)
      .reduce((sum, adj) => sum + adj.value, 0);

    const totalShortage = filteredStockAdjustments
      .filter(adj => adj.adjustment < 0)
      .reduce((sum, adj) => sum + adj.value, 0);
      
    const netStockAdjustment = totalSurplus - totalShortage;


    return {
      totalRevenue,
      totalPurchases: totalCostOfGoods,
      totalExpenses,
      totalOtherIncome: totalOtherIncomeValue,
      netProfit,
      activeCustomers,
      bestSaleDay,
      netStockAdjustment,
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
      const salesForProduct = filteredData.transactions.filter(t => (t.fuelType === product.name || t.product === product.name));
      const allPurchasesForProduct = purchases.filter(p => p.fuelType === product.name);
  
      const lastSale = [...salesForProduct].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      const lastPurchase = [...allPurchasesForProduct].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  
      const lastPurchaseRate = lastPurchase && lastPurchase.volume > 0 ? lastPurchase.totalCost / lastPurchase.volume : 0;
      const lastSaleRate = lastSale ? lastSale.pricePerLitre : product.price;
  
      const profitPerUnit = lastSaleRate > 0 && lastPurchaseRate > 0 ? lastSaleRate - lastPurchaseRate : 0;
  
      const totalProfit = salesForProduct
        .filter(t => t.volume && t.volume > 0 && t.timestamp && isValid(new Date(t.timestamp)))
        .reduce((sum, t) => {
          const saleTime = new Date(t.timestamp).getTime();
          
          let latestPurchase: Purchase | null = null;
          let latestPurchaseTime = 0;
      
          for (const p of allPurchasesForProduct) {
              if (p.timestamp && isValid(new Date(p.timestamp))) {
                  const purchaseTime = new Date(p.timestamp).getTime();
                  if (purchaseTime <= saleTime && purchaseTime > latestPurchaseTime) {
                      latestPurchaseTime = purchaseTime;
                      latestPurchase = p;
                  }
              }
          }
          
          let transactionProfit = 0;
          if (latestPurchase && latestPurchase.volume > 0 && typeof t.pricePerLitre === 'number') {
              const costPerLitre = latestPurchase.totalCost / latestPurchase.volume;
              transactionProfit = (t.pricePerLitre - costPerLitre) * t.volume;
          }
          return sum + transactionProfit;
        }, 0);
  
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
  }, [isLoaded, products, fuelStock, filteredData, purchases]);

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

  const blacklistedCustomersWithBalance = useMemo(() => {
    if (!isLoaded || !customers || !transactions || !customerPayments || !cashAdvances) return [];
    return customers
      .filter(c => c.isBlacklisted)
      .map(customer => {
        const openingBalance = customer.openingBalance || 0;
        const totalSales = transactions.filter(tx => tx.customerId === customer.id).reduce((sum, tx) => sum + tx.totalAmount, 0);
        const totalCashAdvances = cashAdvances.filter(ca => ca.customerId === customer.id).reduce((sum, ca) => sum + ca.amount, 0);
        const totalPayments = customerPayments.filter(p => p.customerId === customer.id).reduce((sum, p) => sum + p.amount, 0);
        const balance = openingBalance + totalSales + totalCashAdvances - totalPayments;
        return {
          ...customer,
          balance,
        };
      });
  }, [isLoaded, customers, transactions, customerPayments, cashAdvances]);

  const dailyProductSales = useMemo(() => {
    if (!isLoaded) return {};

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const currentMonthTransactions = transactions.filter(tx => {
        const txDate = new Date(tx.timestamp);
        return isValid(txDate) && txDate >= monthStart && txDate <= monthEnd;
    });
    
    const salesByDayAndProduct = currentMonthTransactions.reduce((acc, tx) => {
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
  }, [isLoaded, transactions, products]);

    const sortedDailySalesKeys = useMemo(() => {
        return Object.keys(dailyProductSales).sort((a,b) => new Date(b).getTime() - new Date(a).getTime())
    }, [dailyProductSales]);
  
    const formatPhoneNumberForWhatsApp = (phone: string | number | undefined) => {
        if (!phone) return '';
        return String(phone).replace(/[^0-9]/g, '');
    }

    const generateWhatsAppMessage = (customer: {name: string, balance: number}) => {
        const message = `Dear ${customer.name}, this is a friendly reminder that your outstanding balance is PKR ${customer.balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}. Please clear it at your earliest convenience. Thank you, Mianwali Petroleum Service.`;
        return encodeURIComponent(message);
    }
    
    const getMedal = (index: number) => {
        switch (index) {
        case 0:
            return { name: 'Gold', color: 'text-[hsl(var(--chart-3))]' };
        case 1:
            return { name: 'Silver', color: 'text-muted-foreground' };
        case 2:
            return { name: 'Bronze', color: 'text-[hsl(var(--chart-4))]' };
        default:
            return null;
        }
    };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
            <div className="flex items-baseline gap-4 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight text-primary">Dashboard</h1>
              <p className="text-xl font-medium text-muted-foreground">{currentTime}</p>
            </div>
            <p className="text-muted-foreground">A quick overview of your business performance.</p>
        </div>
      </div>

       <div className="grid gap-6 lg:grid-cols-5">
         <div className="lg:col-span-3 space-y-6">
          {/* Stat Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-primary">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-[hsl(var(--chart-2))]">PKR {financialSummary?.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '...'}</div>
                <p className="text-xs text-muted-foreground">For selected period</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-primary">Total Purchases</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-[hsl(var(--chart-4))]">PKR {financialSummary?.totalPurchases.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '...'}</div>
                <p className="text-xs text-muted-foreground">Total cost of goods</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-primary">Total Expenses</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">PKR {financialSummary?.totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '...'}</div>
                <p className="text-xs text-muted-foreground">For selected period</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-primary">
                    {financialSummary && financialSummary.netStockAdjustment >= 0 ? 'Stock Surplus' : 'Stock Loss'}
                </CardTitle>
                {financialSummary && financialSummary.netStockAdjustment >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                )}
              </CardHeader>
              <CardContent>
                <div className={cn(
                    "text-2xl font-bold",
                    financialSummary && financialSummary.netStockAdjustment >= 0 ? 'text-[hsl(var(--chart-2))]' : 'text-destructive'
                )}>
                    PKR {financialSummary ? Math.abs(financialSummary.netStockAdjustment).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '...'}
                </div>
                <p className="text-xs text-muted-foreground">Net value of stock adjustments</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-primary">Other Income</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-[hsl(var(--chart-3))]">PKR {financialSummary?.totalOtherIncome.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '...'}</div>
                <p className="text-xs text-muted-foreground">From other sources</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-primary">Net Profit</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${financialSummary && financialSummary.netProfit < 0 ? 'text-destructive' : 'text-[hsl(var(--chart-2))]'}`}>PKR {financialSummary?.netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '...'}</div>
                <p className="text-xs text-muted-foreground">After all costs & expenses</p>
              </CardContent>
            </Card>
          </div>
           <Card>
            <CardHeader>
              <CardTitle className="text-primary">Sales Chart</CardTitle>
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
                        <CardTitle className="text-base font-medium flex items-center gap-2 text-primary"><Fuel size={16} />{stat.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                        <div className="flex justify-between">
                            <span className="text-[hsl(var(--chart-1))]">Stock Available</span>
                            <span className="font-mono font-semibold">{stat.stock.toLocaleString(undefined, { maximumFractionDigits: 2 })} Ltr</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[hsl(var(--chart-2))]">Last Sale Rate</span>
                            <span className="font-mono font-semibold">PKR {stat.lastSaleRate.toFixed(2)}</span>
                        </div>
                         <div className="flex justify-between">
                            <span className="text-[hsl(var(--chart-3))]">Last Purchase Rate</span>
                            <span className="font-mono font-semibold">PKR {stat.lastPurchaseRate.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[hsl(var(--chart-4))]">Profit / Unit</span>
                            <span className="font-mono font-semibold">PKR {stat.profitPerUnit.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold">
                            <span className="text-[hsl(var(--chart-5))]">Total Profit</span>
                            <span className="font-mono">PKR {stat.totalProfit.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[hsl(var(--chart-1))]">Last Sale</span>
                            <span className="font-mono">{stat.lastSaleDate ? format(stat.lastSaleDate, 'dd MMM, yy') : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[hsl(var(--chart-2))]">Last Purchase</span>
                            <span className="font-mono">{stat.lastPurchaseDate ? format(stat.lastPurchaseDate, 'dd MMM, yy') : 'N/A'}</span>
                        </div>
                    </CardContent>
                </Card>
            ))}
            </div>
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-primary"><Users/>Active Customers</CardTitle>
                    <CardDescription>Total number of unique customers with transactions.</CardDescription>
                </CardHeader>
                 <CardContent>
                    <div className="text-4xl font-bold">{financialSummary?.activeCustomers || '...'}</div>
                 </CardContent>
            </Card>
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-primary"><TrendingUp/>Best Sale Day</CardTitle>
                    <CardDescription>The day with the highest recorded sales revenue.</CardDescription>
                </CardHeader>
                 <CardContent>
                    <div className="text-2xl font-bold">{financialSummary?.bestSaleDay.date ? format(new Date(financialSummary.bestSaleDay.date), 'dd-MMM-yyyy') : 'N/A'}</div>
                    <p className="text-muted-foreground">PKR {financialSummary?.bestSaleDay.amount.toLocaleString() || '0'}</p>
                 </CardContent>
            </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center gap-2 flex-wrap justify-end">
                <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                <Button asChild variant="outline">
                    <Link href="/reports">View All Reports</Link>
                </Button>
                <Button asChild>
                    <Link href="/sales">New Sale</Link>
                </Button>
            </div>
            <Card className="border-destructive">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive"><UserX/> Blacklisted And Defaulter Customers</CardTitle>
                    <CardDescription>Customers who are currently marked as blacklisted.</CardDescription>
                </CardHeader>
                <CardContent>
                    {blacklistedCustomersWithBalance.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Customer</TableHead>
                                    <TableHead className="text-right">Balance</TableHead>
                                    <TableHead className="text-center">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {blacklistedCustomersWithBalance.map((customer) => (
                                    <TableRow key={customer.id}>
                                        <TableCell>
                                            <div className="font-medium flex items-center gap-2">
                                                {customer.name}
                                                {customer.contact && (
                                                    <a href={`https://wa.me/${formatPhoneNumberForWhatsApp(customer.contact)}?text=${generateWhatsAppMessage(customer)}`} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-600" title={`Message ${customer.name} on WhatsApp`}>
                                                        <WhatsAppIcon className="w-4 h-4" />
                                                    </a>
                                                )}
                                            </div>
                                            <div className="text-sm text-muted-foreground">{customer.contact}</div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-destructive">
                                            {customer.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Button asChild variant="ghost" size="icon" title="View Ledger">
                                                <Link href={`/customers/${customer.id}/ledger`}>
                                                    <BookText className="w-4 h-4" />
                                                </Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <p className="text-center p-4 text-muted-foreground">No blacklisted customers with a balance.</p>
                    )}
                </CardContent>
            </Card>
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-primary"><BarChart2 /> Daily Product Sales</CardTitle>
                    <CardDescription>A breakdown of sales by product for each day of the current month.</CardDescription>
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
                            No sales data available for the current month.
                        </div>
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-primary"><ListOrdered /> Top 5 Customers</CardTitle>
                    <CardDescription>Based on total sales in the selected period.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableBody>
                            {topCustomers.map((customer, index) => {
                                const medal = getMedal(index);
                                return (
                                <TableRow key={customer.id}>
                                    <TableCell className="p-2">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback className={cn(
                                                    index === 0 && 'bg-[hsl(var(--chart-3))] text-yellow-950',
                                                    index === 1 && 'bg-muted text-muted-foreground',
                                                    index === 2 && 'bg-[hsl(var(--chart-4))] text-orange-950',
                                                )}>{index + 1}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className={cn("font-medium", 
                                                    index === 0 && 'text-[hsl(var(--chart-3))]',
                                                    index === 1 && 'text-muted-foreground',
                                                    index === 2 && 'text-[hsl(var(--chart-4))]',
                                                )}>{customer.name}</div>
                                                <div className={cn("text-sm", 
                                                    index === 0 && 'text-[hsl(var(--chart-3))]',
                                                    index === 1 && 'text-muted-foreground',
                                                    index === 2 && 'text-[hsl(var(--chart-4))]',
                                                )}>Total: PKR {customer.total.toLocaleString()}</div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="p-2 text-right">
                                        {medal && (
                                            <div className={cn("flex items-center justify-end gap-2 font-semibold", medal.color)}>
                                                <Medal className="h-5 w-5" />
                                                <span>{medal.name}</span>
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )})}
                            {topCustomers.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground p-8">No customer sales data available.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
