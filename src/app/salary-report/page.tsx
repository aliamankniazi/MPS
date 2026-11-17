'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useDatabase } from '@/hooks/use-database';
import { format, startOfMonth, endOfMonth, getDaysInMonth, eachDayOfInterval, isValid, parseISO, startOfDay, endOfDay, isBefore, isEqual, isSameDay } from 'date-fns';
import { DollarSign, Printer, Search, Download, Briefcase, Edit, PlusCircle, Trash2, Calendar as CalendarIcon, BookText } from 'lucide-react';
import { DateRangePicker } from '@/components/date-range-picker';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useForm, useFieldArray, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Employee } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { currentSalary, employedOn, LifecycleError, reviseSalary, salaryHistoryOf, salaryOn, statusOf } from '@/lib/employee-lifecycle';
import Link from 'next/link';

const DEFAULT_SALARY_MAP: Record<string, number> = {
    'Asmat Ullah': 15000,
    'Zeeshan': 15000,
    'Shahzad': 15000,
    'Kamran': 5000,
    'Neemat Ullah': 25000,
    'Younas Shah': 20000,
};

// New interface for breakdown
interface SalaryCalculationPart {
    period: string;
    salary: number;
    presentDays: number;
    subtotal: number;
    effectiveDate: string;
}

interface SalaryReportRow {
    employeeId: string;
    employeeName: string;
    position: string;
    hireDate: string;
    status: string;
    baseSalary: number;
    presentDays: number;
    totalDaysInPeriod: number;
    calculatedSalary: number;
    salaryHistory: { amount: number; effectiveDate: string }[];
    calculationParts: SalaryCalculationPart[]; // Added for breakdown
    customerProfileId?: string;
}

const employeeEditSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  position: z.string().min(1, 'Position is required'),
  hireDate: z.date(),
  salaryHistory: z.array(z.object({
    effectiveDate: z.date(),
    amount: z.coerce.number().min(0, "Salary must be a positive number"),
  })).min(1, "At least one salary entry is required."),
});

type EmployeeEditFormValues = z.infer<typeof employeeEditSchema>;


const STATUS_TEXT: Record<string, string> = { Suspended: 'text-amber-700', Dismissed: 'text-red-700', Terminated: 'text-slate-600' };

export default function SalaryReportPage() {
    const { employees, attendance, isLoaded, updateEmployee, dateRange, setDateRange, customers } = useDatabase();
    const { user } = useAuth();
    // How many salary entries the employee already had when the edit window opened: those cannot be changed or removed.
    const [lockedSalaryRows, setLockedSalaryRows] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [employeeToEdit, setEmployeeToEdit] = useState<SalaryReportRow | null>(null);
    const { toast } = useToast();

    const { register, control, handleSubmit, reset, formState: { errors } } = useForm<EmployeeEditFormValues>({
        resolver: zodResolver(employeeEditSchema),
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: "salaryHistory",
    });

    useEffect(() => {
        if (employeeToEdit) {
            const empDetails = employees.find(e => e.id === employeeToEdit.employeeId);
            if (empDetails) {
                const existing = salaryHistoryOf(empDetails);
                setLockedSalaryRows(existing.length);
                reset({
                    name: empDetails.name,
                    position: empDetails.position,
                    hireDate: empDetails.hireDate ? new Date(empDetails.hireDate) : new Date(),
                    salaryHistory: existing.map(h => ({
                        effectiveDate: parseISO(h.effectiveDate),
                        amount: h.amount,
                    }))
                });
            }
        }
    }, [employeeToEdit, employees, reset]);

    const onEditSubmit: SubmitHandler<EmployeeEditFormValues> = (data) => {
        if (!employeeToEdit) return;

        const empDetails = employees.find(e => e.id === employeeToEdit.employeeId);
        if (!empDetails) return;

        // Earlier salaries are kept exactly as they are. Each new row is added as a revision
        // with its own effective date, through the same rule the Employee Management screen uses.
        let revised: Employee = { ...empDetails, hireDate: data.hireDate.toISOString() };
        try {
            for (const row of data.salaryHistory.slice(lockedSalaryRows)) {
                revised = { ...revised, ...reviseSalary(revised, { amount: row.amount, effectiveDate: format(row.effectiveDate, 'yyyy-MM-dd'), performedBy: user?.email ?? '' }) };
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'Salary not saved', description: error instanceof LifecycleError ? error.message : 'Please check the salary entries.' });
            return;
        }

        const updatedEmployeeData: Partial<Employee> = {
            name: data.name,
            position: data.position,
            hireDate: data.hireDate.toISOString(),
            salary: currentSalary(revised),
            salaryHistory: salaryHistoryOf(revised),
        };

        updateEmployee(employeeToEdit.employeeId, updatedEmployeeData);
        toast({ title: 'Employee Updated', description: `${data.name}'s details have been saved.`});
        setEmployeeToEdit(null);
    };

    const salaryReportData: SalaryReportRow[] = useMemo(() => {
        if (!isLoaded || !dateRange || !dateRange.from || !dateRange.to) return [];

        const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to) };
        const daysInPeriodArray = eachDayOfInterval(interval);

        return employees
            .filter(emp => emp.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .map(employee => {
                let sortedHistory = [...(employee.salaryHistory || [])].sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());

                // Default salary logic for specific names if no history is provided
                if (sortedHistory.length === 0) {
                    const defaultAmount = DEFAULT_SALARY_MAP[employee.name.trim()];
                    if (defaultAmount !== undefined) {
                        sortedHistory = [{
                            amount: defaultAmount,
                            effectiveDate: employee.hireDate || new Date(0).toISOString()
                        }];
                    }
                }

                let subtotalForRate: { [key: string]: { salary: number; days: number; total: number } } = {};
                let totalPresentDays = 0;

                daysInPeriodArray.forEach(day => {
                    const attendanceForDay = attendance.find(a => {
                        try {
                            return a.employeeId === employee.id && isSameDay(parseISO(a.date), day);
                        } catch {
                            return false;
                        }
                    });

                    // Only days the person was actually employed count: not before hiring, not while
                    // suspended, not after leaving, and again from the day they rejoin.
                    if (attendanceForDay?.status === 'Present' && employedOn(employee, day)) {
                        totalPresentDays++;

                        const applicableSalaryEntry = sortedHistory
                            .find(h => {
                                try {
                                    const effectiveDate = startOfDay(parseISO(h.effectiveDate));
                                    return isBefore(effectiveDate, day) || isEqual(effectiveDate, day);
                                } catch {
                                    return false;
                                }
                            });

                        if (applicableSalaryEntry) {
                            const salaryForDay = applicableSalaryEntry.amount;
                            const effectiveDateForGrouping = applicableSalaryEntry.effectiveDate;
                            const daysInMonthOfCurrentDay = getDaysInMonth(day);

                            if (salaryForDay > 0) {
                                const dailyRate = salaryForDay / daysInMonthOfCurrentDay;

                                if (!subtotalForRate[effectiveDateForGrouping]) {
                                    subtotalForRate[effectiveDateForGrouping] = { salary: salaryForDay, days: 0, total: 0 };
                                }
                                subtotalForRate[effectiveDateForGrouping].days++;
                                subtotalForRate[effectiveDateForGrouping].total += dailyRate;
                            }
                        }
                    }
                });

                const calculationParts: SalaryCalculationPart[] = Object.keys(subtotalForRate).map(effectiveDate => {
                    const rateInfo = subtotalForRate[effectiveDate];
                    return {
                        period: `At rate of ${rateInfo.salary.toLocaleString()}/month (from ${format(parseISO(effectiveDate), 'MMM dd')})`,
                        salary: rateInfo.salary,
                        presentDays: rateInfo.days,
                        subtotal: rateInfo.total,
                        effectiveDate: effectiveDate,
                    };
                });

                const totalCalculatedSalary = calculationParts.reduce((sum, part) => sum + part.subtotal, 0);

                // Find matching customer record for ledger linking
                const matchingCustomer = customers.find(c => c.name.toLowerCase() === employee.name.toLowerCase() && c.area === 'Employee');

                return {
                    employeeId: employee.id,
                    employeeName: employee.name,
                    position: employee.position,
                    hireDate: employee.hireDate,
                    status: statusOf(employee),
                    baseSalary: salaryOn(sortedHistory, new Date())?.amount ?? sortedHistory[0]?.amount ?? employee.salary,
                    presentDays: totalPresentDays,
                    totalDaysInPeriod: daysInPeriodArray.length,
                    calculatedSalary: totalCalculatedSalary,
                    salaryHistory: sortedHistory,
                    calculationParts: calculationParts,
                    customerProfileId: matchingCustomer?.id
                };
            });
    }, [isLoaded, employees, attendance, dateRange, searchTerm, customers]);

    const handleExportExcel = () => {
        const dataToExport = salaryReportData.map(row => ({
            'Employee Name': row.employeeName,
            'Position': row.position,
            'Hire Date': row.hireDate ? format(parseISO(row.hireDate), 'dd-MMM-yyyy') : 'N/A',
            'Base Salary': row.baseSalary,
            'Present Days': `${row.presentDays}/${row.totalDaysInPeriod}`,
            'Calculated Salary (PKR)': row.calculatedSalary.toFixed(2),
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Salary Report');
        XLSX.writeFile(workbook, 'SalaryReport.xlsx');
    };

    return (
        <>
        <div className="p-4 md:p-8">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Briefcase /> Employee Salary Report
                            </CardTitle>
                            <CardDescription>
                               Calculated salaries based on attendance for the selected period.
                            </CardDescription>
                        </div>
                         <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search employee..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 w-full sm:w-auto"
                                />
                            </div>
                           <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                           <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4"/> Print</Button>
                           <Button variant="outline" onClick={handleExportExcel}><Download className="mr-2 h-4 w-4"/> Excel</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Accordion type="single" collapsible className="w-full">
                        {isLoaded && salaryReportData.length > 0 ? salaryReportData.map(row => (
                             <AccordionItem value={row.employeeId} key={row.employeeId}>
                                <AccordionTrigger>
                                    <div className="flex justify-between w-full pr-4 items-center">
                                        <div className="font-semibold">{row.employeeName} <span className="text-sm text-muted-foreground font-normal">- {row.position}</span>{row.status !== 'Active' && <span className={cn("ml-2 text-xs font-medium", STATUS_TEXT[row.status])}>({row.status})</span>}</div>
                                        <div className="flex items-center gap-6">
                                            <div className="text-sm">Present: <span className="font-mono">{row.presentDays}/{row.totalDaysInPeriod}</span></div>
                                            <div className="text-sm">Base Salary: <span className="font-mono">PKR {row.baseSalary.toLocaleString()}</span></div>
                                            <div className="font-semibold">Calculated: <span className="font-mono text-green-600">PKR {row.calculatedSalary.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                            <div className="flex items-center gap-1">
                                                {row.customerProfileId && (
                                                    <Button asChild variant="ghost" size="icon" title="View Full Ledger" onClick={(e) => e.stopPropagation()}>
                                                        <Link href={`/customers/${row.customerProfileId}/ledger`}>
                                                            <BookText className="w-4 h-4 text-primary" />
                                                        </Link>
                                                    </Button>
                                                )}
                                                <Button asChild variant="ghost" size="icon" title="Edit Professional Details" onClick={(e) => { e.stopPropagation(); setEmployeeToEdit(row); }}>
                                                    <span><Edit className="w-4 h-4"/></span>
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div className="p-4 bg-muted/50 rounded-md">
                                        <h4 className="font-semibold mb-2">Salary Calculation Breakdown</h4>
                                        {row.calculationParts.length > 0 ? (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Period / Rate</TableHead>
                                                        <TableHead className="text-right">Present Days</TableHead>
                                                        <TableHead className="text-right">Salary Subtotal</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {row.calculationParts.map((part, index) => (
                                                        <TableRow key={index}>
                                                            <TableCell>{part.period}</TableCell>
                                                            <TableCell className="text-right">{part.presentDays}</TableCell>
                                                            <TableCell className="text-right font-mono">PKR {part.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">No attendance found for this period.</p>
                                        )}

                                        <h4 className="font-semibold mt-4 mb-2">Salary Change History</h4>
                                        {row.salaryHistory && row.salaryHistory.length > 0 ? (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Effective Date</TableHead>
                                                        <TableHead className="text-right">Salary Amount</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {row.salaryHistory.map((history, index) => (
                                                        <TableRow key={index}>
                                                            <TableCell>{format(parseISO(history.effectiveDate), 'dd MMMM, yyyy')}</TableCell>
                                                            <TableCell className="text-right font-mono">PKR {history.amount.toLocaleString()}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">No salary increase history found.</p>
                                        )}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        )) : (
                            <div className="text-center p-8 text-muted-foreground">
                                {isLoaded ? 'No salary data found for the selected period.' : 'Loading report data...'}
                            </div>
                        )}
                    </Accordion>
                </CardContent>
            </Card>
        </div>

        <Dialog open={!!employeeToEdit} onOpenChange={(isOpen) => { if(!isOpen) setEmployeeToEdit(null)}}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Edit Employee: {employeeToEdit?.employeeName}</DialogTitle>
                    <DialogDescription>
                        Update employee details and add a salary revision. Earlier salaries stay on record and cannot be changed; a new entry applies from its effective date.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onEditSubmit)}>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Name</Label>
                                <Input id="name" {...register("name")} />
                                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="position">Position</Label>
                                <Input id="position" {...register("position")} />
                                {errors.position && <p className="text-sm text-destructive">{errors.position.message}</p>}
                            </div>
                        </div>
                         <div className="space-y-2">
                            <Label>Hire Date</Label>
                            <Controller
                                name="hireDate"
                                control={control}
                                render={({ field }) => (
                                     <Popover>
                                        <PopoverTrigger asChild>
                                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                        </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent>
                                    </Popover>
                                )}
                            />
                             {errors.hireDate && <p className="text-sm text-destructive">{errors.hireDate.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label>Salary History</Label>
                            <div className="space-y-2">
                                {fields.map((item, index) => (
                                    <div key={item.id} className="flex items-end gap-2">
                                        <Controller
                                            name={`salaryHistory.${index}.effectiveDate`}
                                            control={control}
                                            render={({ field }) => (
                                                <div className="flex-1 space-y-1">
                                                    <Label className="text-xs">Effective Date</Label>
                                                    <Popover>
                                                        <PopoverTrigger asChild disabled={index < lockedSalaryRows}>
                                                        <Button variant="outline" disabled={index < lockedSalaryRows} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                                            {field.value ? format(field.value, "dd-MMM-yy") : <span>Pick a date</span>}
                                                        </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent>
                                                    </Popover>
                                                </div>
                                            )}
                                        />
                                        <div className="flex-1 space-y-1">
                                            <Label className="text-xs">Monthly Salary</Label>
                                            <Input type="number" readOnly={index < lockedSalaryRows} className={cn(index < lockedSalaryRows && "bg-muted")} {...register(`salaryHistory.${index}.amount`)} />
                                        </div>
                                        {index < lockedSalaryRows
                                            ? <span className="w-10 pb-2 text-center text-xs text-muted-foreground" title="Earlier salaries are kept and cannot be removed">kept</span>
                                            : <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="w-4 h-4 text-destructive"/></Button>}
                                    </div>
                                ))}
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={() => append({ effectiveDate: new Date(), amount: 0 })}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Add Salary Revision
                            </Button>
                            {errors.salaryHistory && <p className="text-sm text-destructive">{errors.salaryHistory.message || errors.salaryHistory.root?.message}</p>}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => setEmployeeToEdit(null)}>Cancel</Button>
                        <Button type="submit">Save Changes</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
        </>
    );
}
