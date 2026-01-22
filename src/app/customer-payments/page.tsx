
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
import { Wallet, CreditCard, Smartphone, Calendar as CalendarIcon, Sun, Check, ChevronsUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { useDatabase } from '@/hooks/use-database';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import type { PaymentMethod } from '@/lib/types';
import React, { useState, useEffect } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { TransactionNav } from '@/components/transaction-nav';

const customerPaymentSchema = z.object({
  customerId: z.string().min(1, 'Please select a customer.'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  paymentMethod: z.enum(['Cash', 'Card', 'Mobile'], { required_error: 'Please select a payment method.' }),
  notes: z.string().optional(),
  date: z.date({ required_error: "A date is required."}),
});

type CustomerPaymentFormValues = z.infer<typeof customerPaymentSchema>;

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

export default function CustomerPaymentsPage() {
  const { customers, addCustomerPayment, isLoaded } = useDatabase();
  const { toast } = useToast();
  const [customerComboboxOpen, setCustomerComboboxOpen] = useState(false);

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<CustomerPaymentFormValues>({
    resolver: zodResolver(customerPaymentSchema),
  });

  useEffect(() => {
    reset({
      date: new Date(),
    });
  }, [reset]);

  const onSubmit: SubmitHandler<CustomerPaymentFormValues> = (data) => {
    const customer = customers.find(c => c.id === data.customerId);
    if (!customer) return;

    addCustomerPayment({
      customerId: data.customerId,
      customerName: customer.name,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      timestamp: data.date.toISOString(),
    });
    
    toast({
      title: 'Payment Recorded',
      description: `Payment of PKR ${data.amount} from ${customer.name} has been logged.`,
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
            <CardTitle>New Customer Payment</CardTitle>
            <CardDescription>Record a payment received from a customer.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-2">
                <Label>Customer</Label>
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
                <Input id="amount" type="number" {...register('amount')} placeholder="e.g., 5000" step="0.01" />
                {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
              </div>

              <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Controller
                    name="paymentMethod"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Cash"><div className="flex items-center gap-2"><Wallet/>Cash</div></SelectItem>
                          <SelectItem value="Card"><div className="flex items-center gap-2"><CreditCard/>Card</div></SelectItem>
                          <SelectItem value="Mobile"><div className="flex items-center gap-2"><Smartphone/>Mobile</div></SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.paymentMethod && <p className="text-sm text-destructive">{errors.paymentMethod.message}</p>}
                </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea id="notes" {...register('notes')} placeholder="e.g., Payment for last week's fuel" />
                {errors.notes && <p className="text-sm text-destructive">{errors.notes.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label>Date</Label>
                <Controller
                  name="date"
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
                          {field.value ? format(field.value, "dd-MMM-yyyy") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          key="customer-payments-calendar"
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  )}
                />
                {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
              </div>

              <Button type="submit" className="w-full">Record Payment</Button>
            </form>
          </CardContent>
        </Card>
        </div>
      </main>
    </div>
  );
}
