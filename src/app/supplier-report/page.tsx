
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDatabase } from '@/hooks/use-database';
import { FileText, Printer, Search, Calendar as CalendarIcon } from 'lucide-react';
import type { Supplier, DateRange } from '@/lib/types';
import { format, startOfDay, endOfDay, isValid } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';


const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      aria-hidden="true"
      fill="currentColor"
      viewBox="0 0 448 512"
      {...props}
    >
      <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 .9c34.9 0 67.7 13.5 92.8 38.6 25.1 25.1 38.6 57.9 38.6 92.8 0 97.8-79.7 177.6-177.6 177.6-34.9 0-67.7-13.5-92.8-38.6s-38.6-57.9-38.6-92.8c0-97.8 79.7-177.6 177.6-177.6zm93.8 148.6c-3.3-1.5-19.8-9.8-23-11.5s-5.5-2.5-7.8 2.5c-2.3 5-8.7 11.5-10.7 13.8s-3.9 2.5-7.3 1c-3.3-1.5-14-5.2-26.6-16.5c-9.9-8.9-16.5-19.8-18.5-23s-2-5.5-.6-7.5c1.4-2 3-3.3 4.5-5.2s3-4.2 4.5-7.1c1.5-2.8.8-5.2-.4-6.8s-7.8-18.5-10.7-25.4c-2.8-6.8-5.6-5.8-7.8-5.8s-4.5-.4-6.8-.4-7.8 1.1-11.8 5.5c-4 4.4-15.2 14.8-15.2 36.1s15.5 41.9 17.5 44.8c2 2.8 30.4 46.4 73.8 65.4 10.8 4.8 19.3 7.6 25.9 9.8s11.1 1.5 15.2 1c4.8-.7 19.8-8.2 22.5-16.1s2.8-14.8 2-16.1c-.8-1.5-3.3-2.5-6.8-4z"></path>
    </svg>
);


interface ReportRow {
    id: string;
    supplier: Supplier;
    previousBalance: number;
    purchaseAmount: number;
    purchaseVolume: number;
    payment: number;
    currentBalance: number;
}

export default function SupplierReportPage() {
    const { suppliers, purchases, supplierPayments, isLoaded, dateRange, setDateRange } = useDatabase();
    const [selectedSupplierId, setSelectedSupplierId] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    const reportData = useMemo(() => {
        if (!isLoaded) return [];

        let targetSuppliers = suppliers;
        if (selectedSupplierId !== 'all') {
            targetSuppliers = suppliers.filter(c => c.id === selectedSupplierId);
        }

        const from = dateRange?.from ? startOfDay(dateRange.from) : null;
        const to = dateRange?.to ? endOfDay(dateRange.to) : (from ? endOfDay(from) : null);

        const report: ReportRow[] = targetSuppliers.map(supplier => {
            
            const openingBalance = 
              purchases.filter(p => p.supplierId === supplier.id && from && new Date(p.timestamp) < from)
                       .reduce((sum, p) => sum + p.totalCost, 0) -
              supplierPayments.filter(p => p.supplierId === supplier.id && from && new Date(p.timestamp) < from)
                            .reduce((sum, p) => sum + p.amount, 0);

            const filterByDateRange = (item: { timestamp: string }) => {
                if (!from || !to) return true;
                const itemDate = new Date(item.timestamp);
                return isValid(itemDate) && itemDate >= from && itemDate <= to;
            }
            
            const allPurchases = purchases.filter(p => p.supplierId === supplier.id && filterByDateRange(p));
            const allPayments = supplierPayments.filter(p => p.supplierId === supplier.id && filterByDateRange(p));
            
            const totalCredit = allPurchases.reduce((sum, p) => sum + p.totalCost, 0);
            const totalDebit = allPayments.reduce((sum, p) => sum + p.amount, 0);
            const currentBalance = openingBalance + totalCredit - totalDebit;

            return {
                id: supplier.id,
                supplier,
                previousBalance: openingBalance, 
                purchaseAmount: totalCredit,
                purchaseVolume: allPurchases.reduce((sum, p) => sum + p.volume, 0),
                payment: totalDebit,
                currentBalance,
            };
        }).filter(row => {
            if (selectedSupplierId !== 'all') return true;
            return row.currentBalance !== 0;
        });

        return report.sort((a,b) => a.supplier.name.localeCompare(b.supplier.name));

    }, [suppliers, purchases, supplierPayments, isLoaded, selectedSupplierId, dateRange]);
    
    const filteredReportData = useMemo(() => {
        if (!searchTerm) return reportData;
        return reportData.filter(row => 
            row.supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (row.supplier.contact && typeof row.supplier.contact === 'string' && row.supplier.contact.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [reportData, searchTerm]);

    const formatPhoneNumberForWhatsApp = (phone: string | number | undefined) => {
        if (!phone) return '';
        return String(phone).replace(/[^0-9]/g, '');
    }
    
    const generateWhatsAppMessage = (row: ReportRow) => {
        const message = `Dear ${row.supplier.name},
Your account summary:
Total Purchases: Rs. ${row.purchaseAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
Total Payments Made: Rs. ${row.payment.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
Net Balance: Rs. ${row.currentBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
Thank you,
Mianwali Petroleum Service`;
        return encodeURIComponent(message);
    }


    return (
        <div className="p-4 md:p-8 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText /> Supplier Report
                    </CardTitle>
                    <CardDescription>
                        View purchases, payments, and balances for suppliers.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="bg-muted p-4 rounded-lg flex flex-col md:flex-row items-center gap-4">
                        <div className="w-full md:w-auto flex-1">
                            <label className="text-sm font-medium">Supplier</label>
                            <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a supplier" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Suppliers</SelectItem>
                                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-full md:w-auto">
                            <label className="text-sm font-medium">Date Range</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        id="date"
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !dateRange && "text-muted-foreground"
                                        )}
                                        >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange?.from ? (
                                            dateRange.to ? (
                                            <>
                                                {format(dateRange.from, "dd-MMM-yyyy")} -{" "}
                                                {format(dateRange.to, "dd-MMM-yyyy")}
                                            </>
                                            ) : (
                                            format(dateRange.from, "dd-MMM-yyyy")
                                            )
                                        ) : (
                                            <span>Pick a date range</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                    <Calendar
                                        key="supplier-report-calendar"
                                        initialFocus
                                        mode="range"
                                        defaultMonth={dateRange?.from}
                                        selected={dateRange}
                                        onSelect={setDateRange}
                                        numberOfMonths={2}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </CardContent>
            </Card>
             <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search by name or contact..." className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Supplier Name</TableHead>
                                    <TableHead>Contact</TableHead>
                                    <TableHead className="text-right">Total Purchases (Amt)</TableHead>
                                    <TableHead className="text-right">Total Purchases (Ltr)</TableHead>
                                    <TableHead className="text-right">Total Payment Made</TableHead>
                                    <TableHead className="text-right">Current Balance</TableHead>
                                    <TableHead className="text-center">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoaded && filteredReportData.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell className="font-medium">{row.supplier.name}</TableCell>
                                        <TableCell>{row.supplier.contact || 'N/A'}</TableCell>
                                        <TableCell className="text-right font-mono text-green-600">{row.purchaseAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right font-mono text-green-600">{row.purchaseVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right font-mono text-destructive">{row.payment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        <TableCell className={`text-right font-bold font-mono ${row.currentBalance >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                                            {row.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {row.supplier.contact && (
                                                <Button asChild variant="ghost" size="icon" className="text-green-500 hover:text-green-600" title={`Message ${row.supplier.name} on WhatsApp`}>
                                                    <a href={`https://wa.me/${formatPhoneNumberForWhatsApp(row.supplier.contact)}?text=${generateWhatsAppMessage(row)}`} target="_blank" rel="noopener noreferrer">
                                                        <WhatsAppIcon className="w-5 h-5" />
                                                    </a>
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    {!isLoaded && <p className="text-center p-8 text-muted-foreground">Loading report data...</p>}
                    {isLoaded && filteredReportData.length === 0 && <p className="text-center p-8 text-muted-foreground">No matching records found.</p>}
                </CardContent>
             </Card>
        </div>
    );
}
