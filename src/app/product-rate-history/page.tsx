
'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDatabase } from '@/hooks/use-database';
import { format, isValid, startOfDay, endOfDay } from 'date-fns';
import { TrendingUp, Package, Percent, CalendarDays, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DateRangePicker } from '@/components/date-range-picker';
import { Input } from '@/components/ui/input';
import type { DateRange } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


export default function ProductRateHistoryPage() {
    const { products, transactions, purchases, isLoaded, dateRange, setDateRange } = useDatabase();
    const [searchTerm, setSearchTerm] = useState('');

    const productRateHistory = useMemo(() => {
        if (!isLoaded) return {};

        let mainProducts = products.filter(p => p.category === 'Main Product');
        if (searchTerm) {
            mainProducts = mainProducts.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }

        if (mainProducts.length === 0) return {};

        const allRateChangeDates = new Set<number>();
        
        transactions.forEach(t => {
            if(t.pricePerLitre > 0 && isValid(new Date(t.timestamp))) allRateChangeDates.add(startOfDay(new Date(t.timestamp)).getTime());
        });
        purchases.forEach(p => {
            if(p.volume > 0 && p.totalCost > 0 && isValid(new Date(p.timestamp))) allRateChangeDates.add(startOfDay(new Date(p.timestamp)).getTime());
        });

        const validTimestamps = [...allRateChangeDates];
        if (validTimestamps.length === 0) return {};

        const minDate = new Date(Math.min(...validTimestamps));
        const maxDate = new Date();

        if (!isValid(minDate)) return {};

        // Add 1st and 16th of each month in the range
        let currentDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        while(currentDate <= maxDate) {
            allRateChangeDates.add(startOfDay(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)).getTime());
            allRateChangeDates.add(startOfDay(new Date(currentDate.getFullYear(), currentDate.getMonth(), 16)).getTime());
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        const sortedUniqueDates = Array.from(allRateChangeDates).map(t => new Date(t)).sort((a, b) => a.getTime() - b.getTime());

        const history: Record<string, { date: string; saleRate: number; purchaseRate: number }[]> = {};

        mainProducts.forEach(product => {
            const productHistory: { date: string; saleRate: number; purchaseRate: number }[] = [];
            
            let lastSaleRate = -1;
            let lastPurchaseRate = -1;

            sortedUniqueDates.forEach(date => {
                const saleOnDate = transactions
                    .filter(t => t.fuelType === product.name && t.pricePerLitre > 0 && new Date(t.timestamp) <= endOfDay(date))
                    .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                
                const purchaseOnDate = purchases
                    .filter(p => p.fuelType === product.name && p.volume > 0 && p.totalCost > 0 && new Date(p.timestamp) <= endOfDay(date))
                    .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

                const currentSaleRate = saleOnDate ? saleOnDate.pricePerLitre : 0;
                const currentPurchaseRate = purchaseOnDate && purchaseOnDate.volume > 0 ? purchaseOnDate.totalCost / purchaseOnDate.volume : 0;

                if (currentSaleRate.toFixed(2) !== lastSaleRate.toFixed(2) || currentPurchaseRate.toFixed(2) !== lastPurchaseRate.toFixed(2)) {
                    productHistory.push({
                        date: format(date, 'yyyy-MM-dd'),
                        saleRate: currentSaleRate,
                        purchaseRate: currentPurchaseRate,
                    });
                    lastSaleRate = currentSaleRate;
                    lastPurchaseRate = currentPurchaseRate;
                }
            });
            history[product.name] = productHistory;
        });

        return history;
    }, [isLoaded, products, transactions, purchases, searchTerm]);
    
    const productNames = Object.keys(productRateHistory);

    return (
        <div className="p-4 md:p-8">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp /> Product Rate History
                            </CardTitle>
                            <CardDescription>
                                A log of all purchase and sale rate changes for main products.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search product..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                           <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                   {isLoaded && productNames.length > 0 ? (
                        <Accordion type="multiple" className="w-full space-y-4">
                            {productNames.map(productName => {
                                const historyEntries = productRateHistory[productName];
                                if (!historyEntries) return null;
                                
                                const filteredHistory = dateRange?.from 
                                    ? historyEntries.filter(entry => {
                                        const entryDate = new Date(entry.date);
                                        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from!);
                                        return entryDate >= startOfDay(dateRange.from!) && entryDate <= to;
                                    })
                                    : historyEntries;

                                if (filteredHistory.length === 0 && searchTerm) return null;

                                return (
                                <AccordionItem value={productName} key={productName} className="border rounded-lg">
                                    <AccordionTrigger className="p-4 hover:no-underline">
                                        <span className="font-semibold text-lg">{productName}</span>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-0">
                                        {filteredHistory.length > 0 ? (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Date</TableHead>
                                                        <TableHead className="text-right">Sale Rate</TableHead>
                                                        <TableHead className="text-right">Purchase Rate</TableHead>
                                                        <TableHead className="text-right">Margin</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {filteredHistory.slice().reverse().map((entry, index) => {
                                                        const margin = entry.saleRate - entry.purchaseRate;
                                                        return (
                                                        <TableRow key={`${entry.date}-${index}`}>
                                                            <TableCell className="font-medium">{format(new Date(entry.date), 'dd-MMM-yyyy')}</TableCell>
                                                            <TableCell className="text-right font-mono text-blue-600 font-bold">{entry.saleRate > 0 ? entry.saleRate.toFixed(2) : '-'}</TableCell>
                                                            <TableCell className="text-right font-mono text-red-600 font-bold">{entry.purchaseRate > 0 ? entry.purchaseRate.toFixed(2) : '-'}</TableCell>
                                                            <TableCell className={cn("text-right font-mono font-semibold", margin > 0 ? 'text-green-600' : 'text-destructive')}>
                                                                {entry.saleRate > 0 && entry.purchaseRate > 0 ? margin.toFixed(2) : '-'}
                                                            </TableCell>
                                                        </TableRow>
                                                    )})}
                                                </TableBody>
                                            </Table>
                                        ) : (
                                            <div className="p-4 text-center text-sm text-muted-foreground">No rate history for this product in the selected period.</div>
                                        )}
                                    </AccordionContent>
                                </AccordionItem>
                            )})
                        }
                        </Accordion>
                   ) : (
                        <div className="text-center p-8 text-muted-foreground">
                            {isLoaded ? 'No rate data available.' : 'Loading data...'}
                        </div>
                   )}
                </CardContent>
            </Card>
        </div>
    );
}
