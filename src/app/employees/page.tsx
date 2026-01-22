
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
import { format, getDaysInMonth, getYear, getMonth, getDate, isValid } from 'date-fns';
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
  const { employees, customers, addCustomer, addCustomerPayment, addExpense, isLoaded, dateRange } = useDatabase();
  const { toast } = useToast();
  const [employeeComboboxOpen, setEmployeeComboboxOpen] = useState(false);

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<SalaryPaymentFormValues>({
    resolver: zodResolver(salaryPaymentSchema),
  });

  useEffect(() => {
    reset({
      salaryMonth: format(new Date(), 'MMMM'),
      salaryYear: new Date().getFullYear().toString(),
      postingDate: dateRange?.from || new Date(),
    });
  }, [reset, dateRange]);

  const onSubmit: SubmitHandler<SalaryPaymentFormValues> = async (data) => {
    const employee = employees.find(e => e.id === data.employeeId);
    if (!employee) return;
    
    const salaryDescription = `Salary for ${employee.name} (${data.salaryMonth} ${data.salaryYear})`;
    const paymentNotes = data.notes ? `${salaryDescription} - ${data.notes}` : salaryDescription;

    // 1. Log the salary as an expense
    await addExpense({
      description: salaryDescription,
      category: 'Salaries',
      amount: employee.salary,
      timestamp: data.postingDate.toISOString(),
    });

    // 2. Find or create a customer record for the employee to track payments in their ledger
    let employeeAsCustomer = customers.find(c => c.name.toLowerCase() === employee.name.toLowerCase() && c.area === 'Employee');
    
    let customerId = employeeAsCustomer?.id;
    if (!employeeAsCustomer) {
        const newCustomer = await addCustomer({
            name: employee.name,
            contact: employee.mobileNumber || '',
            area: 'Employee',
            isPartner: false,
            timestamp: new Date().toISOString(),
        });
        customerId = newCustomer.id;
        employeeAsCustomer = newCustomer;
    }


    // 3. Log a payment against the employee's customer record (acts as a CREDIT to balance their account)
    if (customerId) {
        await addCustomerPayment({
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

                    <Button type="submit" className="w-full">Confirm Payment</Button>
                </form>
            </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
}
