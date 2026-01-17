

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
import { Calendar as CalendarIcon, Sun, Check, ChevronsUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { useDatabase } from '@/hooks/use-database';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import React, { useState, useEffect } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { TransactionNav } from '@/components/transaction-nav';

const salaryPaymentSchema = z.object({
  employeeId: z.string().min(1, 'Please select an employee.'),
  salaryMonth: z.string().min(1, "Salary month is required."),
  salaryYear: z.string().min(4, "Salary year is required."),
  postingDate: z.date({ required_error: "A posting date is required."}),
  notes: z.string().optional(),
});

type SalaryPaymentFormValues = z.infer<typeof salaryPaymentSchema>;

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
  const { employees, customers, addCustomer, addCustomerPayment, addExpense, isLoaded, dateRange, setDateRange } = useDatabase();
  const { toast } = useToast();
  const [employeeComboboxOpen, setEmployeeComboboxOpen] = useState(false);

  const { register, handleSubmit, reset, control, setValue, formState: { errors } } = useForm<SalaryPaymentFormValues>({
    resolver: zodResolver(salaryPaymentSchema),
    defaultValues: {
      salaryMonth: format(new Date(), 'MMMM'),
      salaryYear: new Date().getFullYear().toString(),
      postingDate: dateRange?.from || new Date(),
    }
  });

  useEffect(() => {
    if (dateRange?.from) {
        setValue('postingDate', dateRange.from);
    }
  }, [dateRange, setValue]);

  const onSubmit: SubmitHandler<SalaryPaymentFormValues> = (data) => {
    const employee = employees.find(e => e.id === data.employeeId);
    if (!employee) return;
    
    const salaryDescription = `Salary for ${employee.name} (${data.salaryMonth} ${data.salaryYear})`;
    const paymentNotes = data.notes ? `${salaryDescription} - ${data.notes}` : salaryDescription;

    // 1. Log the salary as an expense
    addExpense({
      description: salaryDescription,
      category: 'Salaries',
      amount: employee.salary,
      timestamp: data.postingDate.toISOString(),
    });

    // 2. Find or create a customer record for the employee to track payments in their ledger
    let employeeAsCustomer = customers.find(c => c.name.toLowerCase() === employee.name.toLowerCase() && c.area === 'Employee');
    
    let customerId = employeeAsCustomer?.id;
    if (!employeeAsCustomer) {
        const newCustomer = addCustomer({
            name: employee.name,
            contact: employee.mobileNumber || '',
            area: 'Employee',
            isPartner: false,
        });
        customerId = newCustomer.id;
        employeeAsCustomer = newCustomer;
    }


    // 3. Log a payment against the employee's customer record (acts as a CREDIT to balance their account)
    if (customerId) {
        addCustomerPayment({
            customerId: customerId,
            customerName: employee.name,
            amount: employee.salary,
            paymentMethod: 'Salary',
            timestamp: data.postingDate.toISOString(),
            notes: paymentNotes,
        });
    }


    toast({
      title: 'Salary Paid',
      description: `Salary for ${employee.name} has been successfully recorded.`,
    });
    
    setDateRange({ from: data.postingDate, to: data.postingDate });
    reset();
  };

  return (
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
                                      ? employees.find((e) => e.id === field.value)?.name
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
                                        {isLoaded ? employees.map(e => (
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
                        render={({ field }) => (
                            <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                variant={"outline"}
                                className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                )}
                                >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                initialFocus
                                />
                            </PopoverContent>
                            </Popover>
                        )}
                        />
                        {errors.postingDate && <p className="text-sm text-destructive">{errors.postingDate.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="notes">Notes (Optional)</Label>
                        <Textarea id="notes" {...register('notes')} placeholder="e.g., Including overtime payment" />
                    </div>

                    <Button type="submit" className="w-full">Confirm Payment</Button>
                </form>
            </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
}
