'use client';

import React, { useMemo, useState, use } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isValid, startOfDay, endOfDay, startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { BookUser, ArrowLeft, Trash2, Printer, Pencil, ShieldCheck, Briefcase, Calendar as CalendarIcon, Download } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DateRange } from '@/lib/types';
import { DateRangePicker } from '@/components/date-range-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { describeRow, ledgerOf, rowTypeLabel, statementFor, toPaisa, type CustomerLedgerRow } from '@/lib/customer-ledger';
import { describeSupplierRow, supplierLedgerOf, supplierStatement } from '@/lib/supplier-ledger';
import * as XLSX from 'xlsx';

const NO_DATE = 'no-date';

type LedgerEntry = {
  id: string;
  timestamp: string;
  description: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
  original: any;
  category?: string;
  notes?: string;
  entityId?: string;
};

export default function CustomerLedgerPage(props: { params: Promise<{ id: string }>, searchParams: Promise<any> }) {
  const resolvedParams = use(props.params);
  const entityId = resolvedParams.id;
  
  const { 
    customers, suppliers, businessPartners, employees, transactions, customerPayments, 
    cashAdvances, purchases, supplierPayments, investments, saleReturns,
    deleteTransaction, deletePurchase, deleteCustomerPayment, deleteCashAdvance, 
    deleteSupplierPayment, deleteInvestment, deleteSaleReturn, deletePurchaseReturn, isLoaded, customerLedgerBook, supplierLedgerBook,
  } = useDatabase();
  
  const { isPinVerified, confirmPin } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [entryToDelete, setEntryToDelete] = useState<LedgerEntry | null>(null);
  const [deletePin, setDeletePin] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const { entity, entityType, employeeData } = useMemo(() => {
    if (!isLoaded) return { entity: null, entityType: null, employeeData: null };
    
    const customer = customers.find(c => c.id === entityId);
    const supplier = suppliers.find(s => s.id === entityId);
    const partner = businessPartners.find(p => p.id === entityId);
    
    let resolvedEntity = customer || supplier || partner || null;
    let type = customer ? 'Customer' : (supplier ? 'Supplier' : (partner ? 'Partner' : null));
    
    // Check if this customer is actually an employee
    const employee = employees.find(e => e.name.toLowerCase() === resolvedEntity?.name.toLowerCase() && (resolvedEntity as any)?.area === 'Employee');

    return { entity: resolvedEntity, entityType: type, employeeData: employee };
  }, [entityId, customers, suppliers, businessPartners, employees, isLoaded]);

  const { entries, totalDebit, totalCredit, openingBalance: periodOpening, finalBalance, currentBalance } = useMemo(() => {
    if (!entity) return { entries: [], totalDebit: 0, totalCredit: 0, openingBalance: 0, finalBalance: 0, currentBalance: 0 };
    const combined: Omit<LedgerEntry, 'balance'>[] = [];

    if (entityType === 'Customer') {
        /*
         * The one calculation (lib/customer-ledger.ts). This page used to add the rows up for itself, and
         * came to a different figure than the sale screen, the customers list and the reports. Now the rows,
         * the running balance beside each, the opening and the closing all come out of the same pass that
         * every other screen reads.
         */
        const ledger = ledgerOf(customerLedgerBook, entityId);
        const statement = statementFor(ledger, { from: dateRange?.from ?? null, to: dateRange?.to ?? dateRange?.from ?? null });
        const PREFIX = { transactions: 'tx', customerPayments: 'pay', cashAdvances: 'adv', saleReturns: 'sr' } as const;
        const CATEGORY = { 'credit-sale': 'FUEL SALE', 'cash-sale': 'CASH SALE · PAID AT THE TIME', payment: 'PAYMENT', salary: 'STAFF PAYROLL', 'cash-advance': 'CASH ADVANCE', 'sale-return': 'RETURN' } as const;
        const toEntry = (row: CustomerLedgerRow): LedgerEntry => ({
          id: `${PREFIX[row.source]}-${row.sourceId}`,
          timestamp: row.dated ? new Date(row.time).toISOString() : '',
          description: describeRow(row),
          type: rowTypeLabel(row),
          debit: row.debit,
          credit: row.credit,
          balance: row.balance,
          original: row.original,
          category: CATEGORY[row.kind],
          notes: row.kind === 'sale-return' ? row.original?.reason : row.original?.notes,
          entityId: row.customerId,
        });
        const all = statement.rows.map(toEntry);
        const term = searchTerm.toLowerCase();
        const shown = term
          ? all.filter(e => e.description.toLowerCase().includes(term) || (e.notes && String(e.notes).toLowerCase().includes(term)))
          : all;
        // A search narrows the rows shown and their two totals. The balances never follow a search:
        // each row keeps its true running balance and the cards keep the period's true opening and closing.
        const debit = shown.reduce((sum, e) => sum + toPaisa(e.debit), 0) / 100;
        const credit = shown.reduce((sum, e) => sum + toPaisa(e.credit), 0) / 100;
        return {
          entries: [...shown].reverse(),
          totalDebit: debit,
          totalCredit: credit,
          openingBalance: statement.openingBalance,
          finalBalance: statement.closingBalance,
          currentBalance: ledger.closingBalance,
        };

    } else if (entityType === 'Supplier') {
        /*
         * The one supplier calculation (lib/supplier-ledger.ts). This page listed purchases and payments and
         * left purchase returns out altogether, so it disagreed with the purchase-return screen and the report.
         */
        const ledger = supplierLedgerOf(supplierLedgerBook, entityId);
        const statement = supplierStatement(ledger, { from: dateRange?.from ?? null, to: dateRange?.to ?? dateRange?.from ?? null });
        const PREFIX = { purchases: 'pur', supplierPayments: 'spay', purchaseReturns: 'pr' } as const;
        const TYPE = { purchase: 'Purchase', payment: 'Supplier Payment', 'purchase-return': 'Purchase Return' } as const;
        const CATEGORY = { purchase: 'PURCHASE', payment: 'PAYMENT', 'purchase-return': 'RETURN' } as const;
        const all: LedgerEntry[] = statement.rows.map(row => ({
          id: `${PREFIX[row.source]}-${row.sourceId}`,
          timestamp: row.dated ? new Date(row.time).toISOString() : '',
          description: describeSupplierRow(row),
          type: TYPE[row.kind],
          debit: row.debit,
          credit: row.credit,
          balance: row.balance,
          original: row.original,
          category: CATEGORY[row.kind],
          notes: row.original?.notes ?? row.original?.reason,
          entityId: row.supplierId,
        }));
        const term = searchTerm.toLowerCase();
        const shown = term
          ? all.filter(e => e.description.toLowerCase().includes(term) || (e.notes && String(e.notes).toLowerCase().includes(term)))
          : all;
        return {
          entries: [...shown].reverse(),
          totalDebit: shown.reduce((sum, e) => sum + toPaisa(e.debit), 0) / 100,
          totalCredit: shown.reduce((sum, e) => sum + toPaisa(e.credit), 0) / 100,
          openingBalance: statement.openingBalance,
          finalBalance: statement.closingBalance,
          currentBalance: ledger.closingBalance,
        };
    } else if (entityType === 'Partner') {
        investments.filter(inv => inv.partnerId === entityId).forEach(inv => {
            combined.push({
                id: `inv-${inv.id}`,
                timestamp: inv.timestamp,
                type: inv.type,
                description: inv.notes || inv.type,
                debit: inv.type === 'Withdrawal' ? inv.amount : 0,
                credit: inv.type === 'Investment' ? inv.amount : 0,
                original: inv,
                category: 'CAPITAL',
                notes: inv.notes,
                entityId: inv.partnerId
            });
        });
    }

    combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const openingBalance = ('openingBalance' in (entity as any) && (entity as any).openingBalance) ? ((entity as any).openingBalance as number) : 0;
    const rangeFrom = dateRange?.from ? startOfDay(dateRange.from) : null;
    const rangeTo = dateRange?.to ? endOfDay(dateRange.to) : (rangeFrom ? endOfDay(rangeFrom) : null);

    const balanceBeforeRange = combined
      .filter(e => rangeFrom && isValid(new Date(e.timestamp)) && new Date(e.timestamp) < rangeFrom)
      .reduce((bal, entry) => {
        if (entityType === 'Customer') return bal + (entry.debit - entry.credit);
        return bal + (entry.credit - entry.debit);
      }, openingBalance);

    const filteredByDate = rangeFrom && rangeTo
      ? combined.filter(entry => {
          const entryDate = new Date(entry.timestamp);
          return isValid(entryDate) && entryDate >= rangeFrom && entryDate <= rangeTo;
      })
      : combined;
  
    const filteredEntries = searchTerm
      ? filteredByDate.filter(entry => 
          entry.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (entry.notes && entry.notes.toLowerCase().includes(searchTerm.toLowerCase()))
        )
      : filteredByDate;

    let runningBalance = rangeFrom ? balanceBeforeRange : openingBalance;
    const entriesWithBalance: LedgerEntry[] = filteredEntries.map(entry => {
      if (entityType === 'Customer') runningBalance += entry.debit - entry.credit;
      else runningBalance += entry.credit - entry.debit;
      return { ...entry, balance: runningBalance };
    });

    const debit = filteredEntries.reduce((s, e) => s + e.debit, 0);
    const credit = filteredEntries.reduce((s, e) => s + e.credit, 0);

    return { entries: entriesWithBalance.reverse(), totalDebit: debit, totalCredit: credit, openingBalance: rangeFrom ? balanceBeforeRange : openingBalance, finalBalance: runningBalance, currentBalance: runningBalance };
  }, [entity, entityType, customerLedgerBook, supplierLedgerBook, investments, entityId, dateRange, searchTerm]);

  const groupedEntries = useMemo(() => {
    const groups: Record<string, LedgerEntry[]> = {};
    entries.forEach(entry => {
      const dateKey = isValid(new Date(entry.timestamp)) ? format(new Date(entry.timestamp), 'yyyy-MM-dd') : NO_DATE;
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(entry);
    });
    return groups;
  }, [entries]);

  // Newest day first; rows whose date was never recorded are the oldest thing on the account, so last.
  const sortedDateKeys = useMemo(() => Object.keys(groupedEntries).sort((a, b) => (a === NO_DATE ? 1 : b === NO_DATE ? -1 : new Date(b).getTime() - new Date(a).getTime())), [groupedEntries]);

  const handleQuickPeriod = (value: string) => {
    const now = new Date();
    if (value === 'this-month') setDateRange({ from: startOfMonth(now), to: endOfMonth(now) });
    else if (value === 'last-month') {
        const lastMonth = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        setDateRange({ from: lastMonth, to: endOfMonth(lastMonth) });
    } else if (value === 'all-time') setDateRange(undefined);
  };

  const handleDeleteEntry = () => {
    if (!entryToDelete) return;
    if (!isPinVerified() && deletePin !== '0200') {
      toast({ variant: 'destructive', title: 'Incorrect PIN' });
      return;
    }
    if (deletePin === '0200') confirmPin('0200');

    const [prefix, id] = entryToDelete.id.split(/-(.*)/s);
    try {
        if (prefix === 'tx') deleteTransaction(id);
        else if (prefix === 'pay') deleteCustomerPayment(id);
        else if (prefix === 'adv') deleteCashAdvance(id);
        else if (prefix === 'sr') deleteSaleReturn(id);
        else if (prefix === 'pur') deletePurchase(id);
        else if (prefix === 'spay') deleteSupplierPayment(id);
        else if (prefix === 'pr') deletePurchaseReturn(id);
        else if (prefix === 'inv') deleteInvestment(id);
        toast({ title: 'Entry Deleted' });
    } catch (e) { toast({ variant: 'destructive', title: 'Error' }); }
    setEntryToDelete(null);
    setDeletePin('');
  };

  const periodEnd = dateRange?.to ?? dateRange?.from ?? null;

  // The statement as a spreadsheet: the same rows and the same figures as the screen and the print.
  const handleExportExcel = () => {
    if (!entity) return;
    const money = (n: number) => Math.round(n * 100) / 100;
    const oldestFirst = [...entries].reverse();
    const rows: Record<string, string | number>[] = [
      { Date: dateRange?.from ? `Before ${format(dateRange.from, 'dd MMM yyyy')}` : '', Description: 'Opening Balance', Type: '', Notes: '', Debit: '', Credit: '', Balance: money(periodOpening) },
      ...oldestFirst.map(e => ({
        Date: isValid(new Date(e.timestamp)) ? format(new Date(e.timestamp), 'dd MMM yyyy hh:mm a') : 'Date not recorded',
        Description: e.description,
        Type: e.type,
        Notes: e.notes || '',
        Debit: e.debit > 0 ? money(e.debit) : '',
        Credit: e.credit > 0 ? money(e.credit) : '',
        Balance: money(e.balance),
      })),
      { Date: periodEnd ? `As of ${format(periodEnd, 'dd MMM yyyy')}` : '', Description: 'Closing Balance', Type: '', Notes: '', Debit: money(totalDebit), Credit: money(totalCredit), Balance: money(finalBalance) },
    ];
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Statement');
    XLSX.writeFile(workbook, `${String(entity.name).replace(/[^\w\- ]+/g, '').trim() || 'Account'} - Statement.xlsx`);
  };

  if (!isLoaded) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  if (!entity) return <div className="p-8 text-center text-destructive">Entity Not Found</div>;

  const getEditLink = (e: LedgerEntry) => {
    const [prefix, id] = e.id.split(/-(.*)/s);
    switch(prefix) {
        case 'tx': return `/sales?edit=${id}`; 
        case 'pur': return `/purchases?edit=${id}`;
        case 'pay': return `/customer-payments?edit=${id}`; 
        case 'adv': return `/cash-advances?edit=${id}`;
        case 'sr': return `/sale-returns?edit=${id}`;
        case 'inv': return `/investments?edit=${id}`;
        case 'spay': return `/supplier-payments?edit=${id}`;
        case 'pr': return `/purchase-returns?edit=${id}`;
        default: return '#';
    }
  };

  const balanceColor = (bal: number) => entityType === 'Customer' ? (bal > 0 ? 'text-destructive' : 'text-green-800') : (bal >= 0 ? 'text-green-800' : 'text-destructive');

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4 print:hidden">
        <div>
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <BookUser /> {entityType} Ledger: <span className={cn(balanceColor(finalBalance))}>{entity.name}</span>
            {employeeData && <Badge variant="outline" className="ml-2 text-blue-600 border-blue-600">STAFF</Badge>}
          </CardTitle>
          <CardDescription>
            {employeeData ? (
                <span className="flex items-center gap-2 mt-1">
                    <Briefcase className="w-3 h-3" /> {employeeData.position} • Joined: {format(new Date(employeeData.hireDate), 'dd MMM yyyy')}
                    <Button asChild variant="link" size="sm" className="h-auto p-0 px-2">
                        <Link href="/salary-report">View Salary Details</Link>
                    </Button>
                </span>
            ) : "All transactions for this account."}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full sm:w-48" />
          <Select onValueChange={handleQuickPeriod}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Quick Period"/></SelectTrigger>
            <SelectContent>
                <SelectItem value="this-month">This Month</SelectItem>
                <SelectItem value="last-month">Last Month</SelectItem>
                <SelectItem value="all-time">All Time</SelectItem>
            </SelectContent>
          </Select>
          <DateRangePicker date={dateRange} onDateChange={setDateRange} />
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print</Button>
          <Button variant="outline" onClick={handleExportExcel}><Download className="mr-2 h-4 w-4" /> Excel</Button>
          <Button asChild variant="outline"><Link href="/customers"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card className="bg-muted/50"><CardHeader className="py-2"><CardTitle className="text-xs uppercase">Opening Balance{dateRange?.from ? ` (before ${format(dateRange.from, 'dd MMM yyyy')})` : ''}</CardTitle></CardHeader><CardContent><div className={cn("text-2xl font-bold", balanceColor(periodOpening))}>PKR {periodOpening.toLocaleString()}</div></CardContent></Card>
          <Card className="bg-muted/50"><CardHeader className="py-2"><CardTitle className="text-xs uppercase">Total Debit</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">PKR {totalDebit.toLocaleString()}</div></CardContent></Card>
          <Card className="bg-muted/50"><CardHeader className="py-2"><CardTitle className="text-xs uppercase">Total Credit</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-800">PKR {totalCredit.toLocaleString()}</div></CardContent></Card>
          <Card className="bg-muted/50 border-2 border-primary/20"><CardHeader className="py-2"><CardTitle className="text-xs uppercase">Closing Balance{periodEnd ? ` (${format(periodEnd, 'dd MMM yyyy')})` : ''}</CardTitle></CardHeader><CardContent><div className={cn("text-2xl font-bold", balanceColor(finalBalance))}>PKR {finalBalance.toLocaleString()}</div>{Math.abs(currentBalance - finalBalance) >= 0.005 && <p className="text-xs text-muted-foreground mt-1">Balance today, with entries dated after this period: <span className={cn("font-bold", balanceColor(currentBalance))}>PKR {currentBalance.toLocaleString()}</span></p>}</CardContent></Card>
      </div>

      <div className="rounded-md border overflow-hidden">
          <Table>
              <TableHeader className="bg-muted/50">
                  <TableRow>
                      <TableHead className="w-12">No.</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-center print:hidden">Actions</TableHead>
                  </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDateKeys.map((dateKey) => {
                  const dayEntries = groupedEntries[dateKey];
                  const displayDate = dateKey === NO_DATE ? 'Date not recorded' : format(new Date(dateKey), 'EEEE, dd MMMM yyyy');
                  
                  return (
                      <React.Fragment key={dateKey}>
                          <TableRow className="bg-red-600 hover:bg-red-700 border-none">
                              <TableCell colSpan={8} className="py-2 px-4 text-white font-bold h-10 align-middle">
                                  <span>{displayDate}</span>
                              </TableCell>
                          </TableRow>
                          {dayEntries.map((entry, index) => {
                              const serialNo = dayEntries.length - index;
                              const isSalary = entry.type === 'Salary';
                              return (
                              <TableRow key={entry.id} className={cn("group", isSalary && "bg-pink-50 dark:bg-pink-900/10")}>
                                  <TableCell className="text-xs font-mono text-muted-foreground">{serialNo}</TableCell>
                                  <TableCell className="font-medium whitespace-nowrap">{isValid(new Date(entry.timestamp)) ? format(new Date(entry.timestamp), 'hh:mm a') : '-'}</TableCell>
                                  <TableCell>
                                      <div className="flex flex-col">
                                          <span className={cn("font-bold", isSalary ? "text-pink-600" : "text-red-600")}>{entry.description}</span>
                                          {entry.category && <span className="text-[10px] text-muted-foreground uppercase">{entry.category}</span>}
                                      </div>
                                  </TableCell>
                                  <TableCell className="text-xs italic text-muted-foreground min-w-[200px]">{entry.notes || ''}</TableCell>
                                  <TableCell className="text-right font-mono text-red-600 font-bold">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</TableCell>
                                  <TableCell className="text-right font-mono text-green-800 font-bold">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</TableCell>
                                  <TableCell className={cn("text-right font-mono font-bold", balanceColor(entry.balance))}>{entry.balance.toFixed(2)}</TableCell>
                                  <TableCell className="text-center print:hidden">
                                      <div className="flex justify-center gap-1">
                                          <Button asChild variant="ghost" size="icon" className="h-8 w-8 hover:text-primary">
                                              <Link href={getEditLink(entry)}><Pencil className="w-4 h-4" /></Link>
                                          </Button>
                                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setEntryToDelete(entry)}>
                                              <Trash2 className="w-4 h-4" />
                                          </Button>
                                      </div>
                                  </TableCell>
                              </TableRow>
                          )})}
                      </React.Fragment>
                  );
                })}
              </TableBody>
          </Table>
      </div>

      <AlertDialog open={!!entryToDelete} onOpenChange={(o) => { if (!o) { setEntryToDelete(null); setDeletePin(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="text-destructive"/> Delete Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete: <strong>{entryToDelete?.description}</strong>
              {!isPinVerified() && (
                <div className="mt-4 space-y-2">
                    <Label className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary"/> Security PIN Required:</Label>
                    <Input type="password" value={deletePin} onChange={(e) => setDeletePin(e.target.value)} placeholder="0200" maxLength={4} />
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntry} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
