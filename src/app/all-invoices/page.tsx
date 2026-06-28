'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isValid, startOfDay, endOfDay } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { FileText, XCircle, Printer, Search, Download, Pencil } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Transaction, Purchase, DateRange } from '@/lib/types';
import Link from 'next/link';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import * as XLSX from 'xlsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '@/components/date-range-picker';


type CombinedInvoice = {
  id: string;
  originalId: string;
  timestamp: string;
  type: 'Sale' | 'Purchase' | 'Customer Payment' | 'Cash Advance' | 'Salary';
  partner: string;
  details: string;
  amount: number;
  paymentMethod?: string;
  isCreditSale?: boolean;
  profit?: number;
};

type GroupedInvoices = {
  [key: string]: {
    invoices: CombinedInvoice[];
    totalSales: number;
    totalPurchases: number;
    totalProfit: number;
    totalPayments: number;
    totalAdvances: number;
  };
};

export default function AllInvoicesPage() {
  const { transactions, purchases, customerPayments, cashAdvances, isLoaded, colorSettings } = useDatabase();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [localDateRange, setLocalDateRange] = useState<DateRange | undefined>();
  const isInitialDateSet = useRef(false);

  useEffect(() => {
    if (isLoaded && !isInitialDateSet.current) {
      const allItems = [...transactions, ...purchases, ...customerPayments, ...cashAdvances];
      const latestItem = allItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      if (latestItem && isValid(new Date(latestItem.timestamp))) {
        const latestDate = new Date(latestItem.timestamp);
        setLocalDateRange({ from: startOfDay(latestDate), to: endOfDay(latestDate) });
      } else {
        setLocalDateRange({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
      }
      isInitialDateSet.current = true;
    }
  }, [isLoaded, transactions, purchases, customerPayments, cashAdvances]);


  const allInvoicesForExport = useMemo(() => {
    if (!isLoaded || !localDateRange?.from) return [];

    const from = startOfDay(localDateRange.from);
    const to = localDateRange.to ? endOfDay(localDateRange.to) : endOfDay(localDateRange.from);

    const filterByDate = (items: any[]) => items.filter(item => {
        const itemDate = new Date(item.timestamp);
        return isValid(itemDate) && itemDate >= from && itemDate <= to;
    });

    const filteredTransactions = filterByDate(transactions);
    const filteredPurchases = filterByDate(purchases);
    const filteredPayments = filterByDate(customerPayments);
    const filteredAdvances = filterByDate(cashAdvances);

    const getProfitForSale = (sale: Transaction, allPurchases: Purchase[]): number => {
      if (!sale.fuelType || !sale.volume || sale.volume <= 0 || !sale.timestamp || !isValid(new Date(sale.timestamp))) {
          return 0;
      }
  
      const saleTime = new Date(sale.timestamp).getTime();
      let latestPurchase: Purchase | null = null;
      let latestPurchaseTime = 0;
  
      for (const p of allPurchases) {
          if (p.fuelType && p.fuelType.toLowerCase() === sale.fuelType.toLowerCase() && p.timestamp && isValid(new Date(p.timestamp))) {
              const purchaseTime = new Date(p.timestamp).getTime();
              if (purchaseTime <= saleTime && purchaseTime > latestPurchaseTime) {
                  latestPurchaseTime = purchaseTime;
                  latestPurchase = p;
              }
          }
      }
      
      if (latestPurchase && latestPurchase.volume > 0 && typeof sale.pricePerLitre === 'number') {
          const costPerLitre = latestPurchase.totalCost / latestPurchase.volume;
          const profit = (sale.pricePerLitre - costPerLitre) * sale.volume;
          return profit;
      }
  
      return 0;
    }

    const salesInvoices: CombinedInvoice[] = filteredTransactions.map(tx => {
        const profit = getProfitForSale(tx, purchases);
        const isCredit = !!(tx.customerId && tx.customerId !== 'walkin' && tx.paymentMethod === 'Credit');
        
        return {
            id: `sale-${tx.id}`,
            originalId: tx.id,
            timestamp: tx.timestamp,
            type: 'Sale',
            partner: tx.customerName || 'Walk-in Customer',
            details: tx.volume ? `${tx.volume.toFixed(2)}L of ${tx.fuelType}` : (tx.product || 'General Sale'),
            amount: tx.totalAmount,
            paymentMethod: tx.paymentMethod,
            isCreditSale: isCredit,
            profit: profit,
        };
    });

    const purchaseInvoices: CombinedInvoice[] = filteredPurchases.map(p => ({
      id: `purchase-${p.id}`,
      originalId: p.id,
      timestamp: p.timestamp,
      type: 'Purchase',
      partner: p.supplier,
      details: p.volume ? `${p.volume.toFixed(2)}L of ${p.fuelType}` : p.fuelType,
      amount: p.totalCost,
    }));

    const paymentInvoices: CombinedInvoice[] = filteredPayments.map(p => ({
      id: `pay-${p.id}`,
      originalId: p.id,
      timestamp: p.timestamp,
      type: p.paymentMethod === 'Salary' ? 'Salary' : 'Customer Payment',
      partner: p.customerName,
      details: p.notes || `${p.paymentMethod} Payment Receipt`,
      amount: p.amount,
      paymentMethod: p.paymentMethod,
    }));

    const advanceInvoices: CombinedInvoice[] = filteredAdvances.map(a => ({
      id: `adv-${a.id}`,
      originalId: a.id,
      timestamp: a.timestamp,
      type: 'Cash Advance',
      partner: a.customerName,
      details: a.notes || 'Cash Advance Voucher',
      amount: a.amount,
      paymentMethod: 'Cash',
    }));
    
    return [...salesInvoices, ...purchaseInvoices, ...paymentInvoices, ...advanceInvoices].sort((a, b) => {
        const dateA = new Date(a.timestamp);
        const dateB = new Date(b.timestamp);
        if (!isValid(dateA)) return 1;
        if (!isValid(dateB)) return -1;
        return dateB.getTime() - dateA.getTime();
      });

  }, [isLoaded, transactions, purchases, customerPayments, cashAdvances, localDateRange]);

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
            acc[monthKey] = { invoices: [], totalSales: 0, totalPurchases: 0, totalProfit: 0, totalPayments: 0, totalAdvances: 0 };
        }
        
        acc[monthKey].invoices.push(invoice);
        if(invoice.type === 'Sale') {
            acc[monthKey].totalSales += invoice.amount;
            acc[monthKey].totalProfit += invoice.profit || 0;
        }
        if(invoice.type === 'Purchase') acc[monthKey].totalPurchases += invoice.amount;
        if(invoice.type === 'Customer Payment' || invoice.type === 'Salary') acc[monthKey].totalPayments += invoice.amount;
        if(invoice.type === 'Cash Advance') acc[monthKey].totalAdvances += invoice.amount;

        return acc;
    }, {} as GroupedInvoices);

  }, [allInvoicesForExport, searchTerm, typeFilter]);
  
  const handleExportExcel = () => {
    const dataToExport = Object.values(groupedInvoices).flatMap(group => group.invoices)
        .map(invoice => ({
            'Date': isValid(new Date(invoice.timestamp)) ? format(new Date(invoice.timestamp), 'dd-MMM-yyyy hh:mm a') : 'Invalid Date',
            'Type': invoice.type === 'Sale' && invoice.isCreditSale ? 'Credit Sale' : invoice.type,
            'Partner': invoice.partner,
            'Details': invoice.details,
            'Amount (PKR)': invoice.amount.toFixed(2),
            'Profit (PKR)': invoice.type === 'Sale' && typeof invoice.profit === 'number' ? invoice.profit.toFixed(2) : 'N/A'
        }));
    
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoices');
    XLSX.writeFile(workbook, 'AllInvoices.xlsx');
  };
  
  const getAmountClass = (invoice: CombinedInvoice) => {
    if (invoice.type === 'Purchase') return 'text-green-600';
    if (invoice.type === 'Cash Advance') return 'text-destructive';
    if (invoice.type === 'Customer Payment' || invoice.type === 'Salary') return 'text-green-800';
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
                <FileText /> All Invoices & Slips
              </CardTitle>
              <CardDescription>Records of sales, purchases, payments, and advances.</CardDescription>
            </div>
             <div className="flex items-center gap-2 flex-wrap">
                <DateRangePicker date={localDateRange} onDateChange={setLocalDateRange} />
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by type..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="Sale">Cash Sale</SelectItem>
                        <SelectItem value="Credit Sale">Credit Sale</SelectItem>
                        <SelectItem value="Purchase">Purchase</SelectItem>
                        <SelectItem value="Customer Payment">Customer Payment</SelectItem>
                        <SelectItem value="Salary">Salary Payment</SelectItem>
                        <SelectItem value="Cash Advance">Cash Advance</SelectItem>
                    </SelectContent>
                </Select>
                <div className="relative w-full max-sm:max-w-xs">
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
             <Accordion type="multiple" className="w-full" defaultValue={monthKeys}>
                {monthKeys.map(monthKey => (
                    <AccordionItem value={monthKey} key={monthKey}>
                        <AccordionTrigger className="hover:bg-muted/50 px-4 rounded-md">
                            <div className="flex flex-col sm:flex-row justify-between w-full pr-4 items-start sm:items-center gap-2">
                                <span className="font-semibold text-lg">{monthKey}</span>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm">
                                    <span>Sales: <span className="font-mono text-green-600">PKR {groupedInvoices[monthKey].totalSales.toLocaleString()}</span></span>
                                    <span>Profit: <span className="font-mono text-blue-600">PKR {groupedInvoices[monthKey].totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2})}</span></span>
                                    <span>Payments: <span className="font-mono text-green-800">PKR {groupedInvoices[monthKey].totalPayments.toLocaleString()}</span></span>
                                    <span>Advances: <span className="font-mono text-destructive">PKR {groupedInvoices[monthKey].totalAdvances.toLocaleString()}</span></span>
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
                                  <TableHead className="text-right">Profit (PKR)</TableHead>
                                  <TableHead className="text-center">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {groupedInvoices[monthKey].invoices.map(invoice => {
                                  const date = new Date(invoice.timestamp);
                                  const typeLabel = invoice.type === 'Sale' ? (invoice.isCreditSale ? 'Credit Sale' : 'Cash Sale') : invoice.type;
                                  const color = invoice.isCreditSale ? '#3B82F6' : (colorSettings[typeLabel] || '#6b7280');
                                  return (
                                    <TableRow 
                                      key={invoice.id}
                                      style={{ backgroundColor: `${color}1A` }}
                                    >
                                      <TableCell className="font-medium whitespace-nowrap">
                                        {isValid(date) ? format(date, 'dd-MMM-yyyy hh:mm a') : 'Invalid Date'}
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
                                      <TableCell className={cn(
                                        invoice.details.toLowerCase().includes('diesel') && 'text-green-600',
                                        (invoice.details.toLowerCase().includes('unleaded') || invoice.details.toLowerCase().includes('premium')) && 'text-destructive'
                                      )}>{invoice.details}</TableCell>
                                      <TableCell className={cn("text-right font-semibold font-mono", getAmountClass(invoice))}>
                                        {invoice.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </TableCell>
                                       <TableCell className="text-right font-mono text-blue-600">
                                        {invoice.type === 'Sale' && typeof invoice.profit === 'number' ? invoice.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                                       </TableCell>
                                      <TableCell className="text-center">
                                        <Button asChild variant="ghost" size="icon" title="Edit">
                                            <Link href={
                                                invoice.type === 'Purchase' ? '/purchases?edit=' + invoice.originalId : 
                                                invoice.type === 'Sale' ? '/sales?edit=' + invoice.originalId :
                                                (invoice.type === 'Customer Payment' || invoice.type === 'Salary') ? '/customer-payments?edit=' + invoice.originalId :
                                                '/cash-advances?edit=' + invoice.originalId
                                            }>
                                                <Pencil className="w-4 h-4" />
                                            </Link>
                                        </Button>
                                        <Button asChild variant="ghost" size="icon" title="Print Invoice">
                                          <Link href={`/invoice/${invoice.type.toLowerCase().replace(' ', '')}/${invoice.originalId}`}>
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
                    {searchTerm ? 'No Matching Records' : 'No Documents Yet'}
                  </h3>
                  <p>{searchTerm ? 'Try a different search term.' : 'Sales, purchases, payments, and advances will appear here.'}</p>
                </>
              ) : (
                <p>Loading records...</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
