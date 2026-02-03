
'use client';

import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


const cashAdvanceSchema = z.object({
  customerId: z.string().min(1, 'Please select a customer.'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  notes: z.string().optional(),
  date: z.date({ required_error: "A date is required."}),
});

type CashAdvanceFormValues = z.infer<typeof cashAdvanceSchema>;


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

export default function CashAdvancesPage() {
  const { customers, addCashAdvance, isLoaded, dateRange } = useDatabase();
  const { toast } = useToast();
  const [customerComboboxOpen, setCustomerComboboxOpen] = useState(false);
  
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<CashAdvanceFormValues>({
    resolver: zodResolver(cashAdvanceSchema),
  });

  useEffect(() => {
    if (dateRange?.from) {
      reset({
        date: dateRange.from,
      });
    }
  }, [reset, dateRange]);

  const onSubmit: SubmitHandler<CashAdvanceFormValues> = (data) => {
    const customer = customers.find(c => c.id === data.customerId);
    if (!customer) return;

    addCashAdvance({ 
      customerId: data.customerId,
      customerName: customer.name,
      amount: data.amount,
      notes: data.notes,
      timestamp: data.date.toISOString(),
    });
    
    toast({
      title: 'Cash Advance Recorded',
      description: `Cash advance of PKR ${data.amount} to ${customer.name} has been logged.`,
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
                <CardTitle>New Cash Advance</CardTitle>
                <CardDescription>Record a cash payment made to a customer or employee.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-2">
                    <Label>Customer / Employee</Label>
                    <Controller
                      name="customerId"
                      control={control}
                      render={({ field }) => (
                        <Popover open={customerComboboxOpen} onOpenChange={setCustomerComboboxOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={customerComboboxOpen}
                              className="w-full justify-between"
                            >
                              {field.value
                                ? customers.find((c) => c.id === field.value)?.name
                                : "Select a person..."}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                            <Command>
                              <CommandInput placeholder="Search person..." />
                              <CommandList>
                                <CommandEmpty>No person found.</CommandEmpty>
                                <CommandGroup>
                                  {isLoaded ? customers.map(c => (
                                    <CommandItem
                                      key={c.id}
                                      value={c.name}
                                      onSelect={() => {
                                        field.onChange(c.id);
                                        setCustomerComboboxOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          field.value === c.id ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      {c.name}
                                    </CommandItem>
                                  )) : <CommandItem disabled>Loading...</CommandItem>}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      )}
                    />
                    {errors.customerId && <p className="text-sm text-destructive">{errors.customerId.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="amount">Amount (PKR)</Label>
                    <Input id="amount" type="number" {...register('amount')} placeholder="e.g., 5000" step="any" />
                    {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="notes">Notes (Optional)</Label>
                    <Textarea id="notes" {...register('notes')} placeholder="e.g., For urgent repair" />
                    {errors.notes && <p className="text-sm text-destructive">{errors.notes.message}</p>}
                </div>
                
                <div className="space-y-2">
                    <Label>Date</Label>
                    <Controller
                        name="date"
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
                    {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
                </div>

                <Button type="submit" className="w-full">Record Cash Advance</Button>
                </form>
            </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
}
