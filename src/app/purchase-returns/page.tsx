
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
import { Calendar as CalendarIcon, Sun, Check, ChevronsUpDown, ShieldCheck } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { useDatabase } from '@/hooks/use-database';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import React, { useState, useEffect, useMemo } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { TransactionNav } from '@/components/transaction-nav';
import { useSupplierBalance } from '@/hooks/use-supplier-balance';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

const purchaseReturnSchema = z.object({
  supplierId: z.string().min(1, 'Please select a supplier.'),
  fuelType: z.string({ required_error: 'Please select a fuel type.' }).min(1, 'Fuel type is required.'),
  volume: z.coerce.number().min(0.01, 'Volume must be greater than 0'),
  totalRefund: z.coerce.number().min(0.01, 'Total refund must be greater than 0'),
  reason: z.string().min(1, 'Reason for return is required'),
  date: z.date({ required_error: "A date is required."}),
  pin: z.string().optional(),
});

type PurchaseReturnFormValues = z.infer<typeof purchaseReturnSchema>;


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

export default function PurchaseReturnsPage() {
  const { purchaseReturns, addPurchaseReturn, updatePurchaseReturn, suppliers, isLoaded, products, fuelStock } = useDatabase();
  const { isPinVerified, confirmPin } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const editId = searchParams.get('edit');
  const { toast } = useToast();
  const [supplierComboboxOpen, setSupplierComboboxOpen] = useState(false);
  const [returnDateCalendarOpen, setReturnDateCalendarOpen] = useState(false);

  const { register, handleSubmit, reset, control, watch, setValue, formState: { errors } } = useForm<PurchaseReturnFormValues>({
    resolver: zodResolver(purchaseReturnSchema),
  });
  
  const supplierId = watch('supplierId');
  const refundAmount = watch('totalRefund');
  const { balance: supplierBalance } = useSupplierBalance(supplierId);
  const newBalance = useMemo(() => supplierBalance - (Number(refundAmount) || 0), [supplierBalance, refundAmount]);

  const selectedFuelType = watch('fuelType');

  useEffect(() => {
    if (isLoaded && editId) {
        const pr = purchaseReturns.find(item => item.id === editId);
        if (pr) {
            setValue('supplierId', pr.supplierId);
            setValue('fuelType', pr.fuelType);
            setValue('volume', pr.volume);
            setValue('totalRefund', pr.totalRefund);
            setValue('reason', pr.reason);
            setValue('date', new Date(pr.timestamp));
        }
    }
  }, [isLoaded, editId, purchaseReturns, setValue]);

  const mainProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p => p.category === 'Main Product');
  }, [products]);
  
  useEffect(() => {
    if (!editId) {
        const savedDate = localStorage.getItem('global_date_from');
        const initialDate = savedDate && isValid(new Date(savedDate)) ? new Date(savedDate) : new Date();
        reset({
            date: initialDate,
        });
    }
  }, [reset, editId]);

  const onSubmit: SubmitHandler<PurchaseReturnFormValues> = (data) => {
    if (!isPinVerified() && data.pin !== '0200') {
      toast({
        variant: 'destructive',
        title: 'Incorrect PIN',
        description: 'Verification failed. Incorrect Security PIN.',
      });
      return;
    }
    if (data.pin === '0200') confirmPin('0200');

    const supplier = suppliers.find(s => s.id === data.supplierId);
    if (!supplier) return;

    const isoDate = data.date.toISOString();
    localStorage.setItem('global_date_from', isoDate);
    localStorage.setItem('global_date_to', isoDate);

    const returnData = { 
        supplierId: data.supplierId,
        supplier: supplier.name, 
        fuelType: data.fuelType,
        volume: data.volume,
        totalRefund: data.totalRefund,
        reason: data.reason,
        timestamp: data.date.toISOString() 
    };

    if (editId) {
        updatePurchaseReturn(editId, returnData);
        toast({ title: 'Purchase Return Updated' });
        router.push('/ledger');
    } else {
        addPurchaseReturn(returnData);
        toast({
          title: 'Purchase Return Recorded',
          description: `Return to ${supplier.name} has been logged.`,
        });
        
        reset({
          date: data.date,
          supplierId: '',
          fuelType: undefined,
          volume: undefined,
          totalRefund: undefined,
          reason: '',
          pin: '',
        });
    }
  };

  return (
    <div className="bg-muted/30 min-h-screen">
        <PageHeader />
        <TransactionNav />
        <main className="container mx-auto p-4">
            <div className="max-w-2xl mx-auto">
            <Card>
            <CardHeader>
                <CardTitle>{editId ? 'Edit Purchase Return' : 'New Purchase Return'}</CardTitle>
                <CardDescription>Record a fuel return to a supplier.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="supplierId">Supplier</Label>
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
                    <Label>Fuel Type</Label>
                    <Controller
                    name="fuelType"
                    control={control}
                    render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value} defaultValue="">
                        <SelectTrigger>
                            <SelectValue placeholder="Select a fuel type" />
                        </SelectTrigger>
                        <SelectContent>
                            {mainProducts.map(fuel => (
                            <SelectItem key={fuel.id} value={fuel.name}>{fuel.name}</SelectItem>
                            ))}
                        </SelectContent>
                        </Select>
                    )}
                    />
                    {errors.fuelType && <p className="text-sm text-destructive">{errors.fuelType.message}</p>}
                     {selectedFuelType && (
                        <p className="text-xs text-muted-foreground pt-1">
                            Current Stock: {(fuelStock[selectedFuelType] || 0).toLocaleString(undefined, {maximumFractionDigits: 2})} Ltr
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                    <Label htmlFor="volume">Volume (Litres)</Label>
                    <Input id="volume" type="number" {...register('volume')} placeholder="e.g., 500" step="0.01" />
                    {errors.volume && <p className="text-sm text-destructive">{errors.volume.message}</p>}
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="totalRefund">Total Refund (PKR)</Label>
                    <Input id="totalRefund" type="number" {...register('totalRefund')} placeholder="e.g., 100000" step="0.01" />
                    {errors.totalRefund && <p className="text-sm text-destructive">{errors.totalRefund.message}</p>}
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="reason">Reason for Return</Label>
                    <Textarea id="reason" {...register('reason')} placeholder="e.g., Contaminated fuel, wrong type delivered" />
                    {errors.reason && <p className="text-sm text-destructive">{errors.reason.message}</p>}
                </div>
                
                <div className="space-y-2">
                    <Label>Date</Label>
                    <Controller
                        name="date"
                        control={control}
                        render={({ field }) => (
                        <Popover open={returnDateCalendarOpen} onOpenChange={setReturnDateCalendarOpen}>
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
                                key="purchase-returns-calendar"
                                mode="single"
                                selected={field.value}
                                defaultMonth={field.value}
                                onSelect={(date) => {
                                    field.onChange(date);
                                    setReturnDateCalendarOpen(false);
                                }}
                                initialFocus
                            />
                            </PopoverContent>
                        </Popover>
                        )}
                    />
                    {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
                </div>

                {!isPinVerified() && (
                    <div className="space-y-2 border-t pt-4">
                        <Label htmlFor="pin" className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary"/> Security PIN</Label>
                        <Input id="pin" type="password" {...register('pin')} placeholder="Enter 4-digit PIN" maxLength={4} />
                    </div>
                )}
                
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


                <Button type="submit" className="w-full">{editId ? 'Update Return' : 'Record Return'}</Button>
                {editId && <Button type="button" variant="outline" className="w-full" onClick={() => router.push('/ledger')}>Cancel</Button>}
                </form>
            </CardContent>
            </Card>
            </div>
        </main>
    </div>
  );
}
