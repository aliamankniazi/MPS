
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
import { Calendar as CalendarIcon, Sun, Check, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import { format, getDaysInMonth, getYear, getMonth, getDate, isValid, parse, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from 'date-fns';
import { useDatabase } from '@/hooks/use-database';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import React, { useState, useEffect, useMemo } from 'react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const salaryPaymentSchema = z.object({
  employeeId: z.string().optional(),
  salaryMonth: z.string().min(1, "Salary month is required."),
  salaryYear: z.string().min(4, "Salary year is required."),
  postingDate: z.date({ required_error: "A posting date is required."}),
  notes: z.string().optional(),
});

type SalaryPaymentFormValues = z.infer<typeof salaryPaymentSchema>;

type SalaryCalculationPart = {
    period: string;
    salary: number;
    daysInMonth: number;
    presentDays: number;
    subtotal: number;
    effectiveDate: string;
};

type SalaryPaymentConfirmation = SalaryPaymentFormValues & {
    employeeName: string;
    calculation: {
        parts: SalaryCalculationPart[];
        total: number;
        totalPresentDays: number;
        daysInMonth: number;
    }
    employeeId: string;
};

const months = Array.from({ length: 12 }, (_, i) => format(new Date(0, i), 'MMMM'));
const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

function PageHeader() {
    const [currentTime, setCurrentTime] = useState('');
    
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date().toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            }));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
      <header className="bg-background shadow-sm sticky top-0 z-20">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <p className="text-sm font-medium">{currentTime}</p>
            <div className="flex items-center gap-4">
                <span className="text-sm">ziakniazi@gmail.com</span>
                <Button variant="ghost" size="icon">
                    <Sun className="h-5 w-5" />
                </Button>
            </div>
        </div>
      </header>
    );
}

export default function SalaryPaymentPage() {
  const { employees, customers, addCustomer, addCustomerPayment, addExpense, isLoaded, dateRange, attendance } = useDatabase();
  const { toast } = useToast();
  const [employeeComboboxOpen, setEmployeeComboboxOpen] = useState(false);
  const [paymentToConfirm, setPaymentToConfirm] = useState<SalaryPaymentConfirmation[] | null>(null);
  const [paymentMode, setPaymentMode] = useState<'single' | 'bulk'>('single');

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<SalaryPaymentFormValues>({
    resolver: zodResolver(salaryPaymentSchema),
  });

  const activeEmployees = useMemo(() => {
    if (!employees) return [];
    return employees.filter(emp => !emp.terminationDate);
  }, [employees]);

  useEffect(() => {
    reset({
      salaryMonth: format(new Date(), 'MMMM'),
      salaryYear: new Date().getFullYear().toString(),
      postingDate: dateRange?.from || new Date(),
    });
  }, [reset, dateRange]);

  const calculateSalaryForEmployee = (employee: typeof employees[0], data: SalaryPaymentFormValues) => {
    if (!employee.salary || employee.salary < 0) {
        return null;
    }
    
    const salaryMonthDate = parse(`${data.salaryMonth} ${data.salaryYear}`, 'MMMM yyyy', new Date());
    const firstDayOfMonth = startOfMonth(salaryMonthDate);
    const lastDayOfMonth = endOfMonth(salaryMonthDate);
    const daysInMonthCount = getDaysInMonth(salaryMonthDate);
    
    const employeeAttendance = attendance.filter(a => 
        a.employeeId === employee.id &&
        isValid(parseISO(a.date)) &&
        parseISO(a.date).getFullYear() === salaryMonthDate.getFullYear() &&
        parseISO(a.date).getMonth() === salaryMonthDate.getMonth()
    );

    const history = (employee.salaryHistory && employee.salaryHistory.length > 0)
      ? employee.salaryHistory
      : [{ amount: employee.salary, effectiveDate: employee.hireDate }];
      
    const sortedHistory = [...history].sort((a, b) => parseISO(a.effectiveDate).getTime() - parseISO(b.effectiveDate).getTime());

    const calculationParts: SalaryCalculationPart[] = [];
    const daysInPeriodArray = eachDayOfInterval({ start: firstDayOfMonth, end: lastDayOfMonth });
    let totalPresentDays = 0;

    daysInPeriodArray.forEach(day => {
        const attendanceRecord = employeeAttendance.find(a => isSameDay(parseISO(a.date), day));
        if (attendanceRecord && attendanceRecord.status === 'Present') {
            totalPresentDays++;

            const applicableSalaryEntry = [...sortedHistory]
                .reverse()
                .find(h => parseISO(h.effectiveDate) <= day);

            if (applicableSalaryEntry) {
                const salaryForDay = applicableSalaryEntry.amount;
                const dailyRate = salaryForDay / daysInMonthCount;

                let part = calculationParts.find(p => p.effectiveDate === applicableSalaryEntry.effectiveDate);
                if (part) {
                    part.presentDays++;
                    part.subtotal += dailyRate;
                } else {
                    calculationParts.push({
                        period: `At rate of ${salaryForDay.toLocaleString()}/month (from ${format(parseISO(applicableSalaryEntry.effectiveDate), 'MMM dd')})`,
                        salary: salaryForDay,
                        daysInMonth: daysInMonthCount,
                        presentDays: 1,
                        subtotal: dailyRate,
                        effectiveDate: applicableSalaryEntry.effectiveDate,
                    });
                }
            }
        }
    });
    
    const totalSalary = calculationParts.reduce((sum, part) => sum + part.subtotal, 0);

    return {
        ...data,
        employeeId: employee.id,
        employeeName: employee.name,
        calculation: {
            parts: calculationParts.map(p => ({...p, subtotal: Math.round(p.subtotal)})),
            total: Math.round(totalSalary),
            totalPresentDays: totalPresentDays,
            daysInMonth: daysInMonthCount
        },
    };
  }

  const onSubmit: SubmitHandler<SalaryPaymentFormValues> = async (data) => {
    if (paymentMode === 'single') {
        if (!data.employeeId) {
            toast({ variant: 'destructive', title: 'Error', description: 'Please select an employee.' });
            return;
        }
        const employee = employees.find(e => e.id === data.employeeId);
        if (!employee) {
            toast({ variant: 'destructive', title: 'Error', description: 'Employee not found.' });
            return;
        }
        const paymentDetails = calculateSalaryForEmployee(employee, data);
        if (paymentDetails && paymentDetails.calculation.total > 0) {
            setPaymentToConfirm([paymentDetails]);
        } else {
             toast({ variant: 'destructive', title: 'Salary Not Set or Zero', description: `Salary for ${employee.name} is not set, or calculated to zero. Please update their salary or attendance.` });
        }
    } else { // Bulk mode
        const paymentsToConfirm: SalaryPaymentConfirmation[] = [];
        const employeesWithoutSalary: string[] = [];

        activeEmployees.forEach(employee => {
            const paymentDetails = calculateSalaryForEmployee(employee, data);
            if (paymentDetails && paymentDetails.calculation.total > 0) {
                paymentsToConfirm.push(paymentDetails);
            } else {
                employeesWithoutSalary.push(employee.name);
            }
        });
        
        if (employeesWithoutSalary.length > 0) {
            toast({
                variant: 'destructive',
                title: 'Salary Not Set or Zero',
                description: `Salary not processed for: ${employeesWithoutSalary.join(', ')}.`,
            });
        }
        
        if (paymentsToConfirm.length > 0) {
            setPaymentToConfirm(paymentsToConfirm);
        } else {
            toast({
                title: 'Nothing to Pay',
                description: 'No active employees with salaries and attendance found to process.',
            });
        }
    }
  };

  const handleProcessSalaryPayment = async () => {
    if (!paymentToConfirm) return;

    for (const payment of paymentToConfirm) {
        const { employeeId, salaryMonth, salaryYear, postingDate, notes, employeeName } = payment;
        const salaryAmount = payment.calculation.total;
        
        const salaryDescription = `Salary for ${employeeName} (${salaryMonth} ${salaryYear})`;
        const paymentNotes = notes ? `${salaryDescription} - ${notes}` : salaryDescription;

        // 1. Log the salary as an expense
        await addExpense({
          description: salaryDescription,
          category: 'Salaries',
          amount: salaryAmount,
          timestamp: postingDate.toISOString(),
        });

        // 2. Find or create a customer record for the employee to track payments in their ledger
        let employeeAsCustomer = customers.find(c => c.name.toLowerCase() === employeeName.toLowerCase() && c.area === 'Employee');
        
        let customerId = employeeAsCustomer?.id;
        if (!employeeAsCustomer) {
            const newCustomer = await addCustomer({
                name: employeeName,
                contact: employees.find(e => e.id === employeeId)?.mobileNumber || '',
                area: 'Employee',
                isPartner: false,
                timestamp: new Date().toISOString(),
            });
            customerId = newCustomer.id;
        }

        // 3. Log a payment against the employee's customer record (acts as a CREDIT to balance their account)
        if (customerId) {
            await addCustomerPayment({
                customerId: customerId,
                customerName: employeeName,
                amount: salaryAmount,
                paymentMethod: 'Salary',
                timestamp: postingDate.toISOString(),
                notes: paymentNotes,
            });
        }
    }


    toast({
      title: `${paymentToConfirm.length} Salaries Paid`,
      description: `Salaries for ${paymentToConfirm.length} employees have been successfully recorded.`,
    });
    
    setPaymentToConfirm(null);
    reset();
  };
  
  const totalBulkSalary = useMemo(() => {
    if (!paymentToConfirm || paymentToConfirm.length <= 1) return 0;
    return paymentToConfirm.reduce((sum, p) => sum + p.calculation.total, 0);
  }, [paymentToConfirm]);

  return (
    <>
    <div className="bg-muted/30 min-h-screen">
      <PageHeader />
      <TransactionNav />
      <main className="container mx-auto p-4">
        <div className="max-w-2xl mx-auto">
            <Card>
            <CardHeader>
                <CardTitle>New Salary Payment</CardTitle>
                <CardDescription>Calculate and record a salary payment for an employee.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <div className="space-y-2">
                        <Label>Payment Mode</Label>
                        <RadioGroup
                            defaultValue="single"
                            onValueChange={(value: 'single' | 'bulk') => setPaymentMode(value)}
                            className="flex items-center space-x-4"
                        >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="single" id="single" />
                                <Label htmlFor="single">Single Employee</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="bulk" id="bulk" />
                                <Label htmlFor="bulk">All Active Employees</Label>
                            </div>
                        </RadioGroup>
                    </div>

                    {paymentMode === 'single' && (
                        <div className="space-y-2">
                            <Label>Employee</Label>
                            <Controller
                                name="employeeId"
                                control={control}
                                render={({ field }) => (
                                    <Popover open={employeeComboboxOpen} onOpenChange={setEmployeeComboboxOpen}>
                                    <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={employeeComboboxOpen}
                                        className="w-full justify-between"
                                    >
                                        {field.value
                                        ? activeEmployees.find((e) => e.id === field.value)?.name
                                        : "Select an employee..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                    <Command>
                                        <CommandInput placeholder="Search employee..." />
                                        <CommandList>
                                        <CommandEmpty>No employee found.</CommandEmpty>
                                        <CommandGroup>
                                            {isLoaded ? activeEmployees.map(e => (
                                            <CommandItem
                                                key={e.id}
                                                value={e.name}
                                                onSelect={() => {
                                                field.onChange(e.id);
                                                setEmployeeComboboxOpen(false);
                                                }}
                                            >
                                                <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    field.value === e.id ? "opacity-100" : "opacity-0"
                                                )}
                                                />
                                                {e.name} - {e.position}
                                            </CommandItem>
                                            )) : <CommandItem disabled>Loading...</CommandItem>}
                                        </CommandGroup>
                                        </CommandList>
                                    </Command>
                                    </PopoverContent>
                                </Popover>
                                )}
                            />
                            {errors.employeeId && <p className="text-sm text-destructive">{errors.employeeId.message}</p>}
                        </div>
                    )}


                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Salary Month</Label>
                             <Controller
                                name="salaryMonth"
                                control={control}
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                                    </SelectContent>
                                    </Select>
                                )}
                            />
                            {errors.salaryMonth && <p className="text-sm text-destructive">{errors.salaryMonth.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Year</Label>
                            <Controller
                                name="salaryYear"
                                control={control}
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                                    </SelectContent>
                                    </Select>
                                )}
                            />
                            {errors.salaryYear && <p className="text-sm text-destructive">{errors.salaryYear.message}</p>}
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <Label>Posting Date</Label>
                        <Controller
                            name="postingDate"
                            control={control}
                            render={({ field }) => {
                                const handleDateChange = (part: 'day' | 'month' | 'year', value: string) => {
                                    const currentDate = field.value || new Date();
                                    let newDate = new Date(currentDate);
                    
                                    if (part === 'year') newDate.setFullYear(parseInt(value, 10));
                                    if (part === 'month') newDate.setMonth(parseInt(value, 10));
                                    if (part === 'day') newDate.setDate(parseInt(value, 10));
                                    
                                    const daysInNewMonth = getDaysInMonth(newDate);
                                    if (newDate.getDate() > daysInNewMonth) {
                                        newDate.setDate(daysInNewMonth);
                                    }
                    
                                    if (isValid(newDate)) {
                                        field.onChange(newDate);
                                    }
                                };
                                
                                const selectedDate = field.value || new Date();
                                const currentDay = getDate(selectedDate).toString();
                                const currentMonth = getMonth(selectedDate).toString();
                                const currentYear = getYear(selectedDate).toString();
                    
                                const years = Array.from({ length: 20 }, (_, i) => (new Date().getFullYear() - 10 + i).toString());
                                const months = Array.from({ length: 12 }, (_, i) => ({ value: i.toString(), label: format(new Date(0, i), 'MMMM') }));
                                const daysInMonth = getDaysInMonth(selectedDate);
                                const days = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString());
                    
                                return (
                                    <div className="flex gap-2">
                                        <Select value={currentDay} onValueChange={(val) => handleDateChange('day', val)}>
                                            <SelectTrigger className="w-[80px]"><SelectValue placeholder="Day" /></SelectTrigger>
                                            <SelectContent>
                                                {days.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <Select value={currentMonth} onValueChange={(val) => handleDateChange('month', val)}>
                                            <SelectTrigger className="w-[120px]"><SelectValue placeholder="Month" /></SelectTrigger>
                                            <SelectContent>
                                                {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <Select value={currentYear} onValueChange={(val) => handleDateChange('year', val)}>
                                            <SelectTrigger className="w-[100px]"><SelectValue placeholder="Year" /></SelectTrigger>
                                            <SelectContent>
                                                {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                );
                            }}
                        />
                        {errors.postingDate && <p className="text-sm text-destructive">{errors.postingDate.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="notes">Notes (Optional)</Label>
                        <Textarea id="notes" {...register('notes')} placeholder="e.g., Including overtime payment" />
                    </div>

                    <Button type="submit" className="w-full">Calculate & Confirm Salary</Button>
                </form>
            </CardContent>
            </Card>
        </div>
      </main>
    </div>

    <AlertDialog open={!!paymentToConfirm} onOpenChange={(isOpen) => !isOpen && setPaymentToConfirm(null)}>
        <AlertDialogContent className="max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/> Confirm Salary Payment</AlertDialogTitle>
            <AlertDialogDescription>
              Please review and confirm the salary payment details before posting to the ledger.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {paymentToConfirm && paymentToConfirm.length > 0 && (
            paymentToConfirm.length === 1 ? (
                <div className="text-sm space-y-2 my-4 p-4 bg-muted rounded-md">
                    <div className="flex justify-between font-semibold">
                        <span>Employee:</span>
                        <span>{paymentToConfirm[0].employeeName}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Salary for:</span>
                        <span>{paymentToConfirm[0].salaryMonth} {paymentToConfirm[0].salaryYear}</span>
                    </div>
                    <Separator />
                    {paymentToConfirm[0].calculation.parts.map((part, index) => (
                        <div key={index} className="space-y-1 border-b pb-2">
                            <p className="font-medium">{part.period}</p>
                            <div className="flex justify-between text-muted-foreground">
                                <span>Present Days:</span>
                                <span>{part.presentDays}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                                <span>Subtotal:</span>
                                <span className="font-mono">PKR {part.subtotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                        </div>
                    ))}
                    <Separator />
                    <div className="flex justify-between text-lg font-bold pt-2">
                        <span>Total Present Days:</span>
                        <span className="text-primary">{paymentToConfirm[0].calculation.totalPresentDays}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold">
                        <span>Final Calculated Salary:</span>
                        <span className="text-primary">PKR {paymentToConfirm[0].calculation.total.toLocaleString()}</span>
                    </div>
                </div>
            ) : (
                <ScrollArea className="max-h-[50vh] my-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Employee</TableHead>
                                <TableHead>Attendance</TableHead>
                                <TableHead className="text-right">Calculated Salary</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paymentToConfirm.map(p => (
                                <TableRow key={p.employeeId}>
                                    <TableCell>{p.employeeName}</TableCell>
                                    <TableCell>{p.calculation.totalPresentDays}/{p.calculation.daysInMonth}</TableCell>
                                    <TableCell className="text-right font-semibold">PKR {p.calculation.total.toLocaleString()}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <div className="text-right mt-4 font-bold text-lg">
                        Total Payroll: PKR {totalBulkSalary.toLocaleString()}
                    </div>
                </ScrollArea>
            )
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleProcessSalaryPayment}>
              {paymentToConfirm && paymentToConfirm.length > 1 ? `Confirm & Pay ${paymentToConfirm.length} Salaries` : 'Confirm & Post Payment'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
