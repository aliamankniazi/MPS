'use client';

/**
 * Employee Management: one list of everyone who works or has worked here,
 * with their status, and the actions that change it. The rules live in
 * src/lib/employee-lifecycle.ts; this screen only collects the details and
 * shows the result.
 */
import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { History, RotateCcw, Search, ShieldCheck, UserCog, UserMinus, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useDatabase } from '@/hooks/use-database';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Employee, EmployeeStatus } from '@/lib/types';
import {
  changeEmployeeStatus,
  currentSalary,
  INACTIVE_STATUSES,
  isRestoredEmployee,
  lastStatusChange,
  LifecycleError,
  rejoiningDateOf,
  reviseSalary,
  salaryHistoryOf,
  statusOf,
} from '@/lib/employee-lifecycle';

type Filter = 'All' | EmployeeStatus | 'Restored';
const FILTERS: Filter[] = ['Active', 'Suspended', 'Dismissed', 'Terminated', 'Restored', 'All'];

const STATUS_STYLE: Record<EmployeeStatus, string> = {
  Active: 'bg-green-100 text-green-800 border-green-200',
  Suspended: 'bg-amber-100 text-amber-800 border-amber-200',
  Dismissed: 'bg-red-100 text-red-800 border-red-200',
  Terminated: 'bg-slate-200 text-slate-800 border-slate-300',
};

type Action = { kind: 'status' | 'restore' | 'salary' | 'history'; employee: Employee };

const today = () => format(new Date(), 'yyyy-MM-dd');
const showDay = (iso: string | null | undefined) => {
  if (!iso) return '-';
  try {
    return format(parseISO(iso), 'dd MMM yyyy');
  } catch {
    return iso;
  }
};
const money = (n: number) => `PKR ${n.toLocaleString()}`;

export default function EmployeeManagementPage() {
  const { employees: employeeRecords, updateEmployee, isLoaded } = useDatabase();
  const employees: Employee[] = employeeRecords;
  const { user, hasPermission, isPinVerified, confirmPin } = useAuth();
  const { toast } = useToast();

  const [filter, setFilter] = useState<Filter>('Active');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<Action | null>(null);

  // What is being typed into the open dialog.
  const [newStatus, setNewStatus] = useState<EmployeeStatus>('Suspended');
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');

  const canManage = hasPermission('manage_employees');
  const performedBy = user?.email ?? '';

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { All: employees.length, Active: 0, Suspended: 0, Dismissed: 0, Terminated: 0, Restored: 0 };
    for (const e of employees) {
      out[statusOf(e)]++;
      if (isRestoredEmployee(e)) out.Restored++;
    }
    return out;
  }, [employees]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees
      .filter((e) => (filter === 'All' ? true : filter === 'Restored' ? isRestoredEmployee(e) : statusOf(e) === filter))
      .filter((e) => !term || e.name.toLowerCase().includes(term) || (e.position ?? '').toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, filter, search]);

  const open = (kind: Action['kind'], employee: Employee) => {
    setEffectiveDate(today());
    setReason('');
    setRemarks('');
    setAmount('');
    setPin('');
    setNewStatus(INACTIVE_STATUSES.find((s) => s !== statusOf(employee)) ?? 'Suspended');
    setAction({ kind, employee });
  };

  /** The same Security PIN step the other screens use for sensitive changes. */
  const pinAccepted = () => {
    if (isPinVerified() || confirmPin(pin)) return true;
    toast({ variant: 'destructive', title: 'Incorrect PIN' });
    return false;
  };

  const save = async () => {
    if (!action) return;
    const { employee, kind } = action;
    try {
      // Work out the change first, so a mistake in the form is reported before the PIN is asked about.
      const updates =
        kind === 'salary'
          ? reviseSalary(employee, { amount: Number(amount), effectiveDate, reason, performedBy })
          : changeEmployeeStatus(employee, { newStatus: kind === 'restore' ? 'Active' : newStatus, effectiveDate, reason, remarks, performedBy });
      if (!pinAccepted()) return;
      await updateEmployee(employee.id, updates);
      toast({
        title: kind === 'salary' ? 'Salary updated' : kind === 'restore' ? 'Employee restored' : `Employee ${String(updates.status).toLowerCase()}`,
        description:
          kind === 'salary'
            ? `${employee.name}: ${money(Number(amount))} from ${showDay(effectiveDate)}. Earlier salaries are kept.`
            : kind === 'restore'
              ? `${employee.name} is Active again from ${showDay(effectiveDate)}.`
              : `${employee.name} is ${updates.status} from ${showDay(effectiveDate)} and will not appear in salary payment.`,
      });
      setAction(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Not saved', description: error instanceof LifecycleError ? error.message : 'Something went wrong. Please try again.' });
    }
  };

  const selected = action?.employee;
  const selectedStatus = selected ? statusOf(selected) : 'Active';

  return (
    <div className="p-4 md:p-8">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserCog /> Employee Management
              </CardTitle>
              <CardDescription>
                Suspend, dismiss, terminate or restore an employee, and update salaries. Nobody is ever deleted: their salary records, advances and ledger stay with them.
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search name or position..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 sm:w-64" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {FILTERS.map((f) => (
              <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>
                {f} <span className="ml-2 rounded bg-background/20 px-1.5 text-xs">{counts[f]}</span>
              </Button>
            ))}
          </div>
          {!canManage && <p className="pt-2 text-sm text-muted-foreground">Your role can view this list. Changing a status or salary needs the "Manage Employees" permission.</p>}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead className="text-right">Monthly salary</TableHead>
                  <TableHead>Hired</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      {isLoaded ? `No ${filter === 'All' ? '' : filter.toLowerCase() + ' '}employees.` : 'Loading employees...'}
                    </TableCell>
                  </TableRow>
                )}
                {shown.map((e) => {
                  const status = statusOf(e);
                  const last = lastStatusChange(e);
                  const rejoined = rejoiningDateOf(e);
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <div className="font-medium">{e.name}</div>
                        <div className="text-xs text-muted-foreground">{e.position}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('font-medium', STATUS_STYLE[status])}>
                          {status}
                        </Badge>
                        {isRestoredEmployee(e) && <div className="pt-1 text-xs text-muted-foreground">Rejoined {showDay(rejoined)}</div>}
                      </TableCell>
                      <TableCell>
                        <div>{showDay(last?.effectiveDate ?? (status === 'Active' ? e.hireDate : e.terminationDate))}</div>
                        {last && status !== 'Active' && <div className="max-w-[16rem] truncate text-xs text-muted-foreground" title={last.reason}>{last.reason}</div>}
                      </TableCell>
                      <TableCell className="text-right font-mono">{money(currentSalary(e))}</TableCell>
                      <TableCell>{showDay(e.hireDate)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1">
                          {status === 'Active' && (
                            <Button size="sm" variant="outline" disabled={!canManage} onClick={() => open('salary', e)}>
                              <Wallet className="mr-1 h-4 w-4" /> Salary
                            </Button>
                          )}
                          <Button size="sm" variant="outline" disabled={!canManage} onClick={() => open('status', e)}>
                            <UserMinus className="mr-1 h-4 w-4" /> {status === 'Active' ? 'Suspend / Remove' : 'Change status'}
                          </Button>
                          {status !== 'Active' && (
                            <Button size="sm" disabled={!canManage} onClick={() => open('restore', e)}>
                              <RotateCcw className="mr-1 h-4 w-4" /> Restore
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => open('history', e)}>
                            <History className="mr-1 h-4 w-4" /> History
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Change status, restore, update salary */}
      <Dialog open={!!action && action.kind !== 'history'} onOpenChange={(isOpen) => !isOpen && setAction(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              {action?.kind === 'salary' && `Update salary: ${selected?.name}`}
              {action?.kind === 'restore' && `Restore employee: ${selected?.name}`}
              {action?.kind === 'status' && `Change status: ${selected?.name}`}
            </DialogTitle>
            <DialogDescription>
              {action?.kind === 'salary' && `Current salary ${money(selected ? currentSalary(selected) : 0)}. The earlier salary stays on record; the new one applies from the date you choose.`}
              {action?.kind === 'restore' && `Currently ${selectedStatus}. Restoring makes them Active again on the same record, with all earlier history kept.`}
              {action?.kind === 'status' && `Currently ${selectedStatus}. They will be left out of salary payment from the effective date. Nothing is deleted.`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {action?.kind === 'status' && (
              <div className="space-y-2">
                <Label>New status</Label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as EmployeeStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INACTIVE_STATUSES.filter((s) => s !== selectedStatus).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {action?.kind === 'salary' && (
              <div className="space-y-2">
                <Label htmlFor="em-amount">New monthly salary (PKR)</Label>
                <Input id="em-amount" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g., 18000" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="em-date">{action?.kind === 'restore' ? 'Rejoining date' : action?.kind === 'salary' ? 'Effective from' : 'Effective date'}</Label>
              <Input id="em-date" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="em-reason">Reason{action?.kind === 'salary' ? ' (optional)' : ''}</Label>
              <Input id="em-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={action?.kind === 'salary' ? 'e.g., Annual increase' : 'e.g., Absent without leave'} />
            </div>
            {action?.kind !== 'salary' && (
              <div className="space-y-2">
                <Label htmlFor="em-remarks">Remarks (optional)</Label>
                <Textarea id="em-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
              </div>
            )}
            {!isPinVerified() && (
              <div className="space-y-2 border-t pt-4">
                <Label htmlFor="em-pin" className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Security PIN
                </Label>
                <Input id="em-pin" type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" />
              </div>
            )}
            <p className="text-xs text-muted-foreground">Recorded as done by {performedBy || 'you'} on {showDay(today())}.</p>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button onClick={save}>{action?.kind === 'restore' ? 'Restore employee' : action?.kind === 'salary' ? 'Save new salary' : 'Save status'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History */}
      <Dialog open={action?.kind === 'history'} onOpenChange={(isOpen) => !isOpen && setAction(null)}>
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>History: {selected?.name}</DialogTitle>
            <DialogDescription>
              Hired {showDay(selected?.hireDate)}. Currently {selectedStatus}.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-6 overflow-y-auto">
            <div>
              <h4 className="mb-2 font-semibold">Status changes</h4>
              {selected?.statusHistory?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Effective</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Remarks</TableHead>
                      <TableHead>Recorded</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...selected.statusHistory].reverse().map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap">{showDay(c.effectiveDate)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {c.previousStatus} → <span className="font-medium">{c.newStatus}</span>
                          {c.newStatus === 'Active' && <div className="text-xs text-muted-foreground">Rejoined</div>}
                        </TableCell>
                        <TableCell>{c.reason}</TableCell>
                        <TableCell>{c.remarks ?? '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {showDay(c.changeDate)}
                          <div>{c.performedBy}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No status changes recorded.</p>
              )}
            </div>
            <div>
              <h4 className="mb-2 font-semibold">Salary history</h4>
              {selected && salaryHistoryOf(selected).length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Effective from</TableHead>
                      <TableHead className="text-right">Monthly salary</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Recorded</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...salaryHistoryOf(selected)].reverse().map((h, i) => (
                      <TableRow key={`${h.effectiveDate}-${i}`}>
                        <TableCell className="whitespace-nowrap">{showDay(h.effectiveDate)}</TableCell>
                        <TableCell className="text-right font-mono">{money(h.amount)}</TableCell>
                        <TableCell>{h.reason ?? '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {h.recordedAt ? showDay(h.recordedAt) : '-'}
                          {h.recordedBy && <div>{h.recordedBy}</div>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No salary recorded.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAction(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
