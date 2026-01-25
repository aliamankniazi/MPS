'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDatabase } from '@/hooks/use-database';
import { startOfDay, endOfDay, isValid } from 'date-fns';
import { Fuel, Droplets } from 'lucide-react';
import type { FuelType } from '@/lib/types';

interface SalesSummary {
    cashSales: number; // volume in liters
    creditSales: number; // volume in liters
}

export default function CashCreditSalesReportPage() {
    const { transactions, products, isLoaded, dateRange } = useDatabase();

    const reportData = useMemo(() => {
        if (!isLoaded || !products.length) return [];

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
        
        const summaryByFuelType = mainProducts.reduce((acc, fuelType) => {
            acc[fuelType] = {
                cashSales: 0,
                creditSales: 0,
            };
            return acc;
        }, {} as Record<string, SalesSummary>);

        filteredTransactions.forEach(tx => {
            const fuelType = tx.fuelType as FuelType;
            if (tx.volume && mainProducts.includes(fuelType)) {
                 if (tx.paymentMethod === 'Credit') {
                    summaryByFuelType[fuelType].creditSales += tx.volume;
                } else {
                    summaryByFuelType[fuelType].cashSales += tx.volume;
                }
            }
        });

        return Object.entries(summaryByFuelType).map(([fuelType, summary]) => ({
            fuelType,
            ...summary,
        }));

    }, [isLoaded, transactions, products, dateRange]);
    
    const totals = useMemo(() => {
        return reportData.reduce((acc, row) => {
            acc.cashSales += row.cashSales;
            acc.creditSales += row.creditSales;
            return acc;
        }, { cashSales: 0, creditSales: 0 });
    }, [reportData]);

    return (
        <div className="p-4 md:p-8">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Droplets /> Cash & Credit Sales Report (Volume in Liters)
                    </CardTitle>
                    <CardDescription>
                        A breakdown of fuel sales by volume (in liters) for cash and credit transactions for the selected period.
                    </CardDescription>
                </CardHeader>
                <CardContent>
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
                            {isLoaded ? reportData.map(row => (
                                <TableRow key={row.fuelType}>
                                    <TableCell className="font-medium flex items-center gap-2"><Fuel size={16}/> {row.fuelType}</TableCell>
                                    <TableCell className="text-right font-mono">{row.cashSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-right font-mono">{row.creditSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-right font-mono font-bold">{(row.cashSales + row.creditSales).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">Loading report...</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                         {isLoaded && (
                            <TableRow className="font-bold bg-muted/50">
                                <TableCell>Total</TableCell>
                                <TableCell className="text-right font-mono">{totals.cashSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right font-mono">{totals.creditSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right font-mono text-lg">{(totals.cashSales + totals.creditSales).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                        )}
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
