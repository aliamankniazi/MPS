
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDatabase } from '@/hooks/use-database';
import { format, startOfDay, endOfDay, isValid } from 'date-fns';
import { UserX, Printer, Search, Pencil, CreditCard, Download } from 'lucide-react';
import type { Customer } from '@/lib/types';
import Link from 'next/link';
import { DateRangePicker } from '@/components/date-range-picker';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';


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
    customer: Customer;
    previousBalance: number;
    sale: number;
    recovery: number;
    currentBalance: number;
    lastTransactionDate: Date | null;
}

export default function CreditRecoveryPage() {
    const { customers, transactions, customerPayments, cashAdvances, isLoaded, dateRange, setDateRange } = useDatabase();
    const [selectedCustomerId, setSelectedCustomerId] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    const reportData = useMemo(() => {
        if (!isLoaded) return [];

        let targetCustomers = customers;
        if (selectedCustomerId !== 'all') {
            targetCustomers = customers.filter(c => c.id === selectedCustomerId);
        }

        const from = dateRange?.from ? startOfDay(dateRange.from) : null;
        const to = dateRange?.to ? endOfDay(dateRange.to) : (from ? endOfDay(from) : null);

        const report: ReportRow[] = targetCustomers.map(customer => {
            const customerOpeningBalance = customer.openingBalance || 0;
            
            const allCustomerEntries = [
                ...transactions.filter(tx => tx.customerId === customer.id),
                ...cashAdvances.filter(ca => ca.customerId === customer.id),
                ...customerPayments.filter(p => p.customerId === customer.id)
            ];

            const lastTransactionDate = allCustomerEntries.length > 0
                ? allCustomerEntries.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                                    .map(e => new Date(e.timestamp))
                                    .find(d => isValid(d)) || null
                : null;

            const openingBalance = customerOpeningBalance +
              transactions.filter(tx => tx.customerId === customer.id && from && new Date(tx.timestamp) < from)
                          .reduce((sum, tx) => sum + tx.totalAmount, 0) +
              cashAdvances.filter(ca => ca.customerId === customer.id && from && new Date(ca.timestamp) < from)
                          .reduce((sum, ca) => sum + ca.amount, 0) -
              customerPayments.filter(p => p.customerId === customer.id && from && new Date(p.timestamp) < from)
                          .reduce((sum, p) => sum + p.amount, 0);

            const filterByDateRange = (item: { timestamp: string }) => {
                if (!from || !to) return true;
                const itemDate = new Date(item.timestamp);
                return isValid(itemDate) && itemDate >= from && itemDate <= to;
            }

            const totalSales = transactions
                .filter(tx => tx.customerId === customer.id && filterByDateRange(tx))
                .reduce((sum, tx) => sum + tx.totalAmount, 0);

            const totalCashAdvances = cashAdvances
                .filter(ca => ca.customerId === customer.id && filterByDateRange(ca))
                .reduce((sum, ca) => sum + ca.amount, 0);
            
            const totalDebit = totalSales + totalCashAdvances;

            const totalRecovery = customerPayments
                .filter(p => p.customerId === customer.id && filterByDateRange(p))
                .reduce((sum, p) => sum + p.amount, 0);
            
            const currentBalance = openingBalance + totalDebit - totalRecovery;

            return {
                id: customer.id,
                customer,
                previousBalance: openingBalance,
                sale: totalDebit,
                recovery: totalRecovery,
                currentBalance,
                lastTransactionDate,
            };
        }).filter(row => {
            if (selectedCustomerId !== 'all') return true;

            // If a date range is selected, only show customers with a sale or recovery in that range.
            if (from && to) {
                 const hasActivityInRange = 
                    transactions.some(tx => tx.customerId === row.id && isValid(new Date(tx.timestamp)) && new Date(tx.timestamp) >= from && new Date(tx.timestamp) <= to) ||
                    customerPayments.some(p => p.customerId === row.id && isValid(new Date(p.timestamp)) && new Date(p.timestamp) >= from && new Date(p.timestamp) <= to) ||
                    cashAdvances.some(ca => ca.customerId === row.id && isValid(new Date(ca.timestamp)) && new Date(ca.timestamp) >= from && new Date(ca.timestamp) <= to);
                return hasActivityInRange;
            }

            // If no date range, show customers with an outstanding balance
            return row.currentBalance > 0;
        });

        return report.sort((a,b) => a.customer.name.localeCompare(b.customer.name));

    }, [customers, transactions, customerPayments, cashAdvances, isLoaded, selectedCustomerId, dateRange]);
    
    const filteredReportData = useMemo(() => {
        if (!searchTerm) return reportData;
        return reportData.filter(row => 
            row.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (row.customer.contact && typeof row.customer.contact === 'string' && row.customer.contact.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [reportData, searchTerm]);

    const formatPhoneNumberForWhatsApp = (phone: string | number) => {
        if (typeof phone !== 'string') return '';
        return phone.replace(/[^0-9]/g, '');
    }
    
    const handleExportExcel = () => {
        const dataToExport = filteredReportData.map(row => ({
            'Customer Name': row.customer.name,
            'Area': row.customer.area || 'N/A',
            'Mobile': row.customer.contact,
            'Opening Balance (PKR)': row.previousBalance.toFixed(2),
            'Total Sale (PKR)': row.sale.toFixed(2),
            'Total Recovery (PKR)': row.recovery.toFixed(2),
            'Current Balance (PKR)': row.currentBalance.toFixed(2),
        }));
        
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'CreditRecoveryReport');
        XLSX.writeFile(workbook, 'CreditRecoveryReport.xlsx');
    };

    const generateWhatsAppMessage = (row: ReportRow) => {
        const formatCurrency = (amount: number) => amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        const period = dateRange?.from 
            ? (dateRange.to ? `${format(dateRange.from, 'MMM dd, yyyy')} to ${format(dateRange.to, 'MMM dd, yyyy')}` : format(dateRange.from, 'MMM dd, yyyy'))
            : 'all time';

        const message = `As-Salaam-Alaikum, Dear ${row.customer.name},
For Period: ${period}
Your Previous Amount: ${formatCurrency(row.previousBalance)}
New Sale Amount: ${formatCurrency(row.sale)}
Paid Amount: ${formatCurrency(row.recovery)}
Now your balance is: ${formatCurrency(row.currentBalance)}
Thank You,
Mianwali Petroleum Service`;

        return encodeURIComponent(message);
    }


    return (
        <div className="p-4 md:p-8 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CreditCard /> Customer Sale and Recovery Report
                    </CardTitle>
                    <CardDescription>
                        Review customer sales, recoveries, and balances for the selected period.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="bg-muted p-4 rounded-lg flex flex-col md:flex-row items-center gap-4">
                        <div className="w-full md:w-auto flex-1">
                            <label className="text-sm font-medium">Customer</label>
                            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a customer" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Customers</SelectItem>
                                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-full md:w-auto flex-1">
                             <label className="text-sm font-medium">Date Range</label>
                            <DateRangePicker date={dateRange} onDateChange={setDateRange} className="w-full" />
                        </div>
                    </div>
                </CardContent>
            </Card>
             <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="Search records by name or contact..." 
                                className="pl-10"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print</Button>
                            <Button variant="outline" onClick={handleExportExcel}><Download className="mr-2 h-4 w-4"/> Excel</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">No</TableHead>
                                    <TableHead>Customer Name/Code</TableHead>
                                    <TableHead>Area</TableHead>
                                    <TableHead>Mobile</TableHead>
                                    <TableHead className="text-right">Opening Balance</TableHead>
                                    <TableHead className="text-right">Total Sale</TableHead>
                                    <TableHead className="text-right">Total Recovery</TableHead>
                                    <TableHead className="text-right">Current Balance</TableHead>
                                    <TableHead className="text-center">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoaded && filteredReportData.map((row, index) => (
                                    <TableRow key={row.id}>
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell className="font-medium">{row.customer.name}</TableCell>
                                        <TableCell>{row.customer.area || 'N/A'}</TableCell>
                                        <TableCell>{row.customer.contact}</TableCell>
                                        <TableCell className="text-right font-mono">{row.previousBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right font-mono text-destructive">{row.sale.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right font-mono text-green-600">{row.recovery.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        <TableCell className={`text-right font-bold font-mono ${row.currentBalance < 0 ? 'text-green-600' : 'text-destructive'}`}>
                                            {row.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Button asChild variant="ghost" size="icon" title="Edit Customer">
                                                <Link href="/customers">
                                                    <Pencil className="w-4 h-4" />
                                                </Link>
                                            </Button>
                                            {row.customer.contact && (
                                                <Button asChild variant="ghost" size="icon" className="text-green-500 hover:text-green-600" title={`Message ${row.customer.name} on WhatsApp`}>
                                                    <a 
                                                        href={`https://wa.me/${formatPhoneNumberForWhatsApp(row.customer.contact)}?text=${generateWhatsAppMessage(row)}`}
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                    >
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
