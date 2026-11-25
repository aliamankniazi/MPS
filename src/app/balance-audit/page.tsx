'use client';

/**
 * CUSTOMER BALANCE AUDIT. Reads only: nothing on this page changes a record or stores a balance.
 *
 * Every figure comes from lib/customer-audit.ts, which asks the one balance calculation every screen uses
 * (lib/customer-ledger.ts) and proves each balance by adding it up a second, separate way.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { AlertTriangle, BookText, CalendarIcon, CheckCircle2, DatabaseBackup, Download, Printer, Search, ShieldCheck, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { firebaseConfig } from '@/firebase/config';
import { FIRESTORE_PATHS, useDatabase } from '@/hooks/use-database';
import { auditCustomers, ISSUE_TITLES, type IssueSeverity } from '@/lib/customer-audit';
import { takeFullBackup } from '@/lib/backup';

const pkr = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SEVERITY: Record<IssueSeverity, { label: string; className: string }> = {
  problem: { label: 'Problem', className: 'bg-destructive text-destructive-foreground' },
  check: { label: 'Check', className: 'bg-amber-500 text-white' },
  note: { label: 'Note', className: 'bg-muted text-muted-foreground' },
};

/** Every collection the app keeps, plus the role definitions the sign-in reads. */
const BACKUP_COLLECTIONS = [...Object.values(FIRESTORE_PATHS), 'roles'];

export default function BalanceAuditPage() {
  const { customers, transactions, customerPayments, cashAdvances, saleReturns, isLoaded, isFromCache } = useDatabase();
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [asOf, setAsOf] = useState<Date | undefined>();
  const [search, setSearch] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [onlyWithFindings, setOnlyWithFindings] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [lastBackup, setLastBackup] = useState<{ fileName: string; documents: number; sha256: string } | null>(null);

  const report = useMemo(
    () => (isLoaded ? auditCustomers({ customers, transactions, customerPayments, cashAdvances, saleReturns }, { asOf: asOf ?? null }) : null),
    [isLoaded, customers, transactions, customerPayments, cashAdvances, saleReturns, asOf]
  );

  const lines = useMemo(() => {
    if (!report) return [];
    const term = search.trim().toLowerCase();
    return report.lines.filter(
      (l) => (!term || l.name.toLowerCase().includes(term) || l.area.toLowerCase().includes(term)) && (!onlyChanged || l.changed) && (!onlyWithFindings || l.issues > 0)
    );
  }, [report, search, onlyChanged, onlyWithFindings]);

  const findings = useMemo(() => {
    if (!report) return [];
    const term = search.trim().toLowerCase();
    return term ? report.issues.filter((i) => i.customerName.toLowerCase().includes(term) || i.message.toLowerCase().includes(term)) : report.issues;
  }, [report, search]);

  const toLookAt = report ? report.issues.filter((i) => i.severity !== 'note').length : 0;

  const handleExportExcel = () => {
    if (!report) return;
    const t = report.totals;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        { Item: 'Balances as of', Value: report.asOf ? format(report.asOf, 'dd MMM yyyy') : `Now (${format(new Date(), 'dd MMM yyyy HH:mm')})` },
        { Item: 'Every balance verified', Value: report.verified ? 'Yes' : 'NO' },
        { Item: 'Customers', Value: t.customers },
        { Item: 'Entries checked', Value: t.rowsChecked },
        { Item: 'Opening balances', Value: t.openingBalances },
        { Item: 'Total debits', Value: t.debits },
        { Item: 'Total credits', Value: t.credits },
        { Item: 'Closing balances (opening + debits - credits)', Value: t.closingBalances },
        { Item: 'Owed to the business', Value: t.receivable },
        { Item: 'Paid ahead by customers', Value: t.paidAhead },
        { Item: 'Customers whose figure differed between screens', Value: t.changedCustomers },
        { Item: 'Entries for customers that no longer exist', Value: t.orphanRows },
        { Item: 'Amount on those entries', Value: t.orphanAmount },
      ]),
      'Summary'
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        report.lines.map((l) => ({
          Customer: l.name,
          Area: l.area,
          'Opening Balance': l.openingBalance,
          'Total Debit': l.totalDebit,
          'Total Credit': l.totalCredit,
          'Closing Balance': l.closingBalance,
          Entries: l.rows,
          Verified: l.verified ? 'Yes' : 'NO',
          'Was on sale screen': report.asOf ? '' : l.was.saleScreen,
          'Was on customers list': report.asOf ? '' : l.was.customersList,
          'Was on ledger': report.asOf ? '' : l.was.ledgerPage,
          'Differed between screens': l.changed ? 'Yes' : '',
          Findings: l.issues,
        }))
      ),
      'Balances'
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        report.issues.map((i) => ({
          Level: SEVERITY[i.severity].label,
          Finding: ISSUE_TITLES[i.code],
          Customer: i.customerName,
          'Amount (PKR)': i.amount,
          Detail: i.message,
          Records: i.records.join(', '),
        }))
      ),
      'Findings'
    );
    XLSX.writeFile(workbook, `CustomerBalanceAudit-${format(report.asOf ?? new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const handleBackup = async () => {
    if (!firestore || backingUp) return;
    setBackingUp(true);
    try {
      const result = await takeFullBackup(firestore, BACKUP_COLLECTIONS, firebaseConfig.projectId);
      saveAs(result.blob, result.fileName);
      setLastBackup({ fileName: result.fileName, documents: result.documents, sha256: result.sha256 });
      toast({ title: 'Backup saved', description: `${result.documents.toLocaleString()} records written to ${result.fileName}.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Backup not taken', description: error?.message || 'The server could not be read.' });
    } finally {
      setBackingUp(false);
    }
  };

  if (!isLoaded || !report) {
    return (
      <div className="p-4 md:p-8 space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const t = report.totals;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck /> Customer Balance Audit
              </CardTitle>
              <CardDescription>
                Every customer&apos;s balance, worked out from the records: opening balance + debits − credits. This page only reads. It never changes a record or a balance.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('justify-start text-left font-normal', !asOf && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {asOf ? `As of ${format(asOf, 'dd MMM yyyy')}` : 'As of today'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={asOf} onSelect={setAsOf} initialFocus />
                </PopoverContent>
              </Popover>
              {asOf && (
                <Button variant="ghost" size="icon" onClick={() => setAsOf(undefined)} title="Back to today">
                  <X className="h-4 w-4" />
                </Button>
              )}
              <Button variant="outline" onClick={handleExportExcel}>
                <Download className="mr-2 h-4 w-4" /> Excel
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Print
              </Button>
              <Button onClick={handleBackup} disabled={backingUp || !firestore}>
                <DatabaseBackup className="mr-2 h-4 w-4" /> {backingUp ? 'Reading the server…' : 'Download full backup'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isFromCache && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
              <span>These figures come from the copy saved on this device. The server has not answered yet, so entries made on another device may be missing.</span>
            </div>
          )}
          <div className={cn('flex items-start gap-2 rounded-md border p-3 text-sm min-w-0', report.verified ? 'border-green-600 bg-green-50 dark:bg-green-950/30' : 'border-destructive bg-destructive/10')}>
            {report.verified ? <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-700 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />}
            <div className="min-w-0">
              <p className="font-semibold">
                {report.verified
                  ? `All ${t.customers.toLocaleString()} balances verified: each was added up two separate ways and came to the same figure.`
                  : `${(t.customers - t.verifiedCustomers).toLocaleString()} of ${t.customers.toLocaleString()} balances did not verify. Do not rely on the rows marked below.`}
              </p>
              <p className="font-mono text-xs mt-1 break-words">Opening {pkr(t.openingBalances)} + Debits {pkr(t.debits)} − Credits {pkr(t.credits)} = {pkr(t.closingBalances)}</p>
              <p className="font-mono text-xs break-words">Owed {pkr(t.receivable)} − Paid ahead {pkr(t.paidAhead)} = {pkr(t.receivable - t.paidAhead)}</p>
            </div>
          </div>
          {lastBackup && (
            <div className="rounded-md border p-3 text-xs space-y-1">
              <p className="font-semibold text-sm">Backup saved: {lastBackup.fileName}</p>
              <p>{lastBackup.documents.toLocaleString()} records. Keep the file somewhere safe; this fingerprint proves a copy has not been altered:</p>
              <p className="font-mono break-all">{lastBackup.sha256}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Stat label="Customers" value={t.customers.toLocaleString()} />
        <Stat label="Owed to the business" value={`PKR ${pkr(t.receivable)}`} tone="owed" />
        <Stat label="Paid ahead by customers" value={`PKR ${pkr(t.paidAhead)}`} tone="ahead" />
        <Stat label="Differed between screens" value={report.asOf ? '—' : t.changedCustomers.toLocaleString()} hint={report.asOf ? 'Shown for today only' : 'Customers whose old screens disagreed'} />
        <Stat label="To look at" value={toLookAt.toLocaleString()} hint={`${t.rowsChecked.toLocaleString()} entries checked`} tone={toLookAt > 0 ? 'owed' : undefined} />
      </div>

      <Tabs defaultValue="balances">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 print:hidden">
          <TabsList>
            <TabsTrigger value="balances">Balances ({report.lines.length})</TabsTrigger>
            <TabsTrigger value="findings">Findings ({report.issues.length})</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 w-full sm:w-56" />
            </div>
            <Button variant={onlyChanged ? 'default' : 'outline'} size="sm" onClick={() => setOnlyChanged((v) => !v)} disabled={!!report.asOf}>
              Differed between screens
            </Button>
            <Button variant={onlyWithFindings ? 'default' : 'outline'} size="sm" onClick={() => setOnlyWithFindings((v) => !v)}>
              With findings
            </Button>
          </div>
        </div>

        <TabsContent value="balances">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-center">Verified</TableHead>
                  <TableHead>Was showing</TableHead>
                  <TableHead className="text-center">Findings</TableHead>
                  <TableHead className="text-center print:hidden">Ledger</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.customerId}>
                    <TableCell>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">{l.area ? `${l.area} · ` : ''}{l.rows} entries</div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{pkr(l.openingBalance)}</TableCell>
                    <TableCell className="text-right font-mono text-destructive">{pkr(l.totalDebit)}</TableCell>
                    <TableCell className="text-right font-mono text-green-800">{pkr(l.totalCredit)}</TableCell>
                    <TableCell className={cn('text-right font-mono font-bold', l.closingBalance > 0 ? 'text-destructive' : l.closingBalance < 0 ? 'text-green-800' : '')}>{pkr(l.closingBalance)}</TableCell>
                    <TableCell className="text-center">
                      {l.verified ? <CheckCircle2 className="inline h-4 w-4 text-green-700" /> : <AlertTriangle className="inline h-4 w-4 text-destructive" />}
                    </TableCell>
                    <TableCell className="text-xs">
                      {l.changed ? (
                        <div className="space-y-0.5 font-mono">
                          <Was label="Sale screen" value={l.was.saleScreen} now={l.closingBalance} />
                          <Was label="Customers list" value={l.was.customersList} now={l.closingBalance} />
                          <Was label="Ledger" value={l.was.ledgerPage} now={l.closingBalance} />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{report.asOf ? '' : 'Same on every screen'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{l.issues > 0 ? <Badge variant="outline">{l.issues}</Badge> : ''}</TableCell>
                    <TableCell className="text-center print:hidden">
                      <Button asChild variant="ghost" size="icon" title="Open ledger">
                        <Link href={`/customers/${l.customerId}/ledger`}>
                          <BookText className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                      No customers match.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="findings">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Level</TableHead>
                  <TableHead>Finding</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {findings.map((issue, index) => (
                  <TableRow key={`${issue.code}-${issue.records.join('|')}-${index}`}>
                    <TableCell>
                      <span className={cn('rounded px-2 py-0.5 text-xs font-semibold', SEVERITY[issue.severity].className)}>{SEVERITY[issue.severity].label}</span>
                    </TableCell>
                    <TableCell className="font-medium">{ISSUE_TITLES[issue.code]}</TableCell>
                    <TableCell>
                      {issue.customerId && issue.code !== 'orphan-row' ? (
                        <Link href={`/customers/${issue.customerId}/ledger`} className="underline underline-offset-2">
                          {issue.customerName}
                        </Link>
                      ) : (
                        issue.customerName
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">{issue.amount ? pkr(issue.amount) : ''}</TableCell>
                    <TableCell className="text-sm">
                      {issue.message}
                      <div className="text-[10px] font-mono text-muted-foreground break-all mt-1">{issue.records.join(' · ')}</div>
                    </TableCell>
                  </TableRow>
                ))}
                {findings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Nothing found in the records.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'owed' | 'ahead' }) {
  return (
    <Card className="bg-muted/50">
      <CardHeader className="py-2">
        <CardTitle className="text-xs uppercase">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn('text-xl font-bold', tone === 'owed' && 'text-destructive', tone === 'ahead' && 'text-green-800')}>{value}</div>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Was({ label, value, now }: { label: string; value: number; now: number }) {
  const same = Math.round(value * 100) === Math.round(now * 100);
  return (
    <div className={cn(same ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400')}>
      {label}: {pkr(value)}
      {same ? '' : ` (${value > now ? '+' : '−'}${pkr(Math.abs(value - now))})`}
    </div>
  );
}
