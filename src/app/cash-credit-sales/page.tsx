
'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDatabase } from '@/hooks/use-database';
import { startOfDay, endOfDay, isValid, format } from 'date-fns';
import { Fuel, Droplets, XCircle, Printer, Download, Search } from 'lucide-react';
import type { FuelType, MachineReading, Purchase, SaleReturn, PurchaseReturn, StockAdjustment } from '@/lib/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DateRangePicker } from '@/components/date-range-picker';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import { Input } from '@/components/ui/input';


interface SalesSummary {
    cashSalesVolume: number;
    creditSalesVolume: number;
    cashSalesAmount: number;
    creditSalesAmount: number;
}

interface ReportRow {
    fuelType: string;
    openingStock: number;
    cashSalesVolume: number;
    creditSalesVolume: number;
    closingStock: number;
}


type GroupedReport = {
    [dateKey: string]: {
        rows: ReportRow[];
        totals: SalesSummary;
        machineReadings?: MachineReading[];
    }
};

export default function CashCreditSalesReportPage() {
    const { 
        transactions, 
        products, 
        machineReadings, 
        isLoaded, 
        dateRange, 
        setDateRange,
        purchases,
        purchaseReturns,
        saleReturns,
        stockAdjustments,
        initialFuelStock
    } = useDatabase();
    const [searchTerm, setSearchTerm] = useState('');

    const groupedReportData: GroupedReport = useMemo(() => {
        if (!isLoaded || !products.length) return {};

        const mainProducts = products.filter(p => p.category === 'Main Product');

        const allMovements = [
            ...purchases.map(p => ({ ...p, type: 'purchase' })),
            ...transactions.map(t => ({ ...t, type: 'sale' })),
            ...purchaseReturns.map(pr => ({ ...pr, type: 'purchase_return' })),
            ...saleReturns.map(sr => ({ ...sr, type: 'sale_return' })),
            ...stockAdjustments.map(sa => ({ ...sa, type: 'adjustment' }))
        ];

        const getStockAtPoint = (fuelType: string, pointInTime: Date): number => {
            const lastReading = machineReadings
                .filter(r => r.fuelType === fuelType && isValid(new Date(r.timestamp)) && new Date(r.timestamp) < pointInTime)
                .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
            
            let stock = lastReading ? lastReading.volume : (initialFuelStock[fuelType as FuelType] || 0);
            const startTime = lastReading ? new Date(lastReading.timestamp) : new Date(0);

            const movementsSince = allMovements.filter(m => 
                ((m as any).fuelType === fuelType) && 
                isValid(new Date(m.timestamp)) && 
                new Date(m.timestamp) > startTime && 
                new Date(m.timestamp) < pointInTime
            );

            for (const move of movementsSince) {
                switch(move.type) {
                    case 'purchase': stock += (move as Purchase).volume; break;
                    case 'sale': stock -= (move as any).volume || 0; break;
                    case 'purchase_return': stock -= (move as PurchaseReturn).volume; break;
                    case 'sale_return': stock += (move as SaleReturn).volume; break;
                    case 'adjustment': stock += (move as StockAdjustment).adjustment; break;
                }
            }
            return stock;
        };

        let filteredTransactions = transactions;
        let filteredMachineReadings = machineReadings;
        if (dateRange?.from) {
            const from = startOfDay(dateRange.from);
            const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);
            
            const filterByDate = (items: any[]) => items.filter(item => {
                const itemDate = new Date(item.timestamp);
                return isValid(itemDate) && itemDate >= from && itemDate <= to;
            });

            filteredTransactions = filterByDate(transactions);
            filteredMachineReadings = filterByDate(machineReadings);
        }
        
        const summaryByDateAndFuel = filteredTransactions.reduce((acc, tx) => {
            const date = new Date(tx.timestamp);
            if (!isValid(date)) return acc;

            const dateKey = format(date, 'yyyy-MM-dd');
            const fuelType = tx.fuelType as FuelType;

            if (!tx.volume || !mainProducts.some(p => p.name === fuelType)) {
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
        
        const readingsByDate = filteredMachineReadings.reduce((acc, reading) => {
            const date = new Date(reading.timestamp);
            if (!isValid(date)) return acc;
            const dateKey = format(date, 'yyyy-MM-dd');
            if(!acc[dateKey]) acc[dateKey] = [];
            acc[dateKey].push(reading);
            return acc;
        }, {} as Record<string, MachineReading[]>);


        const result: GroupedReport = {};
        
        const allDateKeys = [...new Set([...Object.keys(summaryByDateAndFuel), ...Object.keys(readingsByDate)])];

        for (const dateKey of allDateKeys) {
            const dayStart = startOfDay(new Date(dateKey));
            const dayEnd = endOfDay(new Date(dateKey));

            const dailyFuelSummary = summaryByDateAndFuel[dateKey] || {};
            
            const movementsForTheDay = allMovements.filter(m => {
                const moveDate = new Date(m.timestamp);
                return isValid(moveDate) && moveDate >= dayStart && moveDate <= dayEnd;
            });

            let rows: ReportRow[] = mainProducts.map(product => {
                const fuelType = product.name;
                const openingStock = getStockAtPoint(fuelType, dayStart);
                const salesSummary = dailyFuelSummary[fuelType] || { cashSalesVolume: 0, creditSalesVolume: 0 };
                
                const purchasesVol = movementsForTheDay.filter(m => m.type === 'purchase' && (m as Purchase).fuelType === fuelType).reduce((s, m) => s + (m as Purchase).volume, 0);
                const salesVol = salesSummary.cashSalesVolume + salesSummary.creditSalesVolume;
                const purchaseReturnsVol = movementsForTheDay.filter(m => m.type === 'purchase_return' && (m as PurchaseReturn).fuelType === fuelType).reduce((s, m) => s + (m as PurchaseReturn).volume, 0);
                const saleReturnsVol = movementsForTheDay.filter(m => m.type === 'sale_return' && (m as SaleReturn).fuelType === fuelType).reduce((s, m) => s + (m as SaleReturn).volume, 0);
                const adjustmentsVol = movementsForTheDay.filter(m => m.type === 'adjustment' && (m as StockAdjustment).fuelType === fuelType).reduce((s, m) => s + (m as StockAdjustment).adjustment, 0);

                const closingStock = openingStock + purchasesVol - salesVol - purchaseReturnsVol + saleReturnsVol + adjustmentsVol;

                return {
                    fuelType,
                    openingStock,
                    closingStock,
                    cashSalesVolume: salesSummary.cashSalesVolume,
                    creditSalesVolume: salesSummary.creditSalesVolume,
                };
            }).filter(row => row.cashSalesVolume > 0 || row.creditSalesVolume > 0).sort((a,b) => a.fuelType.localeCompare(b.fuelType));


            if (searchTerm) {
                rows = rows.filter(row => row.fuelType.toLowerCase().includes(searchTerm.toLowerCase()));
            }

            if (rows.length === 0) continue;

            const totals = Object.values(dailyFuelSummary).reduce((acc, summary) => {
                acc.cashSalesVolume += summary.cashSalesVolume;
                acc.creditSalesVolume += summary.creditSalesVolume;
                acc.cashSalesAmount += summary.cashSalesAmount;
                acc.creditSalesAmount += summary.creditSalesAmount;
                return acc;
            }, { cashSalesVolume: 0, creditSalesVolume: 0, cashSalesAmount: 0, creditSalesAmount: 0 });

            result[dateKey] = { rows, totals, machineReadings: readingsByDate[dateKey] };
        }

        return result;

    }, [isLoaded, transactions, products, machineReadings, dateRange, searchTerm, purchases, purchaseReturns, saleReturns, stockAdjustments, initialFuelStock]);
    
    const sortedDateKeys = useMemo(() => {
        return Object.keys(groupedReportData).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [groupedReportData]);
    
    const handleExportExcel = () => {
        const dataToExport = sortedDateKeys.flatMap(dateKey => {
            const dayData = groupedReportData[dateKey];
            if (!dayData) return [];
            return dayData.rows.map(row => ({
                'Date': format(new Date(dateKey), 'dd-MMM-yyyy'),
                'Fuel Type': row.fuelType,
                'Opening Stock (Liters)': row.openingStock.toFixed(2),
                'Cash Sales (Liters)': row.cashSalesVolume.toFixed(2),
                'Credit Sales (Liters)': row.creditSalesVolume.toFixed(2),
                'Total Sales (Liters)': (row.cashSalesVolume + row.creditSalesVolume).toFixed(2),
                'Closing Stock (Liters)': row.closingStock.toFixed(2),
            }));
        });
        
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'CashCreditSalesReport');
        XLSX.writeFile(workbook, 'CashCreditSalesReport.xlsx');
    };

    return (
        <div className="p-4 md:p-8">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Droplets /> Cash & Credit Sales Report (Volume in Liters)
                            </CardTitle>
                            <CardDescription>
                                A breakdown of fuel sales by volume (in liters) for cash and credit transactions for the selected period, grouped by date.
                            </CardDescription>
                        </div>
                         <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search fuel type..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 w-full sm:w-auto"
                                />
                            </div>
                           <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                           <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4"/> Print</Button>
                           <Button variant="outline" onClick={handleExportExcel}><Download className="mr-2 h-4 w-4"/> Excel</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoaded && sortedDateKeys.length > 0 ? (
                        <Accordion type="multiple" className="w-full space-y-4" defaultValue={sortedDateKeys}>
                           {sortedDateKeys.map(dateKey => {
                                const dayData = groupedReportData[dateKey];
                                if (!dayData) return null;

                                return (
                                <AccordionItem value={dateKey} key={dateKey} className="border border-red-500 rounded-lg overflow-hidden bg-background shadow-sm">
                                    <AccordionTrigger className="p-4 text-lg hover:no-underline data-[state=open]:bg-muted/50">
                                        <div className="flex justify-between w-full pr-4 items-center">
                                            <span className="font-semibold text-red-500">{format(new Date(dateKey), 'EEEE, dd MMMM yyyy')}</span>
                                            <div className="flex gap-4 text-sm font-normal">
                                                <span className="text-green-600">Cash: PKR {dayData.totals.cashSalesAmount.toLocaleString(undefined, {minimumFractionDigits: 0})}</span>
                                                <span className="text-blue-600">Credit: PKR {dayData.totals.creditSalesAmount.toLocaleString(undefined, {minimumFractionDigits: 0})}</span>
                                                <span className="font-bold">Total: PKR {(dayData.totals.cashSalesAmount + dayData.totals.creditSalesAmount).toLocaleString(undefined, {minimumFractionDigits: 0})}</span>
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-4 pb-4 bg-background">
                                        <div className="border rounded-md">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Fuel Type / Opening Stock</TableHead>
                                                        <TableHead className="text-right text-green-600">Cash Sales (Liters)</TableHead>
                                                        <TableHead className="text-right text-blue-600">Credit Sales (Liters)</TableHead>
                                                        <TableHead className="text-right">Total Sales (Liters)</TableHead>
                                                        <TableHead className="text-right">Remaining Stock</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {dayData.rows.map(row => (
                                                        <TableRow key={row.fuelType}>
                                                            <TableCell className="font-medium">
                                                                <div className="flex items-center gap-2">
                                                                    <Fuel size={16}/>
                                                                    <div>
                                                                        {row.fuelType}
                                                                        <div className="text-xs text-muted-foreground">
                                                                            Opening: {row.openingStock.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono text-green-600">{row.cashSalesVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                            <TableCell className="text-right font-mono text-blue-600">{row.creditSalesVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                            <TableCell className="text-right font-mono font-bold">{(row.cashSalesVolume + row.creditSalesVolume).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                            <TableCell className="text-right font-mono font-semibold">{row.closingStock.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                        {dayData.machineReadings && dayData.machineReadings.length > 0 && (
                                            <div className="mt-4">
                                                <h4 className="text-md font-semibold mb-2 flex items-center gap-2"><Fuel size={16} /> Machine Readings for the Day</h4>
                                                <div className="border rounded-md">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Machine Name</TableHead>
                                                                <TableHead>Fuel Type</TableHead>
                                                                <TableHead className="text-right">Reading (Liters)</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {dayData.machineReadings.map(reading => (
                                                                <TableRow key={reading.machineName}>
                                                                    <TableCell>{reading.machineName}</TableCell>
                                                                    <TableCell>{reading.fuelType}</TableCell>
                                                                    <TableCell className="text-right font-mono">{reading.volume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </div>
                                        )}
                                    </AccordionContent>
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
