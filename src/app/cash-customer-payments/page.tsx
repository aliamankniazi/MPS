'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isValid, startOfDay, endOfDay } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Wallet, XCircle, Search, Calendar as CalendarIcon, Download, Printer } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { CustomerPayment, CashAdvance, DateRange } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import * as XLSX from 'xlsx';

type CombinedEntry = {
  id: string;
  timestamp: string;
  type: 'Customer Payment' | 'Cash Advance';
  partner: string;
  details: string;
  amount: number;
};

export default function CashAndCustomerPaymentsPage() {
  const { customerPayments, cashAdvances, isLoaded, colorSettings } = useDatabase();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');

  const combinedEntries = useMemo(() => {
    if (!isLoaded) return [];

    const payments: CombinedEntry[] = customerPayments
      .filter(p => p.paymentMethod !== 'Salary')
      .map(p => ({
        id: `payment-${p.id}`,
        timestamp: p.timestamp,
        type: 'Customer Payment',
        partner: p.customerName,
        details: p.notes || `${p.paymentMethod} Payment`,
        amount: p.amount,
    }));

    const advances: CombinedEntry[] = cashAdvances.map(ca => ({
        id: `advance-${ca.id}`,
        timestamp: ca.timestamp,
        type: 'Cash Advance',
        partner: ca.customerName,
        details: ca.notes || 'Cash Advance',
        amount: ca.amount,
    }));

    return [...payments, ...advances].sort((a, b) => {
        const dateA = new Date(a.timestamp);
        const dateB = new Date(b.timestamp);
        if (!isValid(dateA)) return 1;
        if (!isValid(dateB)) return -1;
        return dateB.getTime() - dateA.getTime();
    });
  }, [isLoaded, customerPayments, cashAdvances]);

  const filteredEntries = useMemo(() => {
    let entries = combinedEntries;
    if (dateRange?.from) {
      const from = startOfDay(dateRange.from);
      const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);
      entries = entries.filter(entry => {
          const entryDate = new Date(entry.timestamp);
          return isValid(entryDate) && entryDate >= from && entryDate <= to;
      });
    }

    if (!searchTerm) return entries;
    
    return entries.filter(entry =>
      (entry.partner && entry.partner.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (entry.type && entry.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (entry.details && entry.details.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [combinedEntries, searchTerm, dateRange]);

  const handleExportExcel = () => {
    const dataToExport = filteredEntries.map(entry => ({
        'Date': isValid(new Date(entry.timestamp)) ? format(new Date(entry.timestamp), 'PP pp') : 'Invalid Date',
        'Type': entry.type,
        'Partner': entry.partner,
        'Details': entry.details,
        'Amount (PKR)': entry.amount.toFixed(2),
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Payments & Advances');
    XLSX.writeFile(workbook, 'PaymentsAndAdvances.xlsx');
  };

  const getEntryColor = (entry: CombinedEntry) => {
    return colorSettings[entry.type] || '#6b7280'; // default gray
  };

  return (
    <div className="p-4 md:p-8">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wallet /> Customer Payments & Cash Advances
              </CardTitle>
              <CardDescription>A record of all payments received from customers and cash advances given.</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="date"
                    variant={"outline"}
                    className={cn("w-[260px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
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
                    key="payments-advances-calendar"
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
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
          {isLoaded && filteredEntries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">Amount (PKR)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map(entry => {
                  const date = new Date(entry.timestamp);
                  const color = getEntryColor(entry);
                  const amountColor = entry.type === 'Cash Advance' ? 'text-destructive' : 'text-green-600';

                  return (
                    <TableRow key={entry.id}>
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
                        >
                          {entry.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{entry.partner}</TableCell>
                      <TableCell>{entry.details}</TableCell>
                      <TableCell className={cn("text-right font-semibold font-mono", amountColor)}>
                        {entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                    {searchTerm ? 'No Matching Entries' : 'No Payments or Advances Yet'}
                  </h3>
                  <p>{searchTerm ? 'Try a different search term.' : 'Customer payments and cash advances will appear here.'}</p>
                </>
              ) : (
                <p>Loading data...</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
