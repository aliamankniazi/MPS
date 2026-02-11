
'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDatabase } from '@/hooks/use-database';
import { format, isValid, formatDistanceToNow, startOfDay, endOfDay } from 'date-fns';
import { TrendingUp, Package, Percent, CalendarDays, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DateRangePicker } from '@/components/date-range-picker';
import { Input } from '@/components/ui/input';
import type { DateRange } from '@/lib/types';


export default function ProductRateHistoryPage() {
    const { products, transactions, purchases, isLoaded, dateRange, setDateRange } = useDatabase();
    const [searchTerm, setSearchTerm] = useState('');

    const productRateSummary = useMemo(() => {
        if (!isLoaded) return [];

        let filteredProducts = products.filter(p => p.category === 'Main Product');
        if (searchTerm) {
            filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }

        const toDate = dateRange?.to ? endOfDay(dateRange.to) : new Date();

        return filteredProducts.map(product => {
            const salesForProduct = transactions
                .filter(t => t.fuelType === product.name && t.pricePerLitre > 0 && new Date(t.timestamp) <= toDate)
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            const purchasesForProduct = purchases
                .filter(p => p.fuelType === product.name && p.volume > 0 && p.totalCost > 0 && new Date(p.timestamp) <= toDate)
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            const lastSale = salesForProduct[0];
            const lastPurchase = purchasesForProduct[0];

            const lastSaleRate = lastSale ? lastSale.pricePerLitre : product.salePrice || 0;
            const lastPurchaseRate = lastPurchase ? lastPurchase.totalCost / lastPurchase.volume : product.purchasePrice || 0;

            const lastActivityTs = Math.max(
                lastSale ? new Date(lastSale.timestamp).getTime() : 0,
                lastPurchase ? new Date(lastPurchase.timestamp).getTime() : 0
            );
            const lastActivityDate = lastActivityTs > 0 ? new Date(lastActivityTs) : null;
            
            if (dateRange?.from && lastActivityDate && lastActivityDate < startOfDay(dateRange.from)) {
                return null;
            }

            return {
                id: product.id,
                name: product.name,
                lastSaleRate: lastSaleRate,
                lastSaleDate: lastSale ? new Date(lastSale.timestamp) : null,
                lastPurchaseRate: lastPurchaseRate,
                lastPurchaseDate: lastPurchase ? new Date(lastPurchase.timestamp) : null,
                margin: lastSaleRate > 0 && lastPurchaseRate > 0 ? lastSaleRate - lastPurchaseRate : 0,
                lastActivityDate: lastActivityDate
            };
        }).filter((p): p is NonNullable<typeof p> => p !== null).sort((a, b) => {
            const timeA = a.lastActivityDate ? a.lastActivityDate.getTime() : 0;
            const timeB = b.lastActivityDate ? b.lastActivityDate.getTime() : 0;
            return timeB - timeA;
        });

    }, [isLoaded, products, transactions, purchases, dateRange, searchTerm]);

    return (
        <div className="p-4 md:p-8">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp /> Product Rate & Margin Summary
                            </CardTitle>
                            <CardDescription>
                                A summary of the latest sale rate, purchase rate, and profit margin for each main product.
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
                   {isLoaded && productRateSummary.length > 0 ? (
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead className="text-right">Last Sale Rate</TableHead>
                                        <TableHead className="text-right">Last Purchase Rate</TableHead>
                                        <TableHead className="text-right">Profit Margin</TableHead>
                                        <TableHead>Last Update</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {productRateSummary.map(product => (
                                        <TableRow key={product.id}>
                                            <TableCell>
                                                <div className="font-bold flex items-center gap-2">
                                                    <Package className="w-4 h-4" />
                                                    <span className={cn(
                                                        product.name.toLowerCase().includes('diesel') && 'text-green-600',
                                                        (product.name.toLowerCase().includes('unleaded') || product.name.toLowerCase().includes('premium')) && 'text-destructive'
                                                    )}>
                                                        {product.name}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-bold text-blue-600">
                                                {product.lastSaleRate > 0 ? `PKR ${product.lastSaleRate.toFixed(2)}` : 'N/A'}
                                                {product.lastSaleDate && <div className="text-xs text-muted-foreground">{format(product.lastSaleDate, 'dd-MMM-yy')}</div>}
                                            </TableCell>
                                             <TableCell className="text-right font-mono font-bold text-destructive">
                                                {product.lastPurchaseRate > 0 ? `PKR ${product.lastPurchaseRate.toFixed(2)}` : 'N/A'}
                                                {product.lastPurchaseDate && <div className="text-xs text-muted-foreground">{format(product.lastPurchaseDate, 'dd-MMM-yy')}</div>}
                                            </TableCell>
                                            <TableCell className={cn("text-right font-mono font-semibold", product.margin > 0 ? 'text-green-600' : 'text-destructive')}>
                                                 <div className="flex items-center justify-end gap-1">
                                                    <Percent className="w-3 h-3" />
                                                    <span>{product.margin > 0 ? `PKR ${product.margin.toFixed(2)}` : 'N/A'}</span>
                                                 </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <CalendarDays className="w-4 h-4" />
                                                    <span>{product.lastActivityDate ? formatDistanceToNow(product.lastActivityDate, { addSuffix: true }) : 'Never'}</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
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
