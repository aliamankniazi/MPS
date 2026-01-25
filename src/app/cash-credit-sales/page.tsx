
'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDatabase } from '@/hooks/use-database';
import { startOfDay, endOfDay, isValid, format } from 'date-fns';
import { Fuel, Droplets, XCircle } from 'lucide-react';
import type { FuelType } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface SalesSummary {
    cashSales: number; // volume in liters
    creditSales: number; // volume in liters
}

type DailyReport = {
    rows: {
        fuelType: string;
        cashSales: number;
        creditSales: number;
    }[];
    totals: SalesSummary;
};

export default function CashCreditSalesReportPage() {
    const { transactions, products, isLoaded, dateRange } = useDatabase();

    const reportData: Record<string, DailyReport> = useMemo(() => {
        if (!isLoaded || !products.length) return {};

        const mainProducts = products.filter(p => p.category === 'Main Product').map(p => p.name);

        let filteredTransactions = transactions;
        if (dateRange?.from) {
            const from = startOfDay(dateRange.from);
            const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);
            filteredTransactions = transactions.filter(tx => {
                const txDate = new Date(tx.timestamp);
                return isValid(txDate) && txDate >= from && txDate <= to;
            });
        }
        
        const summaryByDateAndFuel = filteredTransactions.reduce((acc, tx) => {
            const fuelType = tx.fuelType as FuelType;
            if (!tx.volume || !mainProducts.includes(fuelType) || !isValid(new Date(tx.timestamp))) {
                return acc;
            }
    
            const dateKey = format(new Date(tx.timestamp), 'dd-MMM-yyyy');
            
            if (!acc[dateKey]) {
                acc[dateKey] = {};
            }
            if (!acc[dateKey][fuelType]) {
                acc[dateKey][fuelType] = { cashSales: 0, creditSales: 0 };
            }
    
            if (tx.paymentMethod === 'Credit') {
                acc[dateKey][fuelType].creditSales += tx.volume;
            } else {
                acc[dateKey][fuelType].cashSales += tx.volume;
            }
    
            return acc;
        }, {} as Record<string, Record<string, SalesSummary>>);
    
        const finalReportData: Record<string, DailyReport> = {};
    
        Object.keys(summaryByDateAndFuel).forEach(dateKey => {
            const dayFuelData = summaryByDateAndFuel[dateKey];
            const rows = Object.keys(dayFuelData).map(fuelType => ({
                fuelType,
                cashSales: dayFuelData[fuelType].cashSales,
                creditSales: dayFuelData[fuelType].creditSales,
            })).sort((a,b) => a.fuelType.localeCompare(b.fuelType));
            
            const totals = rows.reduce((acc, row) => {
                acc.cashSales += row.cashSales;
                acc.creditSales += row.creditSales;
                return acc;
            }, { cashSales: 0, creditSales: 0 });
    
            finalReportData[dateKey] = { rows, totals };
        });
    
        return finalReportData;
    
    }, [isLoaded, transactions, products, dateRange]);
    
    const sortedDateKeys = useMemo(() => {
        return Object.keys(reportData).sort((a,b) => new Date(b).getTime() - new Date(a).getTime());
    }, [reportData]);
    
    return (
        <div className="p-4 md:p-8">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Droplets /> Cash & Credit Sales Report (Volume in Liters)
                    </CardTitle>
                    <CardDescription>
                        A breakdown of fuel sales by volume (in liters) for cash and credit transactions for the selected period, grouped by date.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoaded && sortedDateKeys.length > 0 ? (
                        <Accordion type="multiple" className="w-full space-y-2" defaultValue={sortedDateKeys}>
                           {sortedDateKeys.map(dateKey => {
                               const dayData = reportData[dateKey];
                               return (
                                <AccordionItem value={dateKey} key={dateKey} className="border-b-0">
                                    <Card>
                                        <AccordionTrigger className="p-4 hover:bg-muted/50 rounded-t-lg">
                                            <div className="flex justify-between w-full pr-4">
                                                <span className="font-semibold text-lg">{dateKey}</span>
                                                <div className="flex gap-4 text-sm text-muted-foreground">
                                                    <span>Cash: <span className="font-mono text-foreground font-semibold">{dayData.totals.cashSales.toLocaleString(undefined, {minimumFractionDigits: 2})} L</span></span>
                                                    <span>Credit: <span className="font-mono text-foreground font-semibold">{dayData.totals.creditSales.toLocaleString(undefined, {minimumFractionDigits: 2})} L</span></span>
                                                    <span>Total: <span className="font-mono text-foreground font-bold">{ (dayData.totals.cashSales + dayData.totals.creditSales).toLocaleString(undefined, {minimumFractionDigits: 2})} L</span></span>
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="p-0">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Fuel Type</TableHead>
                                                        <TableHead className="text-right">Cash Sales (Liters)</TableHead>
                                                        <TableHead className="text-right">Credit Sales (Liters)</TableHead>
                                                        <TableHead className="text-right">Total Sales (Liters)</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {dayData.rows.map(row => (
                                                        <TableRow key={row.fuelType}>
                                                            <TableCell className="font-medium flex items-center gap-2"><Fuel size={16}/> {row.fuelType}</TableCell>
                                                            <TableCell className="text-right font-mono">{row.cashSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                            <TableCell className="text-right font-mono">{row.creditSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                            <TableCell className="text-right font-mono font-bold">{(row.cashSales + row.creditSales).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </AccordionContent>
                                    </Card>
                                </AccordionItem>
                               )
                           })}
                        </Accordion>
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
                            <XCircle className="w-16 h-16" />
                            <h3 className="text-xl font-semibold">
                                {isLoaded ? 'No Sales Data' : 'Loading Report...'}
                            </h3>
                            <p>{isLoaded ? 'There are no sales transactions for the selected period.' : 'Please wait while the data is being loaded.'}</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

