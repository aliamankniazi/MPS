
'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isValid } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { FileText, XCircle, Printer, Search } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Transaction, Purchase } from '@/lib/types';
import Link from 'next/link';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';


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
  const { transactions, purchases, isLoaded } = useDatabase();
  const [searchTerm, setSearchTerm] = useState('');

  const groupedInvoices = useMemo(() => {
    if (!isLoaded) return {};

    const salesInvoices: CombinedInvoice[] = transactions.map(tx => ({
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

    const purchaseInvoices: CombinedInvoice[] = purchases.map(p => ({
      id: `purchase-${p.id}`,
      originalId: p.id,
      timestamp: p.timestamp,
      type: 'Purchase',
      partner: p.supplier,
      details: p.volume ? `${p.volume.toFixed(2)}L of ${p.fuelType}` : p.fuelType,
      amount: p.totalCost,
    }));

    const allInvoices = [...salesInvoices, ...purchaseInvoices].sort((a, b) => {
      const dateA = new Date(a.timestamp);
      const dateB = new Date(b.timestamp);
      if (!isValid(dateA)) return 1;
      if (!isValid(dateB)) return -1;
      return dateB.getTime() - a.getTime();
    });
    
    const filtered = allInvoices.filter(invoice =>
      !searchTerm ||
      invoice.partner.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.details.toLowerCase().includes(searchTerm.toLowerCase())
    );

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

  }, [isLoaded, transactions, purchases, searchTerm]);

  const getBadgeVariant = (invoice: CombinedInvoice) => {
    if (invoice.type === 'Purchase') return 'outline';
    if (invoice.isCreditSale) return 'destructive';
    if (invoice.type === 'Sale') return 'default';
    return 'destructive';
  };
  
  const getAmountClass = (invoice: CombinedInvoice) => {
    if (invoice.type === 'Purchase') return 'text-green-600';
    if (invoice.isCreditSale) return 'text-blue-600';
    return invoice.type === 'Sale' ? 'text-green-600' : 'text-destructive';
  };

  const getRowClass = (invoice: CombinedInvoice) => {
    if (invoice.type === 'Purchase') return 'text-green-600';
    if (invoice.isCreditSale) return 'text-blue-600';
    return invoice.type === 'Sale' ? 'text-green-600' : '';
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
            <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by partner, type, or details..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                />
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
                                  return (
                                    <TableRow key={invoice.id} className={getRowClass(invoice)}>
                                      <TableCell className="font-medium whitespace-nowrap">
                                        {isValid(date) ? format(date, 'PP pp') : 'Invalid Date'}
                                      </TableCell>
                                      <TableCell>
                                        <Badge 
                                            variant={getBadgeVariant(invoice)}
                                            className={cn('text-xs',
                                                invoice.type === 'Sale' && !invoice.isCreditSale && 'bg-green-100 text-green-800 border-green-200',
                                                invoice.isCreditSale && 'bg-blue-100 text-blue-800 border-blue-200',
                                                invoice.type === 'Purchase' && 'bg-green-100 text-green-800 border-green-200'
                                            )}
                                        >{invoice.type === 'Sale' && invoice.isCreditSale ? 'Credit Sale' : invoice.type}</Badge>
                                      </TableCell>
                                      <TableCell className={cn(invoice.isCreditSale && 'font-medium')}>{invoice.partner}</TableCell>
                                      <TableCell>{invoice.details}</TableCell>
                                      <TableCell className={cn("text-right font-semibold font-mono", getAmountClass(invoice))}>
                                        {invoice.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </TableCell>
                                      <TableCell className="text-center">
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
