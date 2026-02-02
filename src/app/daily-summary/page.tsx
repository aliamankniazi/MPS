
'use client';

import { useMemo } from 'react';
import { useDatabase } from '@/hooks/use-database';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { startOfDay, endOfDay, isValid, format, eachDayOfInterval } from 'date-fns';
import { DateRangePicker } from '@/components/date-range-picker';
import { BarChart2, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import type { Purchase } from '@/lib/types';

interface DailySummary {
    date: string;
    totalRevenue: number;
    costOfGoodsSold: number;
    grossProfit: number;
    otherIncome: number;
    totalExpenses: number;
    netProfit: number;
}

export default function DailySummaryPage() {
    const { 
        transactions, 
        purchases, 
        expenses, 
        otherIncomes,
        products,
        isLoaded, 
        dateRange, 
        setDateRange 
    } = useDatabase();

    const dailySummaries: DailySummary[] = useMemo(() => {
        if (!isLoaded || !dateRange || !dateRange.from || !dateRange.to) return [];

        const startDate = startOfDay(dateRange.from);
        const endDate = endOfDay(dateRange.to);
        const intervalDays = eachDayOfInterval({ start: startDate, end: endDate });

        return intervalDays.map(day => {
            const from = startOfDay(day);
            const to = endOfDay(day);

            const filterByDay = (items: any[]) => items.filter(item => {
                const itemDate = new Date(item.timestamp);
                return isValid(itemDate) && itemDate >= from && itemDate <= to;
            });

            const dayTransactions = filterByDay(transactions);
            const dayOtherIncomes = filterByDay(otherIncomes);
            const dayExpenses = filterByDay(expenses);
            
            const costOfGoodsSold = dayTransactions.reduce((totalCost, sale) => {
                const productInfo = products.find(p => p.name === (sale.product || sale.fuelType));
                if (!productInfo) return totalCost;

                if (productInfo.category === 'Main Product') {
                    if (!sale.timestamp || !isValid(new Date(sale.timestamp)) || !sale.volume || sale.volume <= 0) return totalCost;
                    
                    const saleTime = new Date(sale.timestamp).getTime();
                    let latestPurchase: Purchase | null = null;
                    let latestPurchaseTime = 0;

                    for (const p of purchases) { // Use all purchases for history
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
                } else {
                    const quantity = sale.volume || 0;
                    const purchasePrice = productInfo.purchasePrice || 0;
                    return totalCost + (purchasePrice * quantity);
                }
            }, 0);

            const totalSalesRevenue = dayTransactions.reduce((sum, tx) => sum + tx.totalAmount, 0);
            const totalOtherIncome = dayOtherIncomes.reduce((sum, oi) => sum + oi.amount, 0);
            const totalRevenue = totalSalesRevenue + totalOtherIncome;

            const grossProfit = totalRevenue - costOfGoodsSold;
            const totalExpenses = dayExpenses.reduce((sum, ex) => sum + ex.amount, 0);
            const netProfit = grossProfit - totalExpenses;

            return {
                date: format(day, 'yyyy-MM-dd'),
                totalRevenue,
                costOfGoodsSold,
                grossProfit,
                otherIncome: totalOtherIncome,
                totalExpenses,
                netProfit,
            };
        }).reverse(); // Show most recent days first

    }, [isLoaded, transactions, purchases, expenses, otherIncomes, products, dateRange]);

    const handleExportExcel = () => {
        const dataToExport = dailySummaries.map(summary => ({
            'Date': format(new Date(summary.date), 'dd-MMM-yyyy'),
            'Total Revenue (PKR)': summary.totalRevenue.toFixed(2),
            'Cost of Goods Sold (PKR)': summary.costOfGoodsSold.toFixed(2),
            'Gross Profit (PKR)': summary.grossProfit.toFixed(2),
            'Other Income (PKR)': summary.otherIncome.toFixed(2),
            'Total Expenses (PKR)': summary.totalExpenses.toFixed(2),
            'Net Profit (PKR)': summary.netProfit.toFixed(2),
        }));
        
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'DailySummaryReport');
        XLSX.writeFile(workbook, 'DailySummaryReport.xlsx');
    };

    return (
        <div className="p-4 md:p-8">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <BarChart2 /> Daily Business Summary
                            </CardTitle>
                            <CardDescription>
                                A day-by-day summary of sales, purchases, expenses, and profit for the selected period.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                           <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                           <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4"/> Print</Button>
                           <Button variant="outline" onClick={handleExportExcel}><Download className="mr-2 h-4 w-4"/> Excel</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Total Revenue</TableHead>
                                <TableHead className="text-right">COGS</TableHead>
                                <TableHead className="text-right">Gross Profit</TableHead>
                                <TableHead className="text-right">Other Income</TableHead>
                                <TableHead className="text-right">Total Expenses</TableHead>
                                <TableHead className="text-right">Net Profit</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoaded && dailySummaries.length > 0 ? dailySummaries.map(summary => (
                                <TableRow key={summary.date}>
                                    <TableCell className="font-medium">{format(new Date(summary.date), 'dd-MMM-yyyy')}</TableCell>
                                    <TableCell className="text-right font-mono">{summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-right font-mono">{summary.costOfGoodsSold.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell className={`text-right font-mono font-semibold ${summary.grossProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                                        {summary.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-blue-600">
                                        {summary.otherIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-destructive">{summary.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell className={`text-right font-mono font-bold ${summary.netProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                                        {summary.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center h-24">
                                        {isLoaded ? 'No data for selected period.' : 'Loading...'}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
