
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
import { useSearchParams, useRouter } from 'next/navigation';
import { Wallet, CreditCard, Smartphone, Calendar as CalendarIcon, Sun, Check, ChevronsUpDown, Landmark, ShieldCheck } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { useDatabase } from '@/hooks/use-database';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import type { PaymentMethod } from '@/lib/types';
import React, { useState, useEffect, useMemo } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { TransactionNav } from '@/components/transaction-nav';
import { useSupplierBalance } from '@/hooks/use-supplier-balance';
import { SignedInEmail } from '@/components/signed-in-email';

const supplierPaymentSchema = z.object({
  supplierId: z.string().min(1, 'Please select a supplier.'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  paymentMethod: z.enum(['Cash', 'Card', 'Mobile', 'Bank Transfer'], { required_error: 'Please select a payment method.' }),
  notes: z.string().optional(),
  date: z.date({ required_error: "A date is required."}),
  pin: z.string().length(4, "PIN must be 4 digits"),
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
                <SignedInEmail />
                <Button variant="ghost" size="icon">
                    <Sun className="h-5 w-5" />
                </Button>
            </div>
        </div>
      </header>
    );
}

export default function SupplierPaymentsPage() {
  const { suppliers, supplierPayments, addSupplierPayment, updateSupplierPayment, isLoaded, colorSettings } = useDatabase();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const editId = searchParams.get('edit');
  const [supplierComboboxOpen, setSupplierComboboxOpen] = useState(false);
  const [paymentDateCalendarOpen, setPaymentDateCalendarOpen] = useState(false);
  
  const { register, handleSubmit, reset, control, watch, setValue, formState: { errors } } = useForm<SupplierPaymentFormValues>({
    resolver: zodResolver(supplierPaymentSchema),
    defaultValues: {
        paymentMethod: 'Bank Transfer'
    }
  });

  const supplierId = watch('supplierId');
  const paymentAmount = watch('amount');
  const { balance: supplierBalance } = useSupplierBalance(supplierId, { excluding: { source: 'supplierPayments', id: editId } });
  const newBalance = useMemo(() => supplierBalance - (Number(paymentAmount) || 0), [supplierBalance, paymentAmount]);

  useEffect(() => {
    if (editId) return;
    const savedDate = localStorage.getItem('global_date_from');
    const initialDate = savedDate && isValid(new Date(savedDate)) ? new Date(savedDate) : new Date();
    reset({
      date: initialDate,
      paymentMethod: 'Bank Transfer',
    });
  }, [reset, editId]);

  // Editing: the form opens on the payment itself, and saving changes THAT payment.
  useEffect(() => {
    if (!isLoaded || !editId) return;
    const payment = supplierPayments.find(p => p.id === editId);
    if (!payment) return;
    setValue('supplierId', payment.supplierId);
    setValue('amount', payment.amount);
    setValue('paymentMethod', (['Cash', 'Card', 'Mobile', 'Bank Transfer'] as const).find(m => m === payment.paymentMethod) ?? 'Bank Transfer');
    setValue('notes', payment.notes || '');
    if (isValid(new Date(payment.timestamp))) setValue('date', new Date(payment.timestamp));
  }, [isLoaded, editId, supplierPayments, setValue]);

  const onSubmit: SubmitHandler<SupplierPaymentFormValues> = (data) => {
    if (data.pin !== '0200') {
      toast({
        variant: 'destructive',
        title: 'Incorrect PIN',
        description: 'Verification failed. Incorrect Security PIN.',
      });
      return;
    }

    const supplier = suppliers.find(s => s.id === data.supplierId);
    if (!supplier) return;

    const isoDate = data.date.toISOString();
    localStorage.setItem('global_date_from', isoDate);
    localStorage.setItem('global_date_to', isoDate);

    const payment = {
      supplierId: data.supplierId,
      supplierName: supplier.name,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      timestamp: data.date.toISOString(),
      ...(data.notes ? { notes: data.notes } : {}),
    };

    if (editId) {
      updateSupplierPayment(editId, payment);
      toast({ title: 'Payment Updated', description: 'The payment record has been saved.' });
      router.push('/ledger');
      return;
    }

    addSupplierPayment(payment);
    
    toast({
      title: 'Payment Recorded',
      description: `Payment of PKR ${data.amount} to ${supplier.name} has been logged.`,
    });

    reset({
      date: data.date,
      supplierId: '',
      amount: undefined,
      paymentMethod: 'Bank Transfer',
      notes: '',
      pin: '',
    });
  };

  return (
    <div className="bg-muted/30 min-h-screen">
      <PageHeader />
      <TransactionNav />
      <main className="container mx-auto p-4">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle style={{ color: colorSettings['Supplier Payment'] || '#EC4899' }}>{editId ? 'Edit Supplier Payment' : 'New Supplier Payment'}</CardTitle>
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
                            <SelectItem value="Bank Transfer"><div className="flex items-center gap-2"><Landmark/>Bank Transfer</div></SelectItem>
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
                      <Popover open={paymentDateCalendarOpen} onOpenChange={setPaymentDateCalendarOpen}>
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
                            key="supplier-payments-calendar"
                            mode="single"
                            selected={field.value}
                            defaultMonth={field.value}
                            onSelect={(date) => {
                                field.onChange(date);
                                setPaymentDateCalendarOpen(false);
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                  />
                  {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
                </div>

                <div className="space-y-2 border-t pt-4">
                    <Label htmlFor="pin" className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary"/> Security PIN</Label>
                    <Input id="pin" type="password" {...register('pin')} placeholder="Enter 4-digit PIN" maxLength={4} />
                    {errors.pin && <p className="text-sm text-destructive">{errors.pin.message}</p>}
                </div>

                {supplierId && (
                    <div className="border-t pt-4 mt-4 space-y-1 text-sm">
                        <h4 className="font-semibold mb-2">Supplier Account</h4>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Previous Balance</span>
                            <span>{supplierBalance.toFixed(2)} PKR</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg">
                            <span>New Account Balance</span>
                            <span className={cn(newBalance > 0 ? "text-green-600" : "text-destructive")}>{newBalance.toFixed(2)} PKR</span>
                        </div>
                    </div>
                )}

                <Button type="submit" className="w-full">{editId ? 'Update Payment' : 'Record Payment'}</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
