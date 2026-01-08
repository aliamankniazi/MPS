
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

type CombinedInvoice = {
  id: string;
  originalId: string;
  timestamp: string;
  type: 'Sale' | 'Purchase';
  partner: string;
  details: string;
  amount: number;
};

export default function AllInvoicesPage() {
  const { transactions, purchases, isLoaded } = useDatabase();
  const [searchTerm, setSearchTerm] = useState('');

  const combinedInvoices = useMemo(() => {
    if (!isLoaded) return [];

    const salesInvoices: CombinedInvoice[] = transactions.map(tx => ({
      id: `sale-${tx.id}`,
      originalId: tx.id,
      timestamp: tx.timestamp,
      type: 'Sale',
      partner: tx.customerName || 'Walk-in Customer',
      details: tx.volume ? `${tx.volume.toFixed(2)}L of ${tx.fuelType}` : (tx.product || 'General Sale'),
      amount: tx.totalAmount,
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

    return [...salesInvoices, ...purchaseInvoices].sort((a, b) => {
      const dateA = new Date(a.timestamp);
      const dateB = new Date(b.timestamp);
      if (!isValid(dateA)) return 1;
      if (!isValid(dateB)) return -1;
      return dateB.getTime() - dateA.getTime();
    });
  }, [isLoaded, transactions, purchases]);

  const filteredInvoices = useMemo(() => {
    if (!searchTerm) return combinedInvoices;
    return combinedInvoices.filter(invoice =>
      invoice.partner.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.details.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [combinedInvoices, searchTerm]);

  const getBadgeVariant = (type: CombinedInvoice['type']) => {
    return type === 'Sale' ? 'outline' : 'destructive';
  };

  const getAmountClass = (type: CombinedInvoice['type']) => {
    return type === 'Sale' ? 'text-green-600' : 'text-destructive';
  };

  return (
    <div className="p-4 md:p-8">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText /> All Invoices
              </CardTitle>
              <CardDescription>A list of all generated sales and purchase invoices.</CardDescription>
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
          {isLoaded && filteredInvoices.length > 0 ? (
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
                {filteredInvoices.map(invoice => {
                  const date = new Date(invoice.timestamp);
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {isValid(date) ? format(date, 'PP pp') : 'Invalid Date'}
                      </TableCell>
                      <TableCell>
                        <Badge 
                            variant={getBadgeVariant(invoice.type)}
                            className={cn(invoice.type === 'Sale' && 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700')}
                        >{invoice.type}</Badge>
                      </TableCell>
                      <TableCell>{invoice.partner}</TableCell>
                      <TableCell>{invoice.details}</TableCell>
                      <TableCell className={cn("text-right font-semibold font-mono", getAmountClass(invoice.type))}>
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
