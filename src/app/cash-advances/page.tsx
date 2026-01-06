
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
import { ArrowRightLeft, ListChecks, Wallet, Calendar as CalendarIcon, Sun, ShoppingCart, Redo, DollarSign, User, Truck, Undo, Undo2 } from 'lucide-react';
import { format } from 'date-fns';
import { useCustomers } from '@/hooks/use-customers';
import { useCashAdvances } from '@/hooks/use-cash-advances';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useState, useEffect } from 'react';


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

function TransactionNav() {
    const pathname = usePathname();
    const navItems = [
        { href: '/', label: 'Sale', icon: ShoppingCart },
        { href: '/sale-returns', label: 'Sale Return', icon: Undo },
        { href: '/purchases', label: 'Purchase', icon: Truck },
        { href: '/purchase-returns', label: 'Purchase Return', icon: Undo2 },
        { href: '/customer-payments', label: 'Customer Payment', icon: Wallet },
        { href: '/supplier-payments', label: 'Supplier Payment', icon: Redo },
        { href: '/cash-advances', label: 'Cash Advance', icon: DollarSign },
        { href: '/employees', label: 'Salary Payment', icon: User },
    ];
    return (
        <nav className="bg-background shadow-sm">
            <div className="container mx-auto px-4 flex items-center space-x-1 overflow-x-auto">
                {navItems.map(item => (
                    <Button
                        asChild
                        key={item.href}
                        variant="ghost"
                        className={cn(
                            "border-b-2 rounded-none flex-shrink-0",
                            pathname === item.href ? "border-primary text-primary" : "border-transparent"
                        )}
                    >
                        <Link href={item.href}><item.icon className="mr-2"/> {item.label}</Link>
                    </Button>
                ))}
            </div>
        </nav>
    );
}

export default function CashAdvancesPage() {
  const { customers, isLoaded: customersLoaded } = useCustomers();
  const { addCashAdvance } = useCashAdvances();
  const { toast } = useToast();
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<CashAdvanceFormValues>({
    resolver: zodResolver(cashAdvanceSchema),
    defaultValues: {
      date: new Date(),
    }
  });

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
    reset({ customerId: '', amount: 0, notes: '', date: new Date() });
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
                        <Select onValueChange={field.onChange} value={field.value} defaultValue="">
                        <SelectTrigger>
                            <SelectValue placeholder="Select a person..." />
                        </SelectTrigger>
                        <SelectContent>
                            {customersLoaded ? customers.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            )) : <SelectItem value="loading" disabled>Loading...</SelectItem>}
                        </SelectContent>
                        </Select>
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
                    <Label htmlFor="notes">Notes (Optional)</Label>
                    <Textarea id="notes" {...register('notes')} placeholder="e.g., For urgent repair" />
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
