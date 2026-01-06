
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
import { Users, UserPlus, List, Edit, Trash2, AlertTriangle, Calendar as CalendarIcon, UserX, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import { useDatabase } from '@/hooks/use-database';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { Employee } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';


const employeeSchema = z.object({
  name: z.string().min(1, 'Employee name is required'),
  mobileNumber: z.string().optional(),
  position: z.string().min(1, 'Position is required'),
  salary: z.coerce.number().min(0, 'Salary must be a positive number'),
  hireDate: z.date({ required_error: "Hire date is required."}),
  terminationDate: z.date().optional().nullable(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

export default function EmployeeManagementPage() {
  const { employees, addEmployee, updateEmployee, deleteEmployee, isLoaded } = useDatabase();
  const { toast } = useToast();
  
  const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [showTerminated, setShowTerminated] = useState(false);

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { hireDate: new Date() }
  });

  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEdit, setValue: setEditValue, control: controlEdit, formState: { errors: editErrors } } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
  });

  const onAddSubmit: SubmitHandler<EmployeeFormValues> = (data) => {
    addEmployee({ ...data, hireDate: data.hireDate.toISOString() });
    toast({
      title: 'Employee Added',
      description: `${data.name} has been added to your records.`,
    });
    reset({ name: '', mobileNumber: '', position: '', salary: 0, hireDate: new Date() });
  };
  
  const onEditSubmit: SubmitHandler<EmployeeFormValues> = (data) => {
    if (!employeeToEdit) return;
    updateEmployee(employeeToEdit.id, { 
      ...data, 
      hireDate: data.hireDate.toISOString(),
      terminationDate: data.terminationDate ? data.terminationDate.toISOString() : undefined
    });
    toast({
        title: 'Employee Updated',
        description: "The employee's details have been saved."
    });
    setEmployeeToEdit(null);
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
    updateEmployee(employee.id, { ...employee, terminationDate: undefined });
    toast({
        title: 'Employee Reactivated',
        description: `${employee.name} is now an active employee.`,
    });
  }

  const filteredEmployees = useMemo(() => {
    if (showTerminated) return employees;
    return employees.filter(emp => !emp.terminationDate);
  }, [employees, showTerminated]);
  
  useEffect(() => {
    if (employeeToEdit) {
      setEditValue('name', employeeToEdit.name);
      setEditValue('mobileNumber', employeeToEdit.mobileNumber);
      setEditValue('position', employeeToEdit.position);
      setEditValue('salary', employeeToEdit.salary);
      setEditValue('hireDate', new Date(employeeToEdit.hireDate));
      setEditValue('terminationDate', employeeToEdit.terminationDate ? new Date(employeeToEdit.terminationDate) : null);
    } else {
      resetEdit();
    }
  }, [employeeToEdit, setEditValue, resetEdit]);

  return (
    <>
    <div className="p-4 md:p-8 grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <Card>
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


              <Button type="submit" className="w-full">Add Employee</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
                <div>
                    <CardTitle className="flex items-center gap-2">
                    <List /> Employee List
                    </CardTitle>
                    <CardDescription>
                    A record of all your employees.
                    </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                    <Label htmlFor="show-terminated">Show Terminated</Label>
                    <Switch id="show-terminated" checked={showTerminated} onCheckedChange={setShowTerminated} />
                </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoaded && filteredEmployees.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee Details</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead className="text-right">Salary</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.map(emp => (
                      <TableRow key={emp.id}>
                        <TableCell>
                          <div className="font-medium">{emp.name}</div>
                          <div className="text-sm text-muted-foreground">{emp.mobileNumber}</div>
                        </TableCell>
                        <TableCell>{emp.position}</TableCell>
                        <TableCell className="text-right">PKR {emp.salary.toLocaleString()}</TableCell>
                        <TableCell>
                          {emp.terminationDate 
                            ? <span className="text-destructive">Terminated ({format(new Date(emp.terminationDate), 'PP')})</span> 
                            : <span className="text-green-600">Active (Joined: {format(new Date(emp.hireDate), 'PP')})</span>}
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
                             <Button variant="ghost" size="icon" title="Terminate Employee" className="text-destructive hover:text-destructive" onClick={() => setEmployeeToEdit(emp)}>
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
                <h3 className="text-xl font-semibold">No Employees Found</h3>
                <p>Use the form to add your first employee.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    
    <Dialog open={!!employeeToEdit} onOpenChange={(isOpen) => !isOpen && setEmployeeToEdit(null)}>
        <DialogContent>
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
                    <Label htmlFor="edit-salary">Salary</Label>
                    <Input id="edit-salary" type="number" {...registerEdit('salary')} />
                    {editErrors.salary && <p className="text-sm text-destructive">{editErrors.salary.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Date of Joining</Label>
                    <Controller name="hireDate" control={controlEdit} render={({ field }) => (
                        <Popover><PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover>
                    )} />
                  </div>
                  <div className="space-y-2">
                    <Label>Date of Termination (Optional)</Label>
                    <Controller name="terminationDate" control={controlEdit} render={({ field }) => (
                        <Popover><PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "PPP") : <span>Leave empty if active</span>}
                            </Button>
                        </PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value ?? undefined} onSelect={field.onChange} /></PopoverContent></Popover>
                    )} />
                  </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setEmployeeToEdit(null)}>Cancel</Button>
                    <Button type="submit">Save Changes</Button>
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
