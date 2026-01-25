
'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { useDatabase } from '@/hooks/use-database';
import { startOfDay, endOfDay, isValid } from 'date-fns';
import { Fuel, Droplets, XCircle } from 'lucide-react';
import type { FuelType } from '@/lib/types';

interface SalesSummary {
    cashSales: number; // volume in liters
    creditSales: number; // volume in liters
}

type Report = {
    rows: {
        fuelType: string;
        cashSales: number;
        creditSales: number;
    }[];
    totals: SalesSummary;
};

export default function CashCreditSalesReportPage() {
    const { transactions, products, isLoaded, dateRange } = useDatabase();

    const reportData: Report = useMemo(() => {
        if (!isLoaded || !products.length) return { rows: [], totals: { cashSales: 0, creditSales: 0 } };

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
        
        const summaryByFuel = filteredTransactions.reduce((acc, tx) => {
            const fuelType = tx.fuelType as FuelType;
            if (!tx.volume || !mainProducts.includes(fuelType)) {
                return acc;
            }
    
            if (!acc[fuelType]) {
                acc[fuelType] = { cashSales: 0, creditSales: 0 };
            }
    
            if (tx.paymentMethod === 'Credit') {
                acc[fuelType].creditSales += tx.volume;
            } else {
                acc[fuelType].cashSales += tx.volume;
            }
    
            return acc;
        }, {} as Record<string, SalesSummary>);
    
        const rows = Object.keys(summaryByFuel).map(fuelType => ({
            fuelType,
            cashSales: summaryByFuel[fuelType].cashSales,
            creditSales: summaryByFuel[fuelType].creditSales,
        })).sort((a,b) => a.fuelType.localeCompare(b.fuelType));
        
        const totals = rows.reduce((acc, row) => {
            acc.cashSales += row.cashSales;
            acc.creditSales += row.creditSales;
            return acc;
        }, { cashSales: 0, creditSales: 0 });

        return { rows, totals };
    
    }, [isLoaded, transactions, products, dateRange]);
    
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
                    {isLoaded && reportData.rows.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fuel Type</TableHead>
                                    <TableHead className="text-right text-green-600">Cash Sales (Liters)</TableHead>
                                    <TableHead className="text-right text-blue-600">Credit Sales (Liters)</TableHead>
                                    <TableHead className="text-right">Total Sales (Liters)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reportData.rows.map(row => (
                                    <TableRow key={row.fuelType}>
                                        <TableCell className="font-medium flex items-center gap-2"><Fuel size={16}/> {row.fuelType}</TableCell>
                                        <TableCell className="text-right font-mono text-green-600">{row.cashSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right font-mono text-blue-600">{row.creditSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right font-mono font-bold">{(row.cashSales + row.creditSales).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                             <TableFooter>
                                <TableRow className="font-bold">
                                    <TableCell>Total</TableCell>
                                    <TableCell className="text-right font-mono text-green-600">{reportData.totals.cashSales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                                    <TableCell className="text-right font-mono text-blue-600">{reportData.totals.creditSales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                                    <TableCell className="text-right font-mono">{(reportData.totals.cashSales + reportData.totals.creditSales).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
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

