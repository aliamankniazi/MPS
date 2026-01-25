
'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDatabase } from '@/hooks/use-database';
import { startOfDay, endOfDay, isValid, format } from 'date-fns';
import { Fuel, Droplets, XCircle } from 'lucide-react';
import type { FuelType } from '@/lib/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface SalesSummary {
    cashSalesVolume: number;
    creditSalesVolume: number;
    cashSalesAmount: number;
    creditSalesAmount: number;
}

type GroupedReport = {
    [dateKey: string]: {
        rows: {
            fuelType: string;
            cashSalesVolume: number;
            creditSalesVolume: number;
        }[];
        totals: SalesSummary;
    }
};

export default function CashCreditSalesReportPage() {
    const { transactions, products, isLoaded, dateRange } = useDatabase();

    const groupedReportData: GroupedReport = useMemo(() => {
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
            const date = new Date(tx.timestamp);
            if (!isValid(date)) return acc;

            const dateKey = format(date, 'yyyy-MM-dd');
            const fuelType = tx.fuelType as FuelType;

            if (!tx.volume || !mainProducts.includes(fuelType)) {
                return acc;
            }

            if (!acc[dateKey]) {
                acc[dateKey] = {};
            }
            if (!acc[dateKey][fuelType]) {
                acc[dateKey][fuelType] = { cashSalesVolume: 0, creditSalesVolume: 0, cashSalesAmount: 0, creditSalesAmount: 0 };
            }

            if (tx.paymentMethod === 'Credit') {
                acc[dateKey][fuelType].creditSalesVolume += tx.volume;
                acc[dateKey][fuelType].creditSalesAmount += tx.totalAmount;
            } else {
                acc[dateKey][fuelType].cashSalesVolume += tx.volume;
                acc[dateKey][fuelType].cashSalesAmount += tx.totalAmount;
            }

            return acc;
        }, {} as Record<string, Record<string, SalesSummary>>);

        const result: GroupedReport = {};

        for (const dateKey in summaryByDateAndFuel) {
            const dailyFuelSummary = summaryByDateAndFuel[dateKey];
            const rows = Object.keys(dailyFuelSummary).map(fuelType => ({
                fuelType,
                cashSalesVolume: dailyFuelSummary[fuelType].cashSalesVolume,
                creditSalesVolume: dailyFuelSummary[fuelType].creditSalesVolume,
            })).sort((a,b) => a.fuelType.localeCompare(b.fuelType));

            const totals = Object.values(dailyFuelSummary).reduce((acc, summary) => {
                acc.cashSalesVolume += summary.cashSalesVolume;
                acc.creditSalesVolume += summary.creditSalesVolume;
                acc.cashSalesAmount += summary.cashSalesAmount;
                acc.creditSalesAmount += summary.creditSalesAmount;
                return acc;
            }, { cashSalesVolume: 0, creditSalesVolume: 0, cashSalesAmount: 0, creditSalesAmount: 0 });

            result[dateKey] = { rows, totals };
        }

        return result;

    }, [isLoaded, transactions, products, dateRange]);
    
    const sortedDateKeys = useMemo(() => {
        return Object.keys(groupedReportData).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [groupedReportData]);
    
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
                        <Accordion type="multiple" className="w-full space-y-4" defaultValue={sortedDateKeys}>
                           {sortedDateKeys.map(dateKey => {
                                const dayData = groupedReportData[dateKey];
                                if (!dayData) return null;

                                return (
                                <AccordionItem value={dateKey} key={dateKey} className="border-b-0">
                                    <Card>
                                        <AccordionTrigger className="p-4 hover:no-underline text-lg">
                                            <div className="flex justify-between w-full pr-4 items-center">
                                                <span className="font-semibold">{format(new Date(dateKey), 'EEEE, dd MMMM yyyy')}</span>
                                                <div className="flex gap-4 text-sm font-normal">
                                                    <span className="text-green-600">Cash: PKR {dayData.totals.cashSalesAmount.toLocaleString(undefined, {minimumFractionDigits: 0})}</span>
                                                    <span className="text-blue-600">Credit: PKR {dayData.totals.creditSalesAmount.toLocaleString(undefined, {minimumFractionDigits: 0})}</span>
                                                    <span className="font-bold">Total: PKR {(dayData.totals.cashSalesAmount + dayData.totals.creditSalesAmount).toLocaleString(undefined, {minimumFractionDigits: 0})}</span>
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="px-4 pb-4">
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
                                                    {dayData.rows.map(row => (
                                                        <TableRow key={row.fuelType}>
                                                            <TableCell className="font-medium flex items-center gap-2"><Fuel size={16}/> {row.fuelType}</TableCell>
                                                            <TableCell className="text-right font-mono text-green-600">{row.cashSalesVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                            <TableCell className="text-right font-mono text-blue-600">{row.creditSalesVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                            <TableCell className="text-right font-mono font-bold">{(row.cashSalesVolume + row.creditSalesVolume).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </AccordionContent>
                                    </Card>
                                </AccordionItem>
                                );
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
