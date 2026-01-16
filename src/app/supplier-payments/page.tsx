

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
import { Wallet, CreditCard, Smartphone, Calendar as CalendarIcon, Sun, ShoppingCart, Redo, DollarSign, User, Truck, Undo, Undo2, Check, ChevronsUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { useDatabase } from '@/hooks/use-database';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import type { PaymentMethod } from '@/lib/types';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useState, useEffect } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

const supplierPaymentSchema = z.object({
  supplierId: z.string().min(1, 'Please select a supplier.'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  paymentMethod: z.enum(['Cash', 'Card', 'Mobile'], { required_error: 'Please select a payment method.' }),
  notes: z.string().optional(),
  date: z.date({ required_error: "A date is required."}),
});

type SupplierPaymentFormValues = z.infer<typeof supplierPaymentSchema>;

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
      { href: '/sales', label: 'Sale', icon: ShoppingCart },
      { href: '/customer-payments', label: 'Customer Payment', icon: Wallet },
      { href: '/sale-returns', label: 'Sale Return', icon: Undo },
      { href: '/purchases', label: 'Purchase', icon: Truck },
      { href: '/supplier-payments', label: 'Supplier Payment', icon: Redo },
      { href: '/purchase-returns', label: 'Purchase Return', icon: Undo2 },
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

export default function SupplierPaymentsPage() {
  const { suppliers, addSupplierPayment, isLoaded, dateRange } = useDatabase();
  const { toast } = useToast();
  const [supplierComboboxOpen, setSupplierComboboxOpen] = useState(false);
  
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<SupplierPaymentFormValues>({
    resolver: zodResolver(supplierPaymentSchema),
    defaultValues: {
      date: dateRange?.from || new Date(),
    }
  });

  useEffect(() => {
    reset({ date: dateRange?.from || new Date(), supplierId: '', amount: 0, notes: '' });
  }, [dateRange, reset]);

  const onSubmit: SubmitHandler<SupplierPaymentFormValues> = (data) => {
    const supplier = suppliers.find(s => s.id === data.supplierId);
    if (!supplier) return;

    addSupplierPayment({
      supplierId: data.supplierId,
      supplierName: supplier.name,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      timestamp: data.date.toISOString(),
    });
    
    toast({
      title: 'Payment Recorded',
      description: `Payment of PKR ${data.amount} to ${supplier.name} has been logged.`,
    });
    reset({ supplierId: '', amount: 0, notes: '', date: dateRange?.from || new Date() });
  };

  return (
    <div className="bg-muted/30 min-h-screen">
      <PageHeader />
      <TransactionNav />
      <main className="container mx-auto p-4">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>New Supplier Payment</CardTitle>
              <CardDescription>Record a payment made to a supplier.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Controller
                    name="supplierId"
                    control={control}
                    render={({ field }) => (
                      <Popover open={supplierComboboxOpen} onOpenChange={setSupplierComboboxOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={supplierComboboxOpen}
                            className="w-full justify-between"
                          >
                            {field.value
                              ? suppliers.find((s) => s.id === field.value)?.name
                              : "Select a supplier..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                          <Command>
                            <CommandInput placeholder="Search supplier..." />
                            <CommandList>
                              <CommandEmpty>No supplier found.</CommandEmpty>
                              <CommandGroup>
                                {isLoaded ? suppliers.map(s => (
                                  <CommandItem
                                    key={s.id}
                                    value={s.name}
                                    onSelect={() => {
                                      field.onChange(s.id);
                                      setSupplierComboboxOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        field.value === s.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {s.name}
                                  </CommandItem>
                                )) : <CommandItem disabled>Loading...</CommandItem>}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    )}
                  />
                  {errors.supplierId && <p className="text-sm text-destructive">{errors.supplierId.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (PKR)</Label>
                  <Input id="amount" type="number" {...register('amount')} placeholder="e.g., 50000" step="0.01" />
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
                  <Textarea id="notes" {...register('notes')} placeholder="e.g., Invoice #123, full settlement" />
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

                <Button type="submit" className="w-full">Record Payment</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
