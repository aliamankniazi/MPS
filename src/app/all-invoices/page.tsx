
'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isValid, startOfDay, endOfDay } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { FileText, XCircle, Printer, Search, Download, Calendar as CalendarIcon, Pencil } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Transaction, Purchase, DateRange } from '@/lib/types';
import Link from 'next/link';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';


type CombinedInvoice = {
  id: string;
  originalId: string;
  timestamp: string;
  type: 'Sale' | 'Purchase';
  partner: string;
  details: string;
  amount: number;
  paymentMethod?: string;
  isCreditSale?: boolean;
};

type GroupedInvoices = {
  [key: string]: {
    invoices: CombinedInvoice[];
    totalSales: number;
    totalPurchases: number;
  };
};

export default function AllInvoicesPage() {
  const { transactions, purchases, isLoaded, colorSettings, dateRange, setDateRange } = useDatabase();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const allInvoicesForExport = useMemo(() => {
    if (!isLoaded) return [];

    let allTransactions = transactions;
    let allPurchases = purchases;

    if (dateRange?.from) {
        const from = startOfDay(dateRange.from);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);

        const filterByDate = (items: any[]) => items.filter(item => {
            const itemDate = new Date(item.timestamp);
            return isValid(itemDate) && itemDate >= from && itemDate <= to;
        });

        allTransactions = filterByDate(transactions);
        allPurchases = filterByDate(purchases);
    }


    const salesInvoices: CombinedInvoice[] = allTransactions.map(tx => ({
      id: `sale-${tx.id}`,
      originalId: tx.id,
      timestamp: tx.timestamp,
      type: 'Sale',
      partner: tx.customerName || 'Walk-in Customer',
      details: tx.volume ? `${tx.volume.toFixed(2)}L of ${tx.fuelType}` : (tx.product || 'General Sale'),
      amount: tx.totalAmount,
      paymentMethod: tx.paymentMethod,
      isCreditSale: tx.paymentMethod === 'Credit',
    }));

    const purchaseInvoices: CombinedInvoice[] = allPurchases.map(p => ({
      id: `purchase-${p.id}`,
      originalId: p.id,
      timestamp: p.timestamp,
      type: 'Purchase',
      partner: p.supplier,
      details: p.volume ? `${p.volume.toFixed(2)}L of ${p.fuelType}` : p.fuelType,
      amount: p.totalCost,
    }));
    
    return [...salesInvoices, ...purchaseInvoices].sort((a, b) => {
        const dateA = new Date(a.timestamp);
        const dateB = new Date(b.timestamp);
        if (!isValid(dateA)) return 1;
        if (!isValid(dateB)) return -1;
        return dateB.getTime() - dateA.getTime();
      });

  }, [isLoaded, transactions, purchases, dateRange]);

  const groupedInvoices = useMemo(() => {
    let filtered = allInvoicesForExport;

    filtered = filtered.filter(invoice => {
        const searchMatch = !searchTerm ||
            invoice.partner.toLowerCase().includes(searchTerm.toLowerCase()) ||
            invoice.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
            invoice.details.toLowerCase().includes(searchTerm.toLowerCase());

        if (!searchMatch) return false;
        
        if (!typeFilter || typeFilter === 'all') return true;

        const invoiceTypeLabel = invoice.type === 'Sale' && invoice.isCreditSale ? 'Credit Sale' : invoice.type;
        return invoiceTypeLabel === typeFilter;
    });

    return filtered.reduce((acc, invoice) => {
        const date = new Date(invoice.timestamp);
        if (!isValid(date)) return acc;
        const monthKey = format(date, 'MMMM yyyy');
        
        if (!acc[monthKey]) {
            acc[monthKey] = { invoices: [], totalSales: 0, totalPurchases: 0 };
        }
        
        acc[monthKey].invoices.push(invoice);
        if(invoice.type === 'Sale') acc[monthKey].totalSales += invoice.amount;
        if(invoice.type === 'Purchase') acc[monthKey].totalPurchases += invoice.amount;

        return acc;
    }, {} as GroupedInvoices);

  }, [allInvoicesForExport, searchTerm, typeFilter]);
  
  const handleExportExcel = () => {
    const dataToExport = Object.values(groupedInvoices).flatMap(group => group.invoices)
        .map(invoice => ({
            'Date': isValid(new Date(invoice.timestamp)) ? format(new Date(invoice.timestamp), 'PP pp') : 'Invalid Date',
            'Type': invoice.type === 'Sale' && invoice.isCreditSale ? 'Credit Sale' : invoice.type,
            'Partner': invoice.partner,
            'Details': invoice.details,
            'Amount (PKR)': invoice.amount.toFixed(2),
        }));
    
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoices');
    XLSX.writeFile(workbook, 'AllInvoices.xlsx');
  };
  
  const getAmountClass = (invoice: CombinedInvoice) => {
    if (invoice.type === 'Purchase') return 'text-green-600';
    if (invoice.isCreditSale) return 'text-blue-600';
    return invoice.type === 'Sale' ? 'text-green-600' : 'text-destructive';
  };
  
  const monthKeys = Object.keys(groupedInvoices);

  return (
    <div className="p-4 md:p-8">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText /> All Invoices
              </CardTitle>
              <CardDescription>A list of all generated sales and purchase invoices, grouped by month.</CardDescription>
            </div>
             <div className="flex items-center gap-2 flex-wrap">
                 <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            id="date"
                            variant={"outline"}
                            className={cn(
                                "w-[260px] justify-start text-left font-normal",
                                !dateRange && "text-muted-foreground"
                            )}
                            >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange?.from ? (
                                dateRange.to ? (
                                <>
                                    {format(dateRange.from, "LLL dd, y")} -{" "}
                                    {format(dateRange.to, "LLL dd, y")}
                                </>
                                ) : (
                                format(dateRange.from, "LLL dd, y")
                                )
                            ) : (
                                <span>Pick a date range</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                            key="all-invoices-calendar"
                            initialFocus
                            mode="range"
                            defaultMonth={dateRange?.from}
                            selected={dateRange}
                            onSelect={setDateRange}
                            numberOfMonths={2}
                        />
                    </PopoverContent>
                </Popover>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by type..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="Sale">Sale</SelectItem>
                        <SelectItem value="Credit Sale">Credit Sale</SelectItem>
                        <SelectItem value="Purchase">Purchase</SelectItem>
                    </SelectContent>
                </Select>
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search invoices..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4"/> Print</Button>
                <Button variant="outline" onClick={handleExportExcel}><Download className="mr-2 h-4 w-4"/> Excel</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoaded && monthKeys.length > 0 ? (
             <Accordion type="multiple" className="w-full">
                {monthKeys.map(monthKey => (
                    <AccordionItem value={monthKey} key={monthKey}>
                        <AccordionTrigger className="hover:bg-muted/50 px-4 rounded-md">
                            <div className="flex justify-between w-full pr-4">
                                <span className="font-semibold text-lg">{monthKey}</span>
                                <div className="flex gap-4 text-sm">
                                    <span>Sales: <span className="font-mono text-green-600">PKR {groupedInvoices[monthKey].totalSales.toLocaleString()}</span></span>
                                    <span>Purchases: <span className="font-mono text-green-600">PKR {groupedInvoices[monthKey].totalPurchases.toLocaleString()}</span></span>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent>
                             <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead>Partner</TableHead>
                                  <TableHead>Details</TableHead>
                                  <TableHead className="text-right">Amount (PKR)</TableHead>
                                  <TableHead className="text-center">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {groupedInvoices[monthKey].invoices.map(invoice => {
                                  const date = new Date(invoice.timestamp);
                                  const typeLabel = invoice.type === 'Sale' && invoice.isCreditSale ? 'Credit Sale' : invoice.type;
                                  const color = colorSettings[typeLabel] || '#6b7280';
                                  return (
                                    <TableRow 
                                      key={invoice.id}
                                      style={{ backgroundColor: `${color}1A` }}
                                    >
                                      <TableCell className="font-medium whitespace-nowrap">
                                        {isValid(date) ? format(date, 'PP pp') : 'Invalid Date'}
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                            className="text-xs border"
                                            style={{
                                                backgroundColor: `${color}20`,
                                                color: color,
                                                borderColor: `${color}40`,
                                            }}
                                        >{typeLabel}</Badge>
                                      </TableCell>
                                      <TableCell className={cn(invoice.isCreditSale && 'font-medium')}>{invoice.partner}</TableCell>
                                      <TableCell>{invoice.details}</TableCell>
                                      <TableCell className={cn("text-right font-semibold font-mono", getAmountClass(invoice))}>
                                        {invoice.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <Button asChild variant="ghost" size="icon" title="Edit">
                                            <Link href="/customers">
                                                <Pencil className="w-4 h-4" />
                                            </Link>
                                        </Button>
                                        <Button asChild variant="ghost" size="icon" title="Print Invoice">
                                          <Link href={`/invoice/${invoice.type.toLowerCase().replace(' ', '')}/${invoice.originalId}`} target="_blank">
                                            <Printer className="w-4 h-4" />
                                          </Link>
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
              {isLoaded ? (
                <>
                  <XCircle className="w-16 h-16" />
                  <h3 className="text-xl font-semibold">
                    {searchTerm ? 'No Matching Invoices' : 'No Invoices Yet'}
                  </h3>
                  <p>{searchTerm ? 'Try a different search term.' : 'Generated invoices for sales and purchases will appear here.'}</p>
                </>
              ) : (
                <p>Loading invoices...</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
