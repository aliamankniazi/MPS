
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useDatabase } from '@/hooks/use-database';
import { format, startOfMonth, endOfMonth, getDaysInMonth, eachDayOfInterval, isValid, parseISO, isSameDay } from 'date-fns';
import { DollarSign, Printer, Search, Download, Briefcase } from 'lucide-react';
import { DateRangePicker } from '@/components/date-range-picker';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import * as XLSX from 'xlsx';

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
}

export default function SalaryReportPage() {
    const { employees, attendance, isLoaded } = useDatabase();
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });
    const [searchTerm, setSearchTerm] = useState('');

    const salaryReportData = useMemo(() => {
        if (!isLoaded || !dateRange.from || !dateRange.to) return [];

        const interval = { start: dateRange.from, end: dateRange.to };
        const daysInPeriodArray = eachDayOfInterval(interval);

        return employees
            .filter(emp => emp.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .map(employee => {
                const sortedHistory = [...(employee.salaryHistory || [{ amount: employee.salary, effectiveDate: employee.hireDate }])]
                    .sort((a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime());

                let calculatedSalary = 0;
                let presentDays = 0;
                
                daysInPeriodArray.forEach(day => {
                    const attendanceForDay = attendance.find(a => 
                        a.employeeId === employee.id && 
                        isValid(parseISO(a.date)) && 
                        isSameDay(parseISO(a.date), day)
                    );

                    if (attendanceForDay?.status === 'Present') {
                        presentDays++;
                        
                        const salaryForDay = [...sortedHistory]
                            .reverse()
                            .find(h => new Date(h.effectiveDate) <= day);

                        if (salaryForDay) {
                            const daysInMonthOfCurrentDay = getDaysInMonth(day);
                            const dailyRate = salaryForDay.amount / daysInMonthOfCurrentDay;
                            calculatedSalary += dailyRate;
                        }
                    }
                });

                return {
                    employeeId: employee.id,
                    employeeName: employee.name,
                    position: employee.position,
                    hireDate: employee.hireDate,
                    baseSalary: employee.salary,
                    presentDays: presentDays,
                    totalDaysInPeriod: daysInPeriodArray.length,
                    calculatedSalary: Math.round(calculatedSalary),
                    salaryHistory: [...sortedHistory].reverse(),
                };
            });
    }, [isLoaded, employees, attendance, dateRange, searchTerm]);

    const handleExportExcel = () => {
        const dataToExport = salaryReportData.map(row => ({
            'Employee Name': row.employeeName,
            'Position': row.position,
            'Hire Date': format(new Date(row.hireDate), 'dd-MMM-yyyy'),
            'Base Salary': row.baseSalary,
            'Present Days': `${row.presentDays}/${row.totalDaysInPeriod}`,
            'Calculated Salary (PKR)': row.calculatedSalary,
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Salary Report');
        XLSX.writeFile(workbook, 'SalaryReport.xlsx');
    };

    return (
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
                                    <div className="flex justify-between w-full pr-4">
                                        <div className="font-semibold">{row.employeeName} <span className="text-sm text-muted-foreground font-normal">- {row.position}</span></div>
                                        <div className="flex gap-6 text-sm">
                                            <span>Present: <span className="font-mono">{row.presentDays}/{row.totalDaysInPeriod}</span></span>
                                            <span>Base Salary: <span className="font-mono">PKR {row.baseSalary.toLocaleString()}</span></span>
                                            <span className="font-semibold">Calculated: <span className="font-mono text-green-600">PKR {row.calculatedSalary.toLocaleString()}</span></span>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div className="p-4 bg-muted/50 rounded-md">
                                        <h4 className="font-semibold mb-2">Salary History</h4>
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
                                                            <TableCell>{format(new Date(history.effectiveDate), 'dd MMMM, yyyy')}</TableCell>
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
    );
}
