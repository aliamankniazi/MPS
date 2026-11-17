'use client';

import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Calendar as CalendarIcon, Sun, Check, ChevronsUpDown, AlertTriangle, Mic, ShieldCheck } from 'lucide-react';
import { format, getDaysInMonth, isValid, parse, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, startOfDay, isBefore, isEqual } from 'date-fns';
import { useDatabase } from '@/hooks/use-database';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { TransactionNav } from '@/components/transaction-nav';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/use-auth';
import { currentSalary, employedOn, findSalaryPayment, isActiveEmployee, payrollPeriodKey, salaryDescription } from '@/lib/employee-lifecycle';

const DEFAULT_SALARY_MAP: Record<string, number> = {
    'Asmat Ullah': 15000, 'Zeeshan': 15000, 'Shahzad': 15000, 'Kamran': 5000, 'Neemat Ullah': 25000, 'Younas Shah': 20000,
};

const salaryPaymentSchema = z.object({
  employeeId: z.string().optional(),
  salaryMonth: z.string().min(1, "Required"),
  salaryYear: z.string().min(4, "Required"),
  postingDate: z.date({ required_error: "Required"}),
  notes: z.string().optional(),
  manualPresentDays: z.coerce.number().optional(),
  pin: z.string().optional(),
});

type SalaryPaymentFormValues = z.infer<typeof salaryPaymentSchema>;

type SalaryCalculationPart = { period: string; salary: number; presentDays: number; subtotal: number; effectiveDate: string; };
type SalaryPaymentConfirmation = SalaryPaymentFormValues & { employeeName: string; calculation: { parts: SalaryCalculationPart[]; total: number; totalPresentDays: number; daysInMonth: number; }; employeeId: string; baseSalary: number; alreadyPaid: boolean; };

const months = Array.from({ length: 12 }, (_, i) => format(new Date(0, i), 'MMMM'));
const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

function PageHeader() {
    const [currentTime, setCurrentTime] = useState('');
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date().toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }));
        }, 1000);
        return () => clearInterval(timer);
    }, []);
    return (
      <header className="bg-background shadow-sm sticky top-0 z-20">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between"><p className="text-sm font-medium">{currentTime}</p><div className="flex items-center gap-4"><span className="text-sm">ziakniazi@gmail.com</span><Button variant="ghost" size="icon"><Sun className="h-5 w-5" /></Button></div></div>
      </header>
    );
}

export default function SalaryPaymentPage() {
  const { employees, customers, addCustomer, addCustomerPayment, addExpense, isLoaded, attendance, expenses } = useDatabase();
  const { isPinVerified, confirmPin } = useAuth();
  const { toast } = useToast();
  const [employeeComboboxOpen, setEmployeeComboboxOpen] = useState(false);
  const [paymentToConfirm, setPaymentToConfirm] = useState<SalaryPaymentConfirmation[] | null>(null);
  const [paymentMode, setPaymentMode] = useState<'single' | 'bulk'>('single');
  const [confirmPinVal, setConfirmPinVal] = useState('');

  const { register, handleSubmit, reset, control, setValue, formState: { errors } } = useForm<SalaryPaymentFormValues>({
    resolver: zodResolver(salaryPaymentSchema),
  });

  useEffect(() => {
    const savedDate = localStorage.getItem('global_lastTransactionDate');
    reset({ 
      salaryMonth: format(new Date(), 'MMMM'), 
      salaryYear: new Date().getFullYear().toString(), 
      postingDate: savedDate && isValid(new Date(savedDate)) ? new Date(savedDate) : new Date() 
    });
  }, [reset]);

  const calculateSalaryForEmployee = (employee: typeof employees[0], data: SalaryPaymentFormValues) => {
    let sortedHistory = [...(employee.salaryHistory || [])].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
    if (sortedHistory.length === 0 && DEFAULT_SALARY_MAP[employee.name.trim()] !== undefined) {
        sortedHistory = [{ amount: DEFAULT_SALARY_MAP[employee.name.trim()], effectiveDate: employee.hireDate || new Date(0).toISOString() }];
    }
    const salaryMonthDate = parse(`${data.salaryMonth} ${data.salaryYear}`, 'MMMM yyyy', new Date());
    const daysInPeriod = eachDayOfInterval({ start: startOfMonth(salaryMonthDate), end: endOfMonth(salaryMonthDate) });
    let totalPresentDays = 0; let parts: SalaryCalculationPart[] = []; const daysInMonth = getDaysInMonth(salaryMonthDate);

    if (typeof data.manualPresentDays === 'number' && data.manualPresentDays >= 0) {
        totalPresentDays = data.manualPresentDays;
        const latest = [...sortedHistory].reverse().find(h => startOfDay(parseISO(h.effectiveDate)).getTime() <= endOfMonth(salaryMonthDate).getTime());
        parts.push({ period: `Manual: ${totalPresentDays} days`, salary: latest?.amount || 0, presentDays: totalPresentDays, subtotal: (latest?.amount || 0) / daysInMonth * totalPresentDays, effectiveDate: latest?.effectiveDate || '' });
    } else {
        const empAtt = attendance.filter(a => a.employeeId === employee.id && a.date.startsWith(format(salaryMonthDate, 'yyyy-MM')));
        let subtotal: Record<string, { salary: number; days: number; total: number }> = {};
        daysInPeriod.forEach(day => {
            // Days while suspended, or after leaving and before rejoining, earn no salary.
            if (employedOn(employee, day) && empAtt.find(a => isSameDay(parseISO(a.date), day))?.status === 'Present') {
                totalPresentDays++;
                const rate = [...sortedHistory].reverse().find(h => isBefore(startOfDay(parseISO(h.effectiveDate)), day) || isEqual(startOfDay(parseISO(h.effectiveDate)), day));
                if (rate) {
                    if (!subtotal[rate.effectiveDate]) subtotal[rate.effectiveDate] = { salary: rate.amount, days: 0, total: 0 };
                    subtotal[rate.effectiveDate].days++; subtotal[rate.effectiveDate].total += rate.amount / getDaysInMonth(day);
                }
            }
        });
        Object.keys(subtotal).forEach(date => parts.push({ period: `At rate ${subtotal[date].salary}/month`, salary: subtotal[date].salary, presentDays: subtotal[date].days, subtotal: subtotal[date].total, effectiveDate: date }));
    }
    return {
      ...data, employeeId: employee.id, employeeName: employee.name,
      calculation: { parts, total: parts.reduce((s, p) => s + p.subtotal, 0), totalPresentDays, daysInMonth },
      baseSalary: currentSalary(employee, endOfMonth(salaryMonthDate)),
      // One salary per employee per month: a month already posted is shown but not posted again.
      alreadyPaid: !!findSalaryPayment(expenses, employee, data.salaryMonth, data.salaryYear),
    };
  }

  const onSubmit: SubmitHandler<SalaryPaymentFormValues> = async (data) => {
    if (!isPinVerified() && data.pin !== '0200') { toast({ variant: 'destructive', title: 'Incorrect PIN' }); return; }
    if (data.pin === '0200') confirmPin('0200');
    if (paymentMode === 'single' && !data.employeeId) return;
    // Only Active employees can be paid: suspended, dismissed and terminated people are left out.
    const active = employees.filter(isActiveEmployee);
    const targets = paymentMode === 'single' ? active.filter(e => e.id === data.employeeId) : active;
    if (targets.length === 0) { toast({ variant: 'destructive', title: 'No active employee to pay' }); return; }
    setPaymentToConfirm(targets.map(e => calculateSalaryForEmployee(e, data)));
  };

  const handleProcess = async () => {
    if (!paymentToConfirm) return;
    if (!isPinVerified() && confirmPinVal !== '0200') { toast({ variant: 'destructive', title: 'Incorrect PIN' }); return; }
    if (confirmPinVal === '0200') confirmPin('0200');

    for (const p of paymentToConfirm) {
        if (p.calculation.total <= 0 || p.alreadyPaid) continue;
        const desc = salaryDescription(p.employeeName, p.salaryMonth, p.salaryYear);
        await addExpense({ description: desc, category: 'Salaries', amount: p.calculation.total, timestamp: format(p.postingDate, 'yyyy-MM-dd'), employeeId: p.employeeId, payrollPeriod: payrollPeriodKey(p.salaryMonth, p.salaryYear), baseSalary: p.baseSalary });
        let cust = customers.find(c => c.name.toLowerCase() === p.employeeName.toLowerCase() && c.area === 'Employee');
        let cid = cust?.id;
        if (!cust) { const n = await addCustomer({ name: p.employeeName, contact: '', area: 'Employee', isPartner: false, timestamp: new Date().toISOString() }); if (n) cid = n.id; }
        if (cid) await addCustomerPayment({ customerId: cid, customerName: p.employeeName, amount: p.calculation.total, paymentMethod: 'Salary', timestamp: format(p.postingDate, 'yyyy-MM-dd'), notes: desc });
    }
    toast({ title: 'Salaries Paid' });
    setPaymentToConfirm(null); setConfirmPinVal(''); reset();
  };

  const totalBulkSalary = useMemo(() => {
    if (!paymentToConfirm) return 0;
    return paymentToConfirm.filter(p => !p.alreadyPaid).reduce((sum, p) => sum + p.calculation.total, 0);
  }, [paymentToConfirm]);

  return (
    <div className="bg-muted/30 min-h-screen">
      <PageHeader /><TransactionNav />
      <main className="container mx-auto p-4">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader><CardTitle>Salary Payment</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <RadioGroup defaultValue="single" onValueChange={(v: 'single' | 'bulk') => setPaymentMode(v)} className="flex space-x-4">
                  <div className="flex items-center space-x-2"><RadioGroupItem value="single" id="single" /><Label htmlFor="single">Single</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="bulk" id="bulk" /><Label htmlFor="bulk">All Active</Label></div>
                </RadioGroup>
                {paymentMode === 'single' && (
                  <div className="space-y-2">
                    <Label>Employee</Label>
                    <Controller name="employeeId" control={control} render={({ field }) => (
                      <Popover open={employeeComboboxOpen} onOpenChange={setEmployeeComboboxOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-between">
                            {field.value ? employees.find(e => e.id === field.value)?.name : "Select..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                          <Command>
                            <CommandInput placeholder="Search..." />
                            <CommandList>
                              <CommandEmpty>None.</CommandEmpty>
                              <CommandGroup>
                                {isLoaded && employees.filter(isActiveEmployee).map(e => (
                                  <CommandItem key={e.id} value={e.name} onSelect={() => { field.onChange(e.id); setEmployeeComboboxOpen(false); }}>
                                    <Check className={cn("mr-2 h-4 w-4", field.value === e.id ? "opacity-100" : "opacity-0")} />
                                    {e.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    )}/>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Month</Label>
                    <Controller name="salaryMonth" control={control} render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>{months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                      </Select>
                    )}/>
                  </div>
                  <div className="space-y-2">
                    <Label>Year</Label>
                    <Controller name="salaryYear" control={control} render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                      </Select>
                    )}/>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Posting Date</Label>
                  <Controller name="postingDate" control={control} render={({ field }) => (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? format(field.value, "dd-MMM-yyyy") : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                      </PopoverContent>
                    </Popover>
                  )}/>
                </div>
                <div className="space-y-2"><Label>Manual Days (Opt)</Label><Input type="number" {...register('manualPresentDays')} /></div>
                
                {!isPinVerified() && (
                    <div className="space-y-2 border-t pt-4">
                        <Label className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary"/> Security PIN</Label>
                        <Input type="password" {...register('pin')} placeholder="PIN" maxLength={4} />
                    </div>
                )}

                <Button type="submit" className="w-full">Confirm Salary</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
      <AlertDialog open={!!paymentToConfirm} onOpenChange={(o) => { if (!o) { setPaymentToConfirm(null); setConfirmPinVal(''); } }}>
        <AlertDialogContent className="max-w-3xl">
          <AlertDialogHeader><AlertDialogTitle>Process Payment</AlertDialogTitle></AlertDialogHeader>
          <ScrollArea className="max-h-[50vh] p-4 bg-muted rounded-md">
            {paymentToConfirm?.map(p => (
              <div key={p.employeeId} className="flex justify-between py-2 border-b">
                <span>{p.employeeName}{p.alreadyPaid && <span className="ml-2 text-sm text-amber-700">already paid for {p.salaryMonth} {p.salaryYear}, will be skipped</span>}</span>
                <span className={cn("font-bold", p.alreadyPaid && "line-through text-muted-foreground")}>PKR {p.calculation.total.toFixed(2)}</span>
              </div>
            ))}
          </ScrollArea>
          <div className="py-4 space-y-2 border-t font-bold text-lg text-right">Total: PKR {totalBulkSalary.toFixed(2)}</div>
          {!isPinVerified() && (<div className="py-2"><Label>Security PIN:</Label><Input type="password" value={confirmPinVal} onChange={(e) => setConfirmPinVal(e.target.value)} placeholder="0200" maxLength={4} /></div>)}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleProcess}>Post Payments</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
