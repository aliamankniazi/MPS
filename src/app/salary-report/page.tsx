
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useDatabase } from '@/hooks/use-database';
import { format, startOfMonth, endOfMonth, getDaysInMonth, eachDayOfInterval, isValid, parseISO, startOfDay, endOfDay } from 'date-fns';
import { DollarSign, Printer, Search, Download, Briefcase, Edit, PlusCircle, Trash2, Calendar as CalendarIcon } from 'lucide-react';
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
    baseSalary: number;
    presentDays: number;
    totalDaysInPeriod: number;
    calculatedSalary: number;
    salaryHistory: { amount: number; effectiveDate: string }[];
    calculationParts: SalaryCalculationPart[]; // Added for breakdown
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


export default function SalaryReportPage() {
    const { employees, attendance, isLoaded, updateEmployee } = useDatabase();
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });
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
                reset({
                    name: empDetails.name,
                    position: empDetails.position,
                    hireDate: empDetails.hireDate ? new Date(empDetails.hireDate) : new Date(),
                    salaryHistory: (empDetails.salaryHistory || []).map(h => ({
                        effectiveDate: new Date(h.effectiveDate),
                        amount: h.amount,
                    })).sort((a,b) => a.effectiveDate.getTime() - b.effectiveDate.getTime())
                });
            }
        }
    }, [employeeToEdit, employees, reset]);

    const onEditSubmit: SubmitHandler<EmployeeEditFormValues> = (data) => {
        if (!employeeToEdit) return;

        const sortedHistory = [...data.salaryHistory].sort((a,b) => b.effectiveDate.getTime() - a.effectiveDate.getTime());
        
        const updatedEmployeeData: Partial<Employee> = {
            name: data.name,
            position: data.position,
            hireDate: data.hireDate.toISOString(),
            salary: sortedHistory[0]?.amount || 0,
            salaryHistory: sortedHistory.map(h => ({...h, effectiveDate: h.effectiveDate.toISOString() })),
        };
        
        updateEmployee(employeeToEdit.employeeId, updatedEmployeeData);
        toast({ title: 'Employee Updated', description: `${data.name}'s details have been saved.`});
        setEmployeeToEdit(null);
    };

    const salaryReportData: SalaryReportRow[] = useMemo(() => {
        if (!isLoaded || !dateRange.from || !dateRange.to) return [];

        const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to) };
        const daysInPeriodArray = eachDayOfInterval(interval);

        return employees
            .filter(emp => emp.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .map(employee => {
                const sortedHistory = [...(employee.salaryHistory || [])].sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());

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
                    
                    const hireDate = employee.hireDate ? parseISO(employee.hireDate) : new Date(0);
                    const termDate = employee.terminationDate ? parseISO(employee.terminationDate) : new Date(8640000000000000);

                    if (attendanceForDay?.status === 'Present' && day.getTime() >= startOfDay(hireDate).getTime() && day.getTime() <= startOfDay(termDate).getTime()) {
                        totalPresentDays++;
                        
                        const applicableSalaryEntry = sortedHistory
                            .find(h => {
                                try {
                                    return startOfDay(parseISO(h.effectiveDate)).getTime() <= day.getTime();
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

                return {
                    employeeId: employee.id,
                    employeeName: employee.name,
                    position: employee.position,
                    hireDate: employee.hireDate,
                    baseSalary: employee.salary,
                    presentDays: totalPresentDays,
                    totalDaysInPeriod: daysInPeriodArray.length,
                    calculatedSalary: totalCalculatedSalary,
                    salaryHistory: [...(employee.salaryHistory || [])].sort((a,b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime()),
                    calculationParts: calculationParts,
                };
            });
    }, [isLoaded, employees, attendance, dateRange, searchTerm]);

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
                                        <div className="font-semibold">{row.employeeName} <span className="text-sm text-muted-foreground font-normal">- {row.position}</span></div>
                                        <div className="flex items-center gap-6">
                                            <div className="text-sm">Present: <span className="font-mono">{row.presentDays}/{row.totalDaysInPeriod}</span></div>
                                            <div className="text-sm">Base Salary: <span className="font-mono">PKR {row.baseSalary.toLocaleString()}</span></div>
                                            <div className="font-semibold">Calculated: <span className="font-mono text-green-600">PKR {row.calculatedSalary.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEmployeeToEdit(row); }}>
                                                <Edit className="w-4 h-4"/>
                                            </Button>
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
                        Update employee details and salary history. The latest salary entry will be used as the base salary.
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
                                                        <PopoverTrigger asChild>
                                                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
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
                                            <Input type="number" {...register(`salaryHistory.${index}.amount`)} />
                                        </div>
                                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="w-4 h-4 text-destructive"/></Button>
                                    </div>
                                ))}
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={() => append({ effectiveDate: new Date(), amount: 0 })}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Add Salary Entry
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
