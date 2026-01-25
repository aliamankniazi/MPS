
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
import { Users, UserPlus, List, Edit, Trash2, AlertTriangle, Calendar as CalendarIcon, UserX, UserCheck, Search, CheckCircle, XCircle, Clock } from 'lucide-react';
import { format, getDaysInMonth, getYear, getMonth, getDate, isValid } from 'date-fns';
import { useDatabase } from '@/hooks/use-database';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { Employee, AttendanceRecord, SalaryHistoryEntry } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';


const employeeSchema = z.object({
  name: z.string().min(1, 'Employee name is required'),
  mobileNumber: z.string().optional(),
  position: z.string().min(1, 'Position is required'),
  salary: z.coerce.number().min(0, 'Salary must be a positive number'),
  salaryEffectiveDate: z.date().optional(),
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
  const { employees, addEmployee, updateEmployee, deleteEmployee, attendance, addAttendance, isLoaded } = useDatabase();
  const { toast } = useToast();
  
  const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [showTerminated, setShowTerminated] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(new Date());
  const [historyDate, setHistoryDate] = useState<Date | undefined>();


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
    const newEmployee = await addEmployee({ ...data, hireDate: data.hireDate.toISOString(), timestamp: new Date().toISOString() });
    
    // Automatically mark the new employee as present for the selected attendance date
    await addAttendance({
      employeeId: newEmployee.id,
      employeeName: newEmployee.name,
      date: attendanceDate.toISOString(),
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

    const updates: Partial<Employee> & { salaryEffectiveDate?: Date } = {
        ...data,
        hireDate: data.hireDate.toISOString(),
        terminationDate: data.terminationDate ? data.terminationDate.toISOString() : null,
      };
      
      if (data.salary !== employeeToEdit.salary) {
          const effectiveDate = data.salaryEffectiveDate || new Date();
          const newHistoryEntry: SalaryHistoryEntry = {
            amount: data.salary,
            effectiveDate: effectiveDate.toISOString(),
          };
          updates.salaryHistory = employeeToEdit.salaryHistory
            ? [...employeeToEdit.salaryHistory, newHistoryEntry]
            : [newHistoryEntry];
      }
    
      delete updates.salaryEffectiveDate;

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
      effectiveDate: data.effectiveDate.toISOString(),
    };
  
    const updatedHistory = employeeToEdit.salaryHistory ? [...employeeToEdit.salaryHistory, newHistoryEntry] : [newHistoryEntry];
    
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

  const activeEmployees = useMemo(() => {
    return employees.filter(emp => !emp.terminationDate);
  }, [employees]);
  
  const selectedDayAttendance = useMemo(() => {
    const selectedDateStr = format(attendanceDate, 'yyyy-MM-dd');
    return attendance.filter(a => a.date.startsWith(selectedDateStr));
  }, [attendance, attendanceDate]);
  
  const handleAttendanceChange = (employee: Employee, status: 'Present' | 'Absent' | 'Leave') => {
    addAttendance({
      employeeId: employee.id,
      employeeName: employee.name,
      date: attendanceDate.toISOString(),
      status: status,
    });

    toast({
      title: 'Attendance Marked',
      description: `${employee.name} marked as ${status} for ${format(attendanceDate, 'dd-MMM-yyyy')}.`,
    });
  };

  const handleDateSelectForStatus = (employee: Employee, status: 'Absent' | 'Leave', date: Date | undefined) => {
    if (!date) return;
    addAttendance({
        employeeId: employee.id,
        employeeName: employee.name,
        date: date.toISOString(),
        status: status,
    });
    toast({
        title: 'Attendance Marked',
        description: `${employee.name} marked as ${status} for ${format(date, 'dd-MMM-yyyy')}.`,
    });
  };

  const handleMarkAllPresent = () => {
    activeEmployees.forEach(emp => {
        const currentStatus = selectedDayAttendance.find(a => a.employeeId === emp.id)?.status;
        if (!currentStatus || currentStatus !== 'Present') {
             addAttendance({
                employeeId: emp.id,
                employeeName: emp.name,
                date: attendanceDate.toISOString(),
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
    if (!historyDate) return [];
    const selectedDateStr = format(historyDate, 'yyyy-MM-dd');
    return attendance.filter(a => a.date.startsWith(selectedDateStr));
  }, [attendance, historyDate]);


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
      setEditValue('hireDate', new Date(employeeToEdit.hireDate));
      setEditValue('terminationDate', employeeToEdit.terminationDate ? new Date(employeeToEdit.terminationDate) : null);
      setEditValue('salaryEffectiveDate', new Date()); // Default to today for new changes
    } else {
      resetEdit();
    }
  }, [employeeToEdit, setEditValue, resetEdit]);
  
  const DateDropdowns = ({ value, onChange }: { value: Date | undefined, onChange: (date: Date) => void}) => {
    const handleDateChange = (part: 'day' | 'month' | 'year', val: string) => {
        const currentDate = value || new Date();
        let newDate = new Date(currentDate);

        if (part === 'year') newDate.setFullYear(parseInt(val, 10));
        if (part === 'month') newDate.setMonth(parseInt(val, 10));
        if (part === 'day') newDate.setDate(parseInt(val, 10));
        
        const daysInNewMonth = getDaysInMonth(newDate);
        if (newDate.getDate() > daysInNewMonth) {
            newDate.setDate(daysInNewMonth);
        }

        if (isValid(newDate)) {
            onChange(newDate);
        }
    };
    
    const selectedDate = value || new Date();
    const currentDay = getDate(selectedDate).toString();
    const currentMonth = getMonth(selectedDate).toString();
    const currentYear = getYear(selectedDate).toString();

    const years = Array.from({ length: 80 }, (_, i) => (new Date().getFullYear() - 79 + i).toString()).reverse();
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
};


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
                            <DateDropdowns value={attendanceDate} onChange={setAttendanceDate} />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {activeEmployees.map(emp => {
                             const currentStatus = selectedDayAttendance.find(a => a.employeeId === emp.id)?.status;
                             return (
                                <Card key={emp.id} className="p-4">
                                    <div className="font-medium text-center">{emp.name}</div>
                                    <div className="text-sm text-muted-foreground text-center mb-4">{emp.position}</div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <Button
                                            variant="outline"
                                            className={cn("flex flex-col items-center justify-center gap-1 rounded-md p-2 h-auto border-2 cursor-pointer hover:bg-accent hover:text-accent-foreground", currentStatus === 'Present' && 'bg-green-100 border-green-400 text-green-700 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300')}
                                            onClick={() => handleAttendanceChange(emp, 'Present')}
                                        >
                                            <UserCheck className="w-5 h-5"/>
                                            <span className="text-xs font-semibold">Present</span>
                                        </Button>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className={cn("flex flex-col items-center justify-center gap-1 rounded-md p-2 h-auto border-2 cursor-pointer hover:bg-accent hover:text-accent-foreground", currentStatus === 'Absent' && 'bg-red-100 border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-700 dark:text-red-300')}
                                                >
                                                    <UserX className="w-5 h-5"/>
                                                    <span className="text-xs font-semibold">Absent</span>
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                                <Calendar
                                                    mode="single"
                                                    onSelect={(date) => handleDateSelectForStatus(emp, 'Absent', date)}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                 <Button
                                                    variant="outline"
                                                    className={cn("flex flex-col items-center justify-center gap-1 rounded-md p-2 h-auto border-2 cursor-pointer hover:bg-accent hover:text-accent-foreground", currentStatus === 'Leave' && 'bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-900/50 dark:border-blue-700 dark:text-blue-300')}
                                                >
                                                    <Clock className="w-5 h-5"/>
                                                    <span className="text-xs font-semibold">Leave</span>
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                                <Calendar
                                                    mode="single"
                                                    onSelect={(date) => handleDateSelectForStatus(emp, 'Leave', date)}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </Card>
                             )
                        })}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Attendance History</CardTitle>
                            <CardDescription>View past attendance records by selecting a date.</CardDescription>
                        </div>
                        <DateDropdowns value={historyDate} onChange={setHistoryDate} />
                    </div>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Employee</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredHistory.length > 0 ? filteredHistory.map(record => (
                                <TableRow key={record.id}>
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
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={2} className="text-center h-24 text-muted-foreground">
                                        {historyDate ? 'No records found for this date.' : 'Select a date to view history.'}
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
                                    ? `Terminated on ${format(new Date(emp.terminationDate), 'dd-MMM-yyyy')}` 
                                    : `Joined: ${format(new Date(emp.hireDate), 'dd-MMM-yyyy')}`}
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
                                <DateDropdowns value={field.value} onChange={field.onChange} />
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
            <DialogHeader>
                <DialogTitle>Edit Employee</DialogTitle>
                <DialogDescription>
                    Update the details for this employee.
                </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmitEdit(onEditSubmit)}>
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
                    <Label>Date of Joining</Label>
                    <Controller name="hireDate" control={controlEdit} render={({ field }) => (
                       <DateDropdowns value={field.value} onChange={field.onChange} />
                    )} />
                  </div>
                  <div className="space-y-2">
                    <Label>Date of Termination (Optional)</Label>
                    <Controller name="terminationDate" control={controlEdit} render={({ field }) => (
                         <DateDropdowns value={field.value ?? undefined} onChange={field.onChange} />
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
                                <DateDropdowns value={field.value} onChange={field.onChange} />
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
