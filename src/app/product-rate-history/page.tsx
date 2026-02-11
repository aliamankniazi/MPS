
'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDatabase } from '@/hooks/use-database';
import { format, isValid } from 'date-fns';
import { TrendingUp, Package } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface RateHistoryEntry {
  date: string;
  type: 'Sale' | 'Purchase';
  rate: number;
  transactionId: string;
}

type GroupedHistory = Record<string, RateHistoryEntry[]>;

export default function ProductRateHistoryPage() {
    const { products, transactions, purchases, isLoaded } = useDatabase();

    const rateHistory = useMemo(() => {
        if (!isLoaded) return {};

        const mainProducts = products.filter(p => p.category === 'Main Product');
        const history: GroupedHistory = {};

        mainProducts.forEach(product => {
            const productSales = transactions
                .filter(t => t.fuelType === product.name && t.pricePerLitre > 0)
                .map(t => ({
                    date: t.timestamp,
                    type: 'Sale' as const,
                    rate: t.pricePerLitre,
                    id: `sale-${t.id}`
                }));

            const productPurchases = purchases
                .filter(p => p.fuelType === product.name && p.volume > 0 && p.totalCost > 0)
                .map(p => ({
                    date: p.timestamp,
                    type: 'Purchase' as const,
                    rate: p.totalCost / p.volume,
                    id: `purchase-${p.id}`
                }));
            
            const allTransactionsForProduct = [...productSales, ...productPurchases].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            if (allTransactionsForProduct.length === 0) {
                return;
            }

            // 1. Get all actual rate changes
            const actualChanges: RateHistoryEntry[] = [];
            let lastSaleRate = -1;
            let lastPurchaseRate = -1;
            allTransactionsForProduct.forEach(entry => {
                if (entry.type === 'Sale') {
                    if (entry.rate !== lastSaleRate) {
                        actualChanges.push({
                            date: entry.date,
                            type: 'Sale',
                            rate: entry.rate,
                            transactionId: entry.id,
                        });
                        lastSaleRate = entry.rate;
                    }
                } else { // Purchase
                    if (entry.rate !== lastPurchaseRate) {
                         actualChanges.push({
                            date: entry.date,
                            type: 'Purchase',
                            rate: entry.rate,
                            transactionId: entry.id,
                        });
                        lastPurchaseRate = entry.rate;
                    }
                }
            });

            // 2. Get dates of interest (1st and 16th)
            const artificialEntries: RateHistoryEntry[] = [];
            const firstDate = new Date(allTransactionsForProduct[0].date);
            const lastDate = new Date();
            let currentDate = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);

            while (currentDate <= lastDate) {
                const datesToCheck = [
                    new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
                    new Date(currentDate.getFullYear(), currentDate.getMonth(), 16)
                ];
                
                for (const targetDate of datesToCheck) {
                    if (targetDate > lastDate) continue;
                    
                    const lastSale = [...allTransactionsForProduct].reverse().find(t => t.type === 'Sale' && new Date(t.date) <= targetDate);
                    if(lastSale) {
                        artificialEntries.push({
                            date: targetDate.toISOString(),
                            type: 'Sale',
                            rate: lastSale.rate,
                            transactionId: `derived-sale-${targetDate.toISOString()}`
                        });
                    }
                    
                    const lastPurchase = [...allTransactionsForProduct].reverse().find(t => t.type === 'Purchase' && new Date(t.date) <= targetDate);
                    if(lastPurchase) {
                        artificialEntries.push({
                            date: targetDate.toISOString(),
                            type: 'Purchase',
                            rate: lastPurchase.rate,
                            transactionId: `derived-purchase-${targetDate.toISOString()}`
                        });
                    }
                }
                currentDate.setMonth(currentDate.getMonth() + 1);
            }
            
            // 3. Combine and de-duplicate
            const combinedHistory = [...actualChanges, ...artificialEntries];
            const finalHistoryMap = new Map<string, RateHistoryEntry>();

            combinedHistory.forEach(item => {
                const itemDateStr = new Date(item.date).toISOString().split('T')[0];
                const key = `${itemDateStr}-${item.type}`;
                
                const existingEntry = finalHistoryMap.get(key);

                if (!existingEntry || (existingEntry.transactionId.startsWith('derived-') && !item.transactionId.startsWith('derived-'))) {
                    finalHistoryMap.set(key, item);
                }
            });

            const finalHistory = Array.from(finalHistoryMap.values());
            
            if (finalHistory.length > 0) {
                 history[product.name] = finalHistory.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            }

        });

        return history;
    }, [isLoaded, products, transactions, purchases]);
    
    const productNames = Object.keys(rateHistory);

    return (
        <div className="p-4 md:p-8">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingUp /> Product Rate History
                    </CardTitle>
                    <CardDescription>
                        A log of all purchase and sale rate changes for main products.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                   {isLoaded && productNames.length > 0 ? (
                        <Accordion type="multiple" className="w-full space-y-4">
                           {productNames.map(productName => (
                                <AccordionItem value={productName} key={productName}>
                                    <AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md">
                                        <div className="flex items-center gap-2">
                                            <Package />
                                            <span className={cn(
                                                productName.toLowerCase().includes('diesel') && 'text-green-600',
                                                (productName.toLowerCase().includes('unleaded') || productName.toLowerCase().includes('premium')) && 'text-destructive'
                                            )}>
                                                {productName}
                                            </span>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-2">
                                        <div className="border rounded-md">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Date</TableHead>
                                                        <TableHead>Type</TableHead>
                                                        <TableHead className="text-right">Rate (PKR)</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {rateHistory[productName].map(entry => (
                                                        <TableRow key={entry.transactionId}>
                                                            <TableCell className="font-medium">
                                                                {isValid(new Date(entry.date)) ? format(new Date(entry.date), 'dd-MMM-yyyy hh:mm a') : 'Invalid Date'}
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant={entry.type === 'Sale' ? 'destructive' : 'default'}>
                                                                    {entry.type}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono font-semibold">
                                                                {entry.rate.toFixed(2)}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                           ))}
                        </Accordion>
                   ) : (
                        <div className="text-center p-8 text-muted-foreground">
                            {isLoaded ? 'No rate changes recorded.' : 'Loading data...'}
                        </div>
                   )}
                </CardContent>
            </Card>
        </div>
    );
}
