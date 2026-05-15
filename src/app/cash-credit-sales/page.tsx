'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDatabase } from '@/hooks/use-database';
import { startOfDay, endOfDay, isValid, format, subDays, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { Fuel, Droplets, XCircle, Printer, Download, Search, Pencil, Trash2, AlertTriangle, Calendar as CalendarIcon } from 'lucide-react';
import type { FuelType, MachineReading, Purchase, SaleReturn, PurchaseReturn, StockAdjustment, DateRange } from '@/lib/types';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';


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

interface ComparisonSummary {
    fuelType: string;
    sales: number;
    dispensed: number;
    difference: number;
}

interface ProcessedReading extends MachineReading {
    previousReadingVolume?: number;
    previousReadingTimestamp?: string;
    dispensed: number;
}


type GroupedReport = {
    [dateKey: string]: {
        rows: ReportRow[];
        totals: SalesSummary;
        machineReadings?: ProcessedReading[];
        comparisonSummary?: ComparisonSummary[];
    }
};

const machineReadingEditSchema = z.object({
  volume: z.coerce.number().min(0, "Volume cannot be negative."),
  date: z.date({ required_error: "A date is required."}),
});
type MachineReadingEditFormValues = z.infer<typeof machineReadingEditSchema>;


export default function CashCreditSalesReportPage() {
    const { 
        transactions, 
        products, 
        machineReadings, 
        machines,
        isLoaded, 
        purchases,
        purchaseReturns,
        saleReturns,
        stockAdjustments,
        initialFuelStock,
        deleteMachineReading,
        updateMachineReading
    } = useDatabase();
    const [searchTerm, setSearchTerm] = useState('');
    const [readingToEdit, setReadingToEdit] = useState<ProcessedReading | null>(null);
    const [readingToDelete, setReadingToDelete] = useState<ProcessedReading | null>(null);
    const [editDatePopoverOpen, setEditDatePopoverOpen] = useState(false);
    const { toast } = useToast();
    const [localDateRange, setLocalDateRange] = useState<DateRange | undefined>();
    const isInitialDateSet = useRef(false);

    useEffect(() => {
      if (isLoaded && transactions.length > 0 && !isInitialDateSet.current) {
        const latestTransaction = [...transactions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
        if (latestTransaction && isValid(new Date(latestTransaction.timestamp))) {
          const latestDate = new Date(latestTransaction.timestamp);
          setLocalDateRange({ from: startOfDay(latestDate), to: endOfDay(latestDate) });
        } else {
          setLocalDateRange({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
        }
        isInitialDateSet.current = true;
      } else if (isLoaded && !isInitialDateSet.current) {
        setLocalDateRange({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
        isInitialDateSet.current = true;
      }
    }, [isLoaded, transactions]);

     const { register: registerReading, handleSubmit: handleSubmitReading, control: controlReading, reset: resetReading, formState: { errors: readingErrors } } = useForm<MachineReadingEditFormValues>({
        resolver: zodResolver(machineReadingEditSchema),
    });

    useEffect(() => {
        if (readingToEdit) {
            resetReading({
                volume: readingToEdit.volume,
                date: new Date(readingToEdit.timestamp),
            });
        }
    }, [readingToEdit, resetReading]);

    const onEditReadingSubmit: SubmitHandler<MachineReadingEditFormValues> = (data) => {
        if (!readingToEdit) return;
        updateMachineReading(readingToEdit.id, {
          volume: data.volume,
          timestamp: data.date.toISOString(),
        });
        toast({
          title: "Reading Updated",
          description: `The reading for ${readingToEdit.machineName} has been updated.`,
        });
        setReadingToEdit(null);
    };

    const handleDeleteReading = () => {
        if (!readingToDelete) return;
        deleteMachineReading(readingToDelete.id);
        toast({
            title: 'Reading Deleted',
            description: `The reading for ${readingToDelete.machineName} has been deleted.`,
        });
        setReadingToDelete(null);
    }

    const groupedReportData: GroupedReport = useMemo(() => {
        if (!isLoaded || !products.length || !machines || !localDateRange?.from) return {};

        const from = startOfDay(localDateRange.from);
        const to = localDateRange.to ? endOfDay(localDateRange.to) : endOfDay(from);

        const filterByDate = (items: any[]) => items.filter(item => {
            const itemDate = new Date(item.timestamp);
            return isValid(itemDate) && itemDate >= from && itemDate <= to;
        });

        const filteredTransactions = filterByDate(transactions);
        const filteredMachineReadingsByDate = filterByDate(machineReadings);

        const mainProducts = products.filter(p => p.category === 'Main Product');

        const allMovements = [
            ...purchases.map(p => ({ ...p, type: 'purchase' })),
            ...transactions.map(t => ({ ...t, type: 'sale' })),
            ...purchaseReturns.map(pr => ({ ...pr, type: 'purchase_return' })),
            ...saleReturns.map(sr => ({ ...sr, type: 'sale_return' })),
            ...stockAdjustments.map(sa => ({ ...sa, type: 'adjustment' }))
        ];

        const getStockAtPoint = (fuelType: string, pointInTime: Date): number => {
            const initialStock = initialFuelStock[fuelType as FuelType] || 0;
            
            const movementsBefore = allMovements.filter(m => 
                ((m as any).fuelType === fuelType) && 
                isValid(new Date(m.timestamp)) && 
                new Date(m.timestamp) < pointInTime
            );

            let stock = initialStock;
            for (const move of movementsBefore) {
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
        
        const readingsByDate = filteredMachineReadingsByDate.reduce((acc, reading) => {
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
            }).filter(row => row.cashSalesVolume > 0 || row.creditSalesVolume > 0 || row.openingStock > 0).sort((a, b) => (b.cashSalesVolume + b.creditSalesVolume) - (a.cashSalesVolume + a.creditSalesVolume));


            if (searchTerm) {
                rows = rows.filter(row => row.fuelType.toLowerCase().includes(searchTerm.toLowerCase()));
            }

            const readingsOnDay = machineReadings.filter(r => {
                const readingDate = new Date(r.timestamp);
                return isValid(readingDate) && isSameDay(readingDate, dayStart);
            });

            if (rows.length === 0 && readingsOnDay.length === 0) continue;

            const totals = Object.values(dailyFuelSummary).reduce((acc, summary) => {
                acc.cashSalesVolume += summary.cashSalesVolume;
                acc.creditSalesVolume += summary.creditSalesVolume;
                acc.cashSalesAmount += summary.cashSalesAmount;
                acc.creditSalesAmount += summary.creditSalesAmount;
                return acc;
            }, { cashSalesVolume: 0, creditSalesVolume: 0, cashSalesAmount: 0, creditSalesAmount: 0 });

             const uniqueMachineNamesForDay = [...new Set(readingsOnDay.map(r => r.machineName))];

            const processedReadings: ProcessedReading[] = uniqueMachineNamesForDay.map(machineName => {
                const latestReadingForDay = readingsOnDay
                    .filter(r => r.machineName === machineName)
                    .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                
                if (!latestReadingForDay) return null;

                let previousReading: MachineReading | undefined = machineReadings // use unfiltered list
                    .filter(r => r.machineName === machineName && new Date(r.timestamp) < dayStart)
                    .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                
                let dispensed = 0;

                if (previousReading) {
                    dispensed = latestReadingForDay.volume - previousReading.volume;
                } else {
                    const readingsForMachineOnDay = readingsOnDay
                        .filter(r => r.machineName === machineName)
                        .sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()); // ASC
                    
                    if (readingsForMachineOnDay.length > 1) {
                        previousReading = readingsForMachineOnDay[0];
                        dispensed = latestReadingForDay.volume - previousReading.volume;
                    }
                }

                return {
                    ...latestReadingForDay,
                    previousReadingVolume: previousReading?.volume,
                    previousReadingTimestamp: previousReading?.timestamp,
                    dispensed: dispensed > 0 ? dispensed : 0,
                };
            }).filter((r): r is ProcessedReading => r !== null);

            const salesSummaryByFuel = rows.reduce((acc, row) => {
                acc[row.fuelType] = (acc[row.fuelType] || 0) + row.cashSalesVolume + row.creditSalesVolume;
                return acc;
            }, {} as Record<string, number>);

            const dispensedSummaryByFuel = processedReadings.reduce((acc, reading) => {
                acc[reading.fuelType] = (acc[reading.fuelType] || 0) + reading.dispensed;
                return acc;
            }, {} as Record<string, number>);

            const fuelTypesWithMachines = [...new Set(machines.map(m => m.fuelType))];

            const allFuelTypesInDay = [...new Set([...Object.keys(salesSummaryByFuel), ...Object.keys(dispensedSummaryByFuel)])]
                .filter(fuelType => fuelTypesWithMachines.includes(fuelType));

            const comparisonSummary = allFuelTypesInDay.map(fuelType => {
                const sales = salesSummaryByFuel[fuelType] || 0;
                const dispensed = dispensedSummaryByFuel[fuelType] || 0;
                return {
                    fuelType,
                    sales,
                    dispensed,
                    difference: dispensed - sales,
                };
            });

            result[dateKey] = { rows, totals, machineReadings: processedReadings, comparisonSummary };
        }

        return result;

    }, [isLoaded, transactions, products, machineReadings, localDateRange, searchTerm, purchases, purchaseReturns, saleReturns, stockAdjustments, initialFuelStock, machines]);
    
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
        <>
        <div className="p-4 md:p-8">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Droplets /> Cash &amp; Credit Sales Report (Volume in Liters)
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
                           <DateRangePicker date={localDateRange} onDateChange={setLocalDateRange} />
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
                                <AccordionItem value={dateKey} key={dateKey} className="border border-input rounded-lg overflow-hidden bg-background shadow-sm">
                                    <AccordionTrigger className="p-4 text-lg hover:no-underline data-[state=open]:bg-muted/50">
                                        <div className="flex justify-between w-full pr-4 items-center">
                                            <span className="font-semibold text-destructive">{format(new Date(dateKey), 'EEEE, dd MMMM yyyy')}</span>
                                            <div className="flex gap-4 text-sm font-normal">
                                                <span className="text-green-600">Cash: PKR {dayData.totals.cashSalesAmount.toLocaleString(undefined, {minimumFractionDigits: 0})}</span>
                                                <span className="text-blue-600">Credit: PKR {dayData.totals.creditSalesAmount.toLocaleString(undefined, {minimumFractionDigits: 0})}</span>
                                                <span className="font-bold">Total: PKR {(dayData.totals.cashSalesAmount + dayData.totals.creditSalesAmount).toLocaleString(undefined, {minimumFractionDigits: 0})}</span>
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-4 bg-muted/20 space-y-6">
                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="text-destructive">Daily Sales Summary</CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-0">
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
                                                                            <span className={cn(
                                                                                row.fuelType.toLowerCase().includes('diesel') && 'text-green-600',
                                                                                (row.fuelType.toLowerCase().includes('unleaded') || row.fuelType.toLowerCase().includes('premium')) && 'text-destructive'
                                                                            )}>
                                                                                {row.fuelType}
                                                                            </span>
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
                                            </CardContent>
                                        </Card>
                                         {dayData.comparisonSummary && dayData.comparisonSummary.length > 0 && (
                                            <Card>
                                                <CardHeader>
                                                    <CardTitle>Sales vs. Dispensed Volume Verification for {format(new Date(dateKey), 'dd-MMM-yyyy')}</CardTitle>
                                                </CardHeader>
                                                <CardContent className="p-0">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Fuel Type</TableHead>
                                                                <TableHead className="text-right">Invoice Sales (Ltr)</TableHead>
                                                                <TableHead className="text-right">Machine Dispensed (Ltr)</TableHead>
                                                                <TableHead className="text-right">Variance (Dispensed - Sales)</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {dayData.comparisonSummary.map(summary => (
                                                                <TableRow key={summary.fuelType}>
                                                                    <TableCell className="font-medium">
                                                                        <span className={cn(
                                                                            summary.fuelType.toLowerCase().includes('diesel') && 'text-green-600',
                                                                            (summary.fuelType.toLowerCase().includes('unleaded') || summary.fuelType.toLowerCase().includes('premium')) && 'text-destructive'
                                                                        )}>
                                                                            {summary.fuelType}
                                                                        </span>
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-mono">{summary.sales.toFixed(2)}</TableCell>
                                                                    <TableCell className="text-right font-mono">{summary.dispensed.toFixed(2)}</TableCell>
                                                                    <TableCell className={`text-right font-mono font-semibold ${summary.difference > 0.01 ? 'text-green-600' : summary.difference < -0.01 ? 'text-destructive' : ''}`}>
                                                                        {summary.difference.toFixed(2)}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </CardContent>
                                            </Card>
                                        )}
                                        {dayData.machineReadings && dayData.machineReadings.length > 0 && (
                                            <Card>
                                                <CardHeader>
                                                    <CardTitle>Machine Reading Details for {format(new Date(dateKey), 'dd-MMM-yyyy')}</CardTitle>
                                                </CardHeader>
                                                <CardContent className="p-0">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Machine Name</TableHead>
                                                                <TableHead className="text-right">Start of Day Reading</TableHead>
                                                                <TableHead className="text-right">End of Day Reading</TableHead>
                                                                <TableHead className="text-center">Actions</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {dayData.machineReadings.map(reading => (
                                                                <TableRow key={reading.id}>
                                                                    <TableCell>
                                                                        <span className={cn(
                                                                            reading.fuelType.toLowerCase().includes('diesel') && 'text-green-600',
                                                                            (reading.fuelType.toLowerCase().includes('unleaded') || reading.fuelType.toLowerCase().includes('premium')) && 'text-destructive'
                                                                        )}>
                                                                            {reading.machineName}
                                                                        </span>
                                                                        {' '}
                                                                        (<span className={cn(
                                                                            reading.fuelType.toLowerCase().includes('diesel') && 'text-green-600',
                                                                            (reading.fuelType.toLowerCase().includes('unleaded') || reading.fuelType.toLowerCase().includes('premium')) && 'text-destructive'
                                                                        )}>{reading.fuelType}</span>)
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-mono">
                                                                        <div>{reading.previousReadingVolume?.toFixed(2) ?? 'N/A'}</div>
                                                                        {reading.previousReadingTimestamp && (
                                                                            <div className="text-xs text-muted-foreground">{format(new Date(reading.previousReadingTimestamp), 'dd-MMM-yy hh:mm a')}</div>
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-mono">
                                                                        <div>{reading.volume.toFixed(2)}</div>
                                                                        {reading.timestamp && (
                                                                            <div className="text-xs text-muted-foreground">{format(new Date(reading.timestamp), 'dd-MMM-yy hh:mm a')}</div>
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell className="text-center">
                                                                        <Button variant="ghost" size="icon" title="Edit" onClick={() => setReadingToEdit(reading)}>
                                                                            <Pencil className="w-4 h-4" />
                                                                        </Button>
                                                                        <Button variant="ghost" size="icon" title="Delete" onClick={() => setReadingToDelete(reading)}>
                                                                            <Trash2 className="w-4 h-4 text-destructive" />
                                                                        </Button>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </CardContent>
                                            </Card>
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
                                {isLoaded ? 'No Sales Data' : 'Loading Report...'
                            }
                            </h3>
                            <p>{isLoaded ? 'There are no sales transactions for the selected period.' : 'Please wait while the data is being loaded.'}</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>

        <AlertDialog open={!!readingToDelete} onOpenChange={(isOpen) => !isOpen && setReadingToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This will move the machine reading to the recycle bin.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteReading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Yes, delete reading
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <Dialog open={!!readingToEdit} onOpenChange={(isOpen) => !isOpen && setReadingToEdit(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Machine Reading for {readingToEdit?.machineName}</DialogTitle>
                    <DialogDescription>
                        Update the closing reading volume and date.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmitReading(onEditReadingSubmit)}>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-reading-volume">Volume</Label>
                            <Input id="edit-reading-volume" type="number" step="any" {...registerReading('volume')} />
                            {readingErrors.volume && <p className="text-sm text-destructive">{readingErrors.volume.message}</p>}
                        </div>
                            <div className="space-y-2">
                            <Label>Date</Label>
                            <Controller
                                name="date"
                                control={controlReading}
                                render={({ field }) => (
                                    <Popover open={editDatePopoverOpen} onOpenChange={setEditDatePopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar 
                                                mode="single" 
                                                selected={field.value} 
                                                onSelect={(date) => {
                                                    field.onChange(date);
                                                    setEditDatePopoverOpen(false);
                                                }} 
                                                initialFocus 
                                            />
                                        </PopoverContent>
                                    </Popover>
                                )}
                            />
                            {readingErrors.date && <p className="text-sm text-destructive">{readingErrors.date.message}</p>}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setReadingToEdit(null)}>Cancel</Button>
                        <Button type="submit">Save Changes</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
        </>
    );
}