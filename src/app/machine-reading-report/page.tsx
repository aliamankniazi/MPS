
'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isValid, startOfDay, endOfDay } from 'date-fns';
import { Fuel, Search, Download, Printer, BarChart2 } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/date-range-picker';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import * as XLSX from 'xlsx';
import type { MachineReading, Transaction } from '@/lib/types';
import { cn } from '@/lib/utils';


interface ProcessedReading extends MachineReading {
    previousReadingVolume?: number;
    previousReadingTimestamp?: string;
    dispensed: number;
}

interface ComparisonSummary {
    fuelType: string;
    sales: number;
    dispensed: number;
    difference: number;
}

type GroupedReport = {
    [dateKey: string]: {
        machineReadings: ProcessedReading[];
        comparisonSummary: ComparisonSummary[];
    }
};


export default function MachineReadingReportPage() {
    const { 
        transactions, 
        machineReadings, 
        machines,
        isLoaded, 
        dateRange, 
        setDateRange,
    } = useDatabase();
    const [searchTerm, setSearchTerm] = useState('');

    const groupedReportData: GroupedReport = useMemo(() => {
        if (!isLoaded || !machines.length || !dateRange?.from) return {};

        const from = startOfDay(dateRange.from);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);

        const result: GroupedReport = {};

        // Create a set of dates from all readings and transactions to iterate over
        const allDates = new Set<string>();
        [...machineReadings, ...transactions].forEach(item => {
            const itemDate = new Date(item.timestamp);
            if (isValid(itemDate) && itemDate >= from && itemDate <= to) {
                allDates.add(format(itemDate, 'yyyy-MM-dd'));
            }
        });

        const sortedDates = Array.from(allDates).sort((a,b) => new Date(b).getTime() - new Date(a).getTime());

        for (const dateKey of sortedDates) {
            const dayStart = startOfDay(new Date(dateKey));
            const dayEnd = endOfDay(new Date(dateKey));

            const readingsOnDay = machineReadings.filter(r => {
                const readingDate = new Date(r.timestamp);
                return isValid(readingDate) && readingDate >= dayStart && readingDate <= dayEnd;
            });
            
            const salesOnDay = transactions.filter(tx => {
                const saleDate = new Date(tx.timestamp);
                return isValid(saleDate) && saleDate >= dayStart && saleDate <= dayEnd;
            });

            if (readingsOnDay.length === 0 && salesOnDay.length === 0) {
                continue;
            }

            const uniqueMachineNamesForDay = [...new Set(readingsOnDay.map(r => r.machineName))];
            
            const processedReadings: ProcessedReading[] = uniqueMachineNamesForDay.map(machineName => {
                const machine = machines.find(m => m.name === machineName);
                if (!machine) return null;

                const readingsForMachineOnDay = readingsOnDay
                    .filter(r => r.machineName === machineName)
                    .sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                if (readingsForMachineOnDay.length === 0) return null;

                const latestReadingForDay = readingsForMachineOnDay[readingsForMachineOnDay.length - 1];

                const previousReading = machineReadings
                    .filter(r => r.machineName === machineName && new Date(r.timestamp) < dayStart)
                    .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                
                const startReadingForDay = readingsForMachineOnDay[0];

                const openingReading = previousReading || startReadingForDay;
                const closingReading = latestReadingForDay;

                let dispensed = 0;
                if (openingReading && closingReading && openingReading.id !== closingReading.id) {
                     dispensed = closingReading.volume - openingReading.volume;
                }
                
                return {
                    ...closingReading,
                    previousReadingVolume: openingReading?.volume,
                    previousReadingTimestamp: openingReading?.timestamp,
                    dispensed: dispensed > 0 ? dispensed : 0,
                };
            }).filter((r): r is ProcessedReading => r !== null);


            const salesSummaryByFuel = salesOnDay
                .filter(tx => tx.fuelType && tx.volume)
                .reduce((acc, tx) => {
                    acc[tx.fuelType] = (acc[tx.fuelType] || 0) + tx.volume;
                    return acc;
            }, {} as Record<string, number>);

            const dispensedSummaryByFuel = processedReadings.reduce((acc, reading) => {
                acc[reading.fuelType] = (acc[reading.fuelType] || 0) + reading.dispensed;
                return acc;
            }, {} as Record<string, number>);

            const allFuelTypesInDay = [...new Set([...Object.keys(salesSummaryByFuel), ...Object.keys(dispensedSummaryByFuel)])];

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

            if (searchTerm) {
                if (!processedReadings.some(r => r.machineName.toLowerCase().includes(searchTerm.toLowerCase()) || r.fuelType.toLowerCase().includes(searchTerm.toLowerCase())) &&
                    !comparisonSummary.some(c => c.fuelType.toLowerCase().includes(searchTerm.toLowerCase()))) {
                    continue;
                }
            }

            result[dateKey] = { machineReadings: processedReadings, comparisonSummary };
        }

        return result;

    }, [isLoaded, transactions, machineReadings, machines, dateRange, searchTerm]);

    const sortedDateKeys = useMemo(() => {
        return Object.keys(groupedReportData).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [groupedReportData]);
    
    const handleExportExcel = () => {
        const dataToExport = sortedDateKeys.flatMap(dateKey => {
            const dayData = groupedReportData[dateKey];
            if (!dayData) return [];
            
            const machineRows = dayData.machineReadings.map(row => ({
                'Date': format(new Date(dateKey), 'dd-MMM-yyyy'),
                'Description': `Reading: ${row.machineName}`,
                'Fuel Type': row.fuelType,
                'Start Reading': row.previousReadingVolume?.toFixed(2) || 'N/A',
                'End Reading': row.volume.toFixed(2),
                'Dispensed (Ltr)': row.dispensed.toFixed(2),
                'Sales (Ltr)': '',
                'Variance': '',
            }));

            const summaryRows = dayData.comparisonSummary.map(row => ({
                'Date': format(new Date(dateKey), 'dd-MMM-yyyy'),
                'Description': `Summary: ${row.fuelType}`,
                'Fuel Type': row.fuelType,
                'Start Reading': '',
                'End Reading': '',
                'Dispensed (Ltr)': row.dispensed.toFixed(2),
                'Sales (Ltr)': row.sales.toFixed(2),
                'Variance': row.difference.toFixed(2),
            }));

            return [...machineRows, ...summaryRows];
        });
        
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'MachineReadingReport');
        XLSX.writeFile(workbook, 'MachineReadingReport.xlsx');
    };

    return (
        <div className="p-4 md:p-8">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Fuel /> Machine Reading &amp; Sales Verification Report
                            </CardTitle>
                            <CardDescription>
                                Unit-wise and product-wise readings, dispensed volume, and sales variance.
                            </CardDescription>
                        </div>
                         <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search..."
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
                     <Accordion type="multiple" className="w-full space-y-4" defaultValue={sortedDateKeys}>
                        {isLoaded && sortedDateKeys.length > 0 ? sortedDateKeys.map(dateKey => {
                            const dayData = groupedReportData[dateKey];
                            if (!dayData) return null;

                            return (
                            <AccordionItem value={dateKey} key={dateKey} className="border border-input rounded-lg overflow-hidden bg-background shadow-sm">
                                <AccordionTrigger className="p-4 text-lg hover:no-underline data-[state=open]:bg-muted/50">
                                    <div className="flex justify-between w-full pr-4 items-center">
                                        <span className="font-semibold text-primary">{format(new Date(dateKey), 'EEEE, dd MMMM yyyy')}</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-4 pb-4 bg-background space-y-6">
                                    <div>
                                        <h4 className="font-semibold text-md mb-2">Machine Reading Details</h4>
                                        <div className="border rounded-md">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Machine Name</TableHead>
                                                        <TableHead>Fuel Type</TableHead>
                                                        <TableHead className="text-right">Start of Day Reading</TableHead>
                                                        <TableHead className="text-right">End of Day Reading</TableHead>
                                                        <TableHead className="text-right">Dispensed Volume</TableHead>
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
                                                            </TableCell>
                                                            <TableCell>
                                                                <span className={cn(
                                                                    reading.fuelType.toLowerCase().includes('diesel') && 'text-green-600',
                                                                    (reading.fuelType.toLowerCase().includes('unleaded') || reading.fuelType.toLowerCase().includes('premium')) && 'text-destructive'
                                                                )}>
                                                                    {reading.fuelType}
                                                                </span>
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
                                                            <TableCell className="text-right font-mono font-semibold">{reading.dispensed.toFixed(2)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-md mb-2">Sales vs. Dispensed Volume Verification</h4>
                                        <div className="border rounded-md">
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
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                            );
                        }) : (
                             <div className="text-center p-8 text-muted-foreground">
                                {isLoaded ? 'No reading data found for the selected period.' : 'Loading report data...'}
                            </div>
                        )}
                    </Accordion>
                </CardContent>
            </Card>
        </div>
    );
}
