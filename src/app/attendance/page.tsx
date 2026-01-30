
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Users, UserPlus, List, Edit, Trash2, AlertTriangle, Calendar as CalendarIcon, UserX, UserCheck, Search, CheckCircle, XCircle, Clock, HelpCircle, X } from 'lucide-react';
import { format, getDaysInMonth, getYear, getMonth, getDate, isValid, parseISO, startOfDay } from 'date-fns';
import { useDatabase } from '@/hooks/use-database';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { Employee, AttendanceRecord, SalaryHistoryEntry } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { DateRangePicker } from '@/components/date-range-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';


const employeeSchema = z.object({
  name: z.string().min(1, 'Employee name is required'),
  mobileNumber: z.string().optional(),
  position: z.string().min(1, 'Position is required'),
  salary: z.coerce.number().min(0, 'Salary must be a positive number'),
  hireDate: z.date({ required_error: "Hire date is required."}),
  terminationDate: z.date().optional().nullable(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

const salaryIncreaseSchema = z.object({
    newSalary: z.coerce.number().min(0, 'New salary must be a positive number'),
    effectiveDate: z.date({ required_error: 'Effective date is required' }),
});

type SalaryIncreaseFormValues = z.infer<typeof salaryIncreaseSchema>;

export default function EmployeeManagementPage() {
  const { employees, addEmployee, updateEmployee, deleteEmployee, attendance, addAttendance, isLoaded, dateRange, setDateRange } = useDatabase();
  const { toast } = useToast();
  
  const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [showTerminated, setShowTerminated] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(new Date());


  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { hireDate: new Date() }
  });

  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEdit, setValue: setEditValue, control: controlEdit, formState: { errors: editErrors } } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
  });
  
  const { register: registerIncrease, handleSubmit: handleSubmitIncrease, reset: resetIncrease, control: controlIncrease, formState: { errors: increaseErrors } } = useForm<SalaryIncreaseFormValues>({
    resolver: zodResolver(salaryIncreaseSchema),
    defaultValues: { effectiveDate: new Date() }
  });

  const onAddSubmit: SubmitHandler<EmployeeFormValues> = async (data) => {
    const hireDateStr = format(data.hireDate, 'yyyy-MM-dd');
    const initialSalaryHistory: SalaryHistoryEntry[] = [{
        amount: data.salary,
        effectiveDate: hireDateStr,
    }];

    const newEmployee = await addEmployee({ 
        ...data, 
        hireDate: hireDateStr, 
        timestamp: new Date().toISOString(),
        salaryHistory: initialSalaryHistory 
    });
    
    addAttendance({
      employeeId: newEmployee.id,
      employeeName: newEmployee.name,
      date: format(attendanceDate, 'yyyy-MM-dd'),
      status: 'Present',
    });

    toast({
      title: 'Employee Added & Attendance Marked',
      description: `${data.name} has been added and marked as Present for ${format(attendanceDate, 'dd-MMM-yyyy')}.`,
    });
    
    reset({ name: '', mobileNumber: '', position: '', salary: 0, hireDate: new Date() });
  };
  
  const onEditSubmit: SubmitHandler<EmployeeFormValues> = (data) => {
    if (!employeeToEdit) return;

    const updates: Partial<Employee> = {
        ...data,
        hireDate: format(data.hireDate, 'yyyy-MM-dd'),
        terminationDate: data.terminationDate ? format(data.terminationDate, 'yyyy-MM-dd') : null,
      };
      
    updateEmployee(employeeToEdit.id, updates);
    toast({
        title: 'Employee Updated',
        description: "The employee's details have been saved."
    });
    setEmployeeToEdit(null);
  };
  
  const onSalaryIncreaseSubmit: SubmitHandler<SalaryIncreaseFormValues> = (data) => {
    if (!employeeToEdit) return;
  
    const newHistoryEntry: SalaryHistoryEntry = {
      amount: data.newSalary,
      effectiveDate: format(data.effectiveDate, 'yyyy-MM-dd'),
    };
  
    const currentHistory = employeeToEdit.salaryHistory ? [...employeeToEdit.salaryHistory] : [];
  
    if (currentHistory.length === 0 && employeeToEdit.hireDate) {
        currentHistory.push({
            amount: employeeToEdit.salary,
            effectiveDate: employeeToEdit.hireDate,
        });
    }

    currentHistory.push(newHistoryEntry);
    
    const uniqueHistory = Array.from(new Map(currentHistory.map(item => [item.effectiveDate.split('T')[0], item])).values());
    const updatedHistory = uniqueHistory.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  
    updateEmployee(employeeToEdit.id, {
      salary: data.newSalary,
      salaryHistory: updatedHistory,
    });
  
    toast({
      title: "Salary Updated",
      description: `${employeeToEdit.name}'s salary has been updated to PKR ${data.newSalary.toLocaleString()}.`,
    });
  
    setEmployeeToEdit(null);
    resetIncrease();
  };


  const handleDeleteEmployee = () => {
    if (!employeeToDelete) return;
    deleteEmployee(employeeToDelete.id);
    toast({
        title: 'Employee Deleted',
        description: `${employeeToDelete.name} has been removed.`,
    });
    setEmployeeToDelete(null);
  };

  const handleReactivate = (employee: Employee) => {
    updateEmployee(employee.id, { ...employee, terminationDate: null });
    toast({
        title: 'Employee Reactivated',
        description: `${employee.name} is now an active employee.`,
    });
  }

  const allPositions = useMemo(() => {
    return [...new Set(employees.map(e => e.position).filter(Boolean))];
  }, [employees]);

  const employeesForAttendanceSheet = useMemo(() => {
    const attendanceDay = startOfDay(attendanceDate);
    return employees.filter(emp => {
      if (!emp.hireDate) return false;
      const hireDate = parseISO(emp.hireDate);
      if (!isValid(hireDate) || hireDate > attendanceDay) {
        return false;
      }
      if (emp.terminationDate) {
        const terminationDate = parseISO(emp.terminationDate);
        if (isValid(terminationDate) && attendanceDay > terminationDate) {
          return false;
        }
      }
      return true;
    });
  }, [employees, attendanceDate]);
  
  const activeEmployees = useMemo(() => {
    return employees.filter(emp => !emp.terminationDate);
  }, [employees]);
  
  const selectedDayAttendance = useMemo(() => {
    const selectedDateStr = format(attendanceDate, 'yyyy-MM-dd');
    return attendance.filter(a => a.date.startsWith(selectedDateStr));
  }, [attendance, attendanceDate]);

  const dailySummary = useMemo(() => {
    const present = selectedDayAttendance.filter(a => a.status === 'Present').length;
    const absent = selectedDayAttendance.filter(a => a.status === 'Absent').length;
    const leave = selectedDayAttendance.filter(a => a.status === 'Leave').length;
    const total = employeesForAttendanceSheet.length;
    const unmarked = total - present - absent - leave;
    return { present, absent, leave, unmarked, total };
  }, [selectedDayAttendance, employeesForAttendanceSheet]);
  
  const handleAttendanceChange = (employee: Employee, status: 'Present' | 'Absent' | 'Leave') => {
      addAttendance({
          employeeId: employee.id,
          employeeName: employee.name,
          date: format(attendanceDate, 'yyyy-MM-dd'),
          status: status,
      });

      toast({
          title: 'Attendance Marked',
          description: `${employee.name} marked as ${status} for ${format(attendanceDate, 'dd-MMM-yyyy')}.`,
      });
  };

  const handleMarkAllPresent = () => {
    const dateStr = format(attendanceDate, 'yyyy-MM-dd');
    employeesForAttendanceSheet.forEach(emp => {
        const currentStatus = selectedDayAttendance.find(a => a.employeeId === emp.id)?.status;
        if (!currentStatus || currentStatus !== 'Present') {
             addAttendance({
                employeeId: emp.id,
                employeeName: emp.name,
                date: dateStr,
                status: 'Present',
            });
        }
    });
    toast({
      title: 'Attendance Marked',
      description: `All employees marked as Present for ${format(attendanceDate, 'dd-MMM-yyyy')}.`,
    });
  }
  
  const filteredHistory = useMemo(() => {
    if (!dateRange?.from) return attendance.sort((a,b) => b.date.localeCompare(a.date));

    const from = format(dateRange.from, 'yyyy-MM-dd');
    const to = format(dateRange.to || dateRange.from, 'yyyy-MM-dd');

    return attendance.filter(a => {
        if (!a.date) return false;
        return a.date >= from && a.date <= to;
    }).sort((a,b) => b.date.localeCompare(a.date));

  }, [attendance, dateRange]);

  const attendanceSummary = useMemo(() => {
    if (!dateRange?.from) return null;

    const presentCount = filteredHistory.filter(r => r.status === 'Present').length;
    const absentCount = filteredHistory.filter(r => r.status === 'Absent').length;
    const leaveCount = filteredHistory.filter(r => r.status === 'Leave').length;

    const markedEmployeeIds = new Set(filteredHistory.map(r => r.employeeId));
    const notMarkedCount = activeEmployees.filter(emp => !markedEmployeeIds.has(emp.id)).length;

    return {
      present: presentCount,
      absent: absentCount,
      leave: leaveCount,
      notMarked: notMarkedCount,
      total: activeEmployees.length,
    };
  }, [filteredHistory, activeEmployees, dateRange]);


  const filteredEmployees = useMemo(() => {
    let filtered = employees;

    if (!showTerminated) {
        filtered = filtered.filter(emp => !emp.terminationDate);
    }
    
    if (positionFilter && positionFilter !== 'all') {
      filtered = filtered.filter(emp => emp.position === positionFilter);
    }

    if (searchTerm) {
        filtered = filtered.filter(emp => 
            emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            emp.position.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }
    
    return filtered;
  }, [employees, showTerminated, searchTerm, positionFilter]);
  
  useEffect(() => {
    if (employeeToEdit) {
      setEditValue('name', employeeToEdit.name);
      setEditValue('mobileNumber', employeeToEdit.mobileNumber);
      setEditValue('position', employeeToEdit.position);
      setEditValue('salary', employeeToEdit.salary);
      setEditValue('hireDate', employeeToEdit.hireDate ? parseISO(employeeToEdit.hireDate) : new Date());
      setEditValue('terminationDate', employeeToEdit.terminationDate ? parseISO(employeeToEdit.terminationDate) : null);
    } else {
      resetEdit();
    }
  }, [employeeToEdit, setEditValue, resetEdit]);

  const previousSalaryEntry = useMemo(() => {
    if (!employeeToEdit || !employeeToEdit.salaryHistory || employeeToEdit.salaryHistory.length < 2) {
      return null;
    }
    const sorted = [...employeeToEdit.salaryHistory].sort((a,b) => b.effectiveDate.localeCompare(a.effectiveDate));
    return sorted[1];
  }, [employeeToEdit]);

  return (
    <>
    <div className="p-4 md:p-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Attendance Sheet</CardTitle>
                            <CardDescription>Mark attendance for the selected date.</CardDescription>
                        </div>
                         <div className="flex items-center gap-2">
                            <Button onClick={handleMarkAllPresent}><UserCheck className="mr-2 h-4 w-4"/> Mark All Present</Button>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-[280px] justify-start text-left font-normal", !attendanceDate && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {attendanceDate ? format(attendanceDate, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar mode="single" selected={attendanceDate} onSelect={(d) => d && setAttendanceDate(d)} initialFocus />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-5 gap-4 mb-6 text-center">
                        <div className="p-3 bg-muted/30 rounded-lg">
                            <div className="text-2xl font-bold">{dailySummary.total}</div>
                            <div className="text-xs text-muted-foreground">Total</div>
                        </div>
                        <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">{dailySummary.present}</div>
                            <div className="text-xs text-green-700 dark:text-green-300">Present</div>
                        </div>
                        <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-lg">
                            <div className="text-2xl font-bold text-red-600">{dailySummary.absent}</div>
                            <div className="text-xs text-red-700 dark:text-red-300">Absent</div>
                        </div>
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">{dailySummary.leave}</div>
                            <div className="text-xs text-blue-700 dark:text-blue-300">Leave</div>
                        </div>
                        <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                            <div className="text-2xl font-bold">{dailySummary.unmarked}</div>
                            <div className="text-xs text-muted-foreground">Unmarked</div>
                        </div>
                    </div>
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                <TableHead>Employee</TableHead>
                                <TableHead className="text-center w-[300px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                            {employeesForAttendanceSheet.map(emp => {
                                const currentStatus = selectedDayAttendance.find(a => a.employeeId === emp.id)?.status;
                                return (
                                <TableRow key={emp.id}>
                                    <TableCell>
                                        <div className="font-medium">{emp.name}</div>
                                        <div className="text-sm text-muted-foreground">{emp.position}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-center gap-2">
                                        <Button
                                            variant={currentStatus === 'Present' ? 'default' : 'outline'}
                                            size="sm"
                                            className={cn(currentStatus === 'Present' && 'bg-green-500 hover:bg-green-600 text-white')}
                                            onClick={() => handleAttendanceChange(emp, 'Present')}
                                        >
                                            <UserCheck className="w-4 h-4 mr-2"/> Present
                                        </Button>
                                        <Button
                                            variant={currentStatus === 'Absent' ? 'destructive' : 'outline'}
                                            size="sm"
                                            onClick={() => handleAttendanceChange(emp, 'Absent')}
                                        >
                                            <UserX className="w-4 h-4 mr-2"/> Absent
                                        </Button>
                                        <Button
                                            variant={currentStatus === 'Leave' ? 'secondary' : 'outline'}
                                            size="sm"
                                            className={cn(currentStatus === 'Leave' && 'bg-blue-500 hover:bg-blue-600 text-white')}
                                            onClick={() => handleAttendanceChange(emp, 'Leave')}
                                        >
                                            <Clock className="w-4 h-4 mr-2"/> Leave
                                        </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                                )
                            })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Attendance History</CardTitle>
                            <CardDescription>View past attendance records. Select a date range to filter.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                             <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                             {dateRange?.from && <Button variant="ghost" onClick={() => setDateRange(undefined)}><X className="mr-2 h-4 w-4"/>Clear</Button>}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {attendanceSummary && (
                        <div className="grid grid-cols-5 gap-4 text-center mb-4">
                            <div className="p-3 bg-muted/30 rounded-lg">
                                <div className="text-2xl font-bold">{attendanceSummary.total}</div>
                                <div className="text-xs text-muted-foreground">Total</div>
                            </div>
                            <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-lg">
                                <div className="text-2xl font-bold text-green-600">{attendanceSummary.present}</div>
                                <div className="text-xs text-green-700 dark:text-green-300">Present</div>
                            </div>
                             <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-lg">
                                <div className="text-2xl font-bold text-red-600">{attendanceSummary.absent}</div>
                                <div className="text-xs text-red-700 dark:text-red-300">Absent</div>
                            </div>
                             <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                                <div className="text-2xl font-bold text-blue-600">{attendanceSummary.leave}</div>
                                <div className="text-xs text-blue-700 dark:text-blue-300">Leave</div>
                            </div>
                             <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                <div className="text-2xl font-bold">{attendanceSummary.notMarked}</div>
                                <div className="text-xs text-muted-foreground">Unmarked</div>
                            </div>
                        </div>
                    )}
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Employee</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredHistory.length > 0 ? (
                                <>
                                    {filteredHistory.map(record => (
                                        <TableRow key={record.id}>
                                            <TableCell className="font-medium">{format(parseISO(record.date), 'dd-MMM-yyyy')}</TableCell>
                                            <TableCell className="font-medium">{record.employeeName}</TableCell>
                                            <TableCell>
                                                <span className={cn('font-semibold', 
                                                    record.status === 'Present' && 'text-green-600',
                                                    record.status === 'Absent' && 'text-destructive',
                                                    record.status === 'Leave' && 'text-blue-600'
                                                )}>
                                                    {record.status}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </>
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                                        {dateRange?.from ? 'No records found for this period.' : 'No attendance records yet.'}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>

        <div className="lg:col-span-1">
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                    <List /> Employee List
                    </CardTitle>
                    <CardDescription>
                    A record of all your employees.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4 mb-4">
                        <Select value={positionFilter} onValueChange={(value) => setPositionFilter(value === 'all' ? '' : value)}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Filter by position..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Positions</SelectItem>
                                {allPositions.map(pos => (
                                    <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="relative w-full max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </div>
                     <div className="flex items-center space-x-2 mb-4">
                        <Label htmlFor="show-terminated" className="flex-shrink-0">Show Terminated</Label>
                        <Switch id="show-terminated" checked={showTerminated} onCheckedChange={setShowTerminated} />
                    </div>

                    {isLoaded && filteredEmployees.length > 0 ? (
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Employee Details</TableHead>
                            <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {filteredEmployees.map(emp => (
                            <TableRow key={emp.id}>
                                <TableCell>
                                <div className="font-medium">{emp.name}</div>
                                <div className="text-sm text-muted-foreground">{emp.position}</div>
                                <div className={`text-xs ${emp.terminationDate ? 'text-destructive' : 'text-green-600'}`}>
                                    {emp.terminationDate 
                                    ? `Terminated on ${format(parseISO(emp.terminationDate), 'dd-MMM-yyyy')}` 
                                    : (emp.hireDate ? `Joined: ${format(parseISO(emp.hireDate), 'dd-MMM-yyyy')}` : 'No join date')}
                                </div>
                                </TableCell>
                                <TableCell className="text-center space-x-0">
                                <Button variant="ghost" size="icon" title="Edit" onClick={() => setEmployeeToEdit(emp)}>
                                        <Edit className="w-4 h-4" />
                                </Button>
                                {emp.terminationDate ? (
                                    <Button variant="ghost" size="icon" title="Reactivate Employee" className="text-green-600 hover:text-green-700" onClick={() => handleReactivate(emp)}>
                                        <UserCheck className="w-4 h-4" />
                                    </Button>
                                ) : (
                                    <Button variant="ghost" size="icon" title="Terminate Employee" onClick={() => setEmployeeToEdit(emp)}>
                                        <UserX className="w-4 h-4" />
                                    </Button>
                                )}
                                <Button variant="ghost" size="icon" title="Delete" className="text-destructive hover:text-destructive" onClick={() => setEmployeeToDelete(emp)}>
                                        <Trash2 className="w-4 h-4" />
                                </Button>
                                </TableCell>
                            </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    ) : (
                    <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
                        <Users className="w-16 h-16" />
                        <h3 className="text-xl font-semibold">
                            {searchTerm || positionFilter ? 'No Matching Employees' : 'No Employees Found'}
                        </h3>
                        <p>
                            {searchTerm || positionFilter ? 'Try a different search or filter.' : 'Use the form to add your first employee.'}
                        </p>
                    </div>
                    )}
                </CardContent>
            </Card>
            <Card className="mt-8">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                    <UserPlus /> New Employee
                    </CardTitle>
                    <CardDescription>Add a new employee to your records.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit(onAddSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Employee Name</Label>
                        <Input id="name" {...register('name')} placeholder="e.g., Jane Doe" />
                        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="mobileNumber">Mobile Number</Label>
                        <Input id="mobileNumber" {...register('mobileNumber')} placeholder="e.g., 03001234567" />
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="position">Position</Label>
                        <Input id="position" {...register('position')} placeholder="e.g., Pump Attendant, Manager" />
                        {errors.position && <p className="text-sm text-destructive">{errors.position.message}</p>}
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="salary">Salary (PKR)</Label>
                        <Input id="salary" type="number" {...register('salary')} placeholder="e.g., 25000" />
                        {errors.salary && <p className="text-sm text-destructive">{errors.salary.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label>Date of Joining</Label>
                        <Controller
                            name="hireDate"
                            control={control}
                            render={({ field }) => (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                    </PopoverContent>
                                </Popover>
                            )}
                        />
                        {errors.hireDate && <p className="text-sm text-destructive">{errors.hireDate.message}</p>}
                    </div>

                    <Button type="submit" className="w-full">Add Employee</Button>
                    </form>
                </CardContent>
                </Card>
        </div>
    </div>
    
    <Dialog open={!!employeeToEdit} onOpenChange={(isOpen) => !isOpen && setEmployeeToEdit(null)}>
        <DialogContent className="max-w-2xl">
            <form onSubmit={handleSubmitEdit(onEditSubmit)}>
                <DialogHeader>
                    <DialogTitle>Edit Employee</DialogTitle>
                    <DialogDescription>
                        Update the details for this employee.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Employee Name</Label>
                    <Input id="edit-name" {...registerEdit('name')} />
                    {editErrors.name && <p className="text-sm text-destructive">{editErrors.name.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-mobileNumber">Mobile Number</Label>
                    <Input id="edit-mobileNumber" {...registerEdit('mobileNumber')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-position">Position</Label>
                    <Input id="edit-position" {...registerEdit('position')} />
                     {editErrors.position && <p className="text-sm text-destructive">{editErrors.position.message}</p>}
                  </div>
                   <div className="space-y-2">
                        <Label htmlFor="salary">Salary (PKR)</Label>
                        <Input id="salary" type="number" {...registerEdit('salary')} />
                        {editErrors.salary && <p className="text-sm text-destructive">{editErrors.salary.message}</p>}
                    </div>
                  <div className="space-y-2">
                    <Label>Date of Joining</Label>
                    <Controller name="hireDate" control={controlEdit} render={({ field }) => (
                       <Popover>
                            <PopoverTrigger asChild>
                                <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                            </PopoverContent>
                        </Popover>
                    )} />
                  </div>
                  <div className="space-y-2">
                    <Label>Date of Termination (Optional)</Label>
                    <Controller name="terminationDate" control={controlEdit} render={({ field }) => (
                         <Popover>
                            <PopoverTrigger asChild>
                                <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                            </PopoverContent>
                        </Popover>
                    )} />
                  </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setEmployeeToEdit(null)}>Cancel</Button>
                    <Button type="submit">Save Changes</Button>
                </DialogFooter>
            </form>
            <Separator className="my-4"/>
            <form onSubmit={handleSubmitIncrease(onSalaryIncreaseSubmit)}>
                <DialogHeader>
                    <DialogTitle>Record Pay Increase</DialogTitle>
                    <DialogDescription>
                        This will update the employee's current salary and record this change in their history.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                    {previousSalaryEntry && (
                        <div className="space-y-2">
                            <Label htmlFor="previous-salary">Previous Salary</Label>
                            <Input id="previous-salary" value={`PKR ${previousSalaryEntry.amount.toLocaleString()}`} readOnly disabled />
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="current-salary">Current Salary</Label>
                        <Input id="current-salary" value={`PKR ${employeeToEdit?.salary.toLocaleString()}`} readOnly disabled />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="newSalary">New Salary (PKR)</Label>
                        <Input id="newSalary" type="number" {...registerIncrease('newSalary')} />
                        {increaseErrors.newSalary && <p className="text-sm text-destructive">{increaseErrors.newSalary.message}</p>}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label>Effective Date</Label>
                        <Controller
                            name="effectiveDate"
                            control={controlIncrease}
                            render={({ field }) => (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                    </PopoverContent>
                                </Popover>
                            )}
                        />
                        {increaseErrors.effectiveDate && <p className="text-sm text-destructive">{increaseErrors.effectiveDate.message}</p>}
                    </div>
                </div>
                <DialogFooter>
                    <Button type="submit">Apply Pay Increase</Button>
                </DialogFooter>
            </form>
        </DialogContent>
    </Dialog>

    <AlertDialog open={!!employeeToDelete} onOpenChange={(isOpen) => !isOpen && setEmployeeToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the employee record for <strong className="font-medium text-foreground">{employeeToDelete?.name}</strong>. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteEmployee} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Yes, delete employee
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
