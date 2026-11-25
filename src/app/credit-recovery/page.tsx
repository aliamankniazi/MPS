'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDatabase } from '@/hooks/use-database';
import { describeRow, lastActivity, ledgerOf, statementFor } from '@/lib/customer-ledger';
import { format, startOfDay, endOfDay, isValid, isSameDay } from 'date-fns';
import { UserX, Printer, Search, Pencil, CreditCard, Download } from 'lucide-react';
import type { Customer } from '@/lib/types';
import Link from 'next/link';
import { DateRangePicker } from '@/components/date-range-picker';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
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
    customer: Customer;
    previousBalance: number;
    sale: number;
    recovery: number;
    currentBalance: number;
    lastTransactionDate: Date | null;
    periodItems: { date: Date | null; desc: string; amount: number; type: 'debit' | 'credit' }[];
}

export default function CreditRecoveryPage() {
    const { customers, customerLedgerBook, isLoaded, dateRange, setDateRange } = useDatabase();
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
            // The one calculation (lib/customer-ledger.ts). The period opens on the balance before it and
            // closes on the balance as of its last day: the same figures the customer's ledger shows.
            const ledger = ledgerOf(customerLedgerBook, customer.id);
            const statement = statementFor(ledger, { from, to });

            const periodItems = statement.rows.flatMap(row => {
                const date = row.dated ? new Date(row.time) : null;
                const note = row.original?.notes && (row.kind === 'credit-sale' || row.kind === 'cash-sale') ? ` (${row.original.notes})` : '';
                const items: ReportRow['periodItems'] = [];
                if (row.debit > 0) items.push({ date, desc: describeRow(row) + note, amount: row.debit, type: 'debit' });
                if (row.credit > 0) items.push({ date, desc: row.kind === 'cash-sale' ? 'Paid at the time of sale' : describeRow(row), amount: row.credit, type: 'credit' });
                return items;
            });

            return {
                id: customer.id,
                customer,
                previousBalance: statement.openingBalance,
                sale: statement.totalDebit,
                recovery: statement.totalCredit,
                currentBalance: statement.closingBalance,
                lastTransactionDate: lastActivity(ledger),
                periodItems,
            };
        }).filter(row => {
            if (selectedCustomerId !== 'all') return true;

            // If a date range is selected, only show customers with a sale or recovery in that range.
            if (from && to) {
                 const hasActivityInRange = row.periodItems.length > 0;
                return hasActivityInRange;
            }

            // If no date range, show customers with an outstanding balance
            return row.currentBalance > 0;
        });

        return report.sort((a,b) => a.customer.name.localeCompare(b.customer.name));

    }, [customers, customerLedgerBook, isLoaded, selectedCustomerId, dateRange]);
    
    const filteredReportData = useMemo(() => {
        if (!searchTerm) return reportData;
        return reportData.filter(row => 
            row.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (row.customer.contact && typeof row.customer.contact === 'string' && row.customer.contact.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [reportData, searchTerm]);

    const formatPhoneNumberForWhatsApp = (phone: string) => {
        if (!phone) return '';
        return phone.replace(/[^0-9]/g, '');
    };
    
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
            ? (dateRange.to && !isSameDay(dateRange.from, dateRange.to) ? `${format(dateRange.from, 'dd MMM, yyyy')} to ${format(dateRange.to, 'dd MMM, yyyy')}` : format(dateRange.from, 'dd MMM, yyyy'))
            : 'all time';

        let breakdown = '';
        if (row.periodItems.length > 0) {
            breakdown = '\n\nTransactions Detail:';
            row.periodItems.forEach(item => {
                const sign = item.type === 'debit' ? '+' : '-';
                breakdown += `\n${item.date ? format(item.date, 'dd-MMM') : 'No date'}: ${item.desc} [${sign}${formatCurrency(item.amount)}]`;
            });
        }

        const message = `As-Salaam-Alaikum, Dear ${row.customer.name},
For Period: ${period}
Your Previous Amount: ${formatCurrency(row.previousBalance)}
New Sale Amount: ${formatCurrency(row.sale)}
Paid Amount: ${formatCurrency(row.recovery)}${breakdown}
Now your balance is: ${formatCurrency(row.currentBalance)}

Thank You,
Mianwali Petroleum Service
Ballo Khel Road Mianwali
And Contact Us Through Whatsapp on +971569178225
Account Number:- PK26UNIL0109000337274268
Title Of Account:- Mianwali Petroleum Service 
Bank Name:- UBL 
And Also Use Account Number As A Raast ID`;

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
                        <div className="relative w-full max-sm:max-w-sm">
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
                                        <TableCell className={cn("font-medium", row.currentBalance > 0 ? 'text-destructive' : 'text-green-800')}>{row.customer.name}</TableCell>
                                        <TableCell>{row.customer.area || 'N/A'}</TableCell>
                                        <TableCell>{row.customer.contact}</TableCell>
                                        <TableCell className={cn("text-right font-mono", row.previousBalance > 0 ? 'text-destructive' : 'text-green-800')}>{row.previousBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right font-mono text-destructive">{row.sale.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right font-mono text-green-800">{row.recovery.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        <TableCell className={`text-right font-bold font-mono ${row.currentBalance < 0 ? 'text-green-800' : 'text-destructive'}`}>
                                            {row.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Button asChild variant="ghost" size="icon" title="Edit Customer">
                                                <Link href="/customers">
                                                    <Pencil className="w-4 h-4" />
                                                </Link>
                                            </Button>
                                            {row.customer.contact &&
                                                String(row.customer.contact)
                                                .split(/[,\n]/)
                                                .map((phone) => phone.trim())
                                                .filter(Boolean)
                                                .map((phone, index) => (
                                                    <Button
                                                        asChild
                                                        key={index}
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-green-500 hover:text-green-600"
                                                        title={`Message on WhatsApp: ${phone}`}
                                                    >
                                                        <a
                                                            href={`https://wa.me/${formatPhoneNumberForWhatsApp(phone)}?text=${generateWhatsAppMessage(row)}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            <WhatsAppIcon className="w-5 h-5" />
                                                        </a>
                                                    </Button>
                                                ))}
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
