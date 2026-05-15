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
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { TransactionNav } from '@/components/transaction-nav';
import { useCustomerBalance } from '@/hooks/use-customer-balance';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

const saleReturnSchema = z.object({
  customerId: z.string().min(1, 'Please select a customer.'),
  fuelType: z.string({ required_error: 'Please select a fuel type.' }).min(1, 'Fuel type is required.'),
  volume: z.coerce.number().min(0.01, 'Volume must be greater than 0'),
  pricePerLitre: z.coerce.number().min(0.01, 'Price must be greater than 0'),
  totalRefund: z.coerce.number().min(0.01, 'Total refund must be greater than 0'),
  reason: z.string().min(1, 'Reason for return is required'),
  date: z.date({ required_error: "A date is required."}),
  pin: z.string().optional(),
});

type SaleReturnFormValues = z.infer<typeof saleReturnSchema>;

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

export default function SaleReturnsPage() {
  const { saleReturns, addSaleReturn, updateSaleReturn, customers, isLoaded, products, fuelStock } = useDatabase();
  const { isPinVerified, confirmPin } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const editId = searchParams.get('edit');
  const { toast } = useToast();
  const [customerComboboxOpen, setCustomerComboboxOpen] = useState(false);
  const [returnDateCalendarOpen, setReturnDateCalendarOpen] = useState(false);
  const lastUserEditedField = useRef<'volume' | 'price' | 'total' | null>(null);
  
  const { register, handleSubmit, reset, control, watch, setValue, formState: { errors } } = useForm<SaleReturnFormValues>({
    resolver: zodResolver(saleReturnSchema),
  });

  const selectedCustomerId = watch('customerId');
  const refundAmount = watch('totalRefund');
  const { balance: customerBalance } = useCustomerBalance(selectedCustomerId === 'walkin' ? null : selectedCustomerId);
  const newBalance = useMemo(() => customerBalance - (Number(refundAmount) || 0), [customerBalance, refundAmount]);
  
  const selectedCustomerData = useMemo(() => customers.find(c => c.id === selectedCustomerId), [selectedCustomerId, customers]);

  const selectedFuelType = watch('fuelType');
  const { volume, pricePerLitre, totalRefund } = watch();

  useEffect(() => {
    if (isLoaded && editId) {
        const sr = saleReturns.find(item => item.id === editId);
        if (sr) {
            setValue('customerId', sr.customerId);
            setValue('fuelType', sr.fuelType);
            setValue('volume', sr.volume);
            setValue('totalRefund', sr.totalRefund);
            setValue('reason', sr.reason);
            setValue('date', new Date(sr.timestamp));
            // Try to infer price if not stored
            setValue('pricePerLitre', sr.totalRefund / sr.volume);
        }
    }
  }, [isLoaded, editId, saleReturns, setValue]);

  useEffect(() => {
    const qty = Number(volume) || 0;
    const prc = Number(pricePerLitre) || 0;
    const total = Number(totalRefund) || 0;

    if (lastUserEditedField.current === 'volume' || lastUserEditedField.current === 'price') {
      setValue('totalRefund', qty * prc, { shouldValidate: true });
    } else if (lastUserEditedField.current === 'total') {
      if (prc > 0) setValue('volume', total / prc, { shouldValidate: true });
    }
  }, [volume, pricePerLitre, totalRefund, setValue]);

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

  const onSubmit: SubmitHandler<SaleReturnFormValues> = (data) => {
    if (!isPinVerified() && data.pin !== '0200') {
      toast({
        variant: 'destructive',
        title: 'Incorrect PIN',
        description: 'Verification failed. Incorrect Security PIN.',
      });
      return;
    }
    if (data.pin === '0200') confirmPin('0200');

    const isWalkin = data.customerId === 'walkin';
    const customer = !isWalkin ? customers.find(c => c.id === data.customerId) : null;
    const customerName = isWalkin ? 'Walk-in Customer' : customer?.name;

    if (!customerName) {
        toast({ variant: "destructive", title: "Error", description: "Could not determine customer name." });
        return;
    }

    const isoDate = data.date.toISOString();
    localStorage.setItem('global_date_from', isoDate);
    localStorage.setItem('global_date_to', isoDate);

    const returnData = { 
        customerId: isWalkin ? 'walkin' : data.customerId,
        customerName: customerName,
        fuelType: data.fuelType,
        volume: data.volume,
        totalRefund: data.totalRefund,
        reason: data.reason,
        timestamp: data.date.toISOString() 
    };

    if (editId) {
        updateSaleReturn(editId, returnData);
        toast({ title: 'Sale Return Updated' });
        router.push('/ledger');
    } else {
        addSaleReturn(returnData);
        toast({
          title: 'Sale Return Recorded',
          description: `Return from ${customerName} has been logged.`,
        });
        reset({
          date: data.date,
          customerId: '',
          fuelType: undefined,
          volume: undefined,
          pricePerLitre: undefined,
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
                <CardTitle>{editId ? 'Edit Sale Return' : 'New Sale Return'}</CardTitle>
                <CardDescription>Record a fuel return from a customer.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="customerId">Customer</Label>
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
                            className="w-full justify-between h-auto py-2"
                          >
                            <div className="flex flex-col items-start text-left">
                                <span>{field.value && field.value !== 'walkin'
                                  ? customers.find((c) => c.id === field.value)?.name
                                  : "Walk-in Customer"}</span>
                                {field.value && field.value !== 'walkin' && (
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                        Bal: PKR {customerBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </span>
                                )}
                            </div>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                          <Command>
                            <CommandInput placeholder="Search customer..." />
                            <CommandList>
                              <CommandEmpty>No customer found.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                    key="walkin"
                                    value="Walk-in Customer"
                                    onSelect={() => {
                                      field.onChange('walkin');
                                      setCustomerComboboxOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        (field.value === 'walkin' || !field.value) ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    Walk-in Customer
                                </CommandItem>
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

                <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="volume">Volume (Litres)</Label>
                        <Input id="volume" type="number" {...register('volume')} placeholder="e.g., 50" step="any" onChangeCapture={() => lastUserEditedField.current = 'volume'}/>
                        {errors.volume && <p className="text-sm text-destructive">{errors.volume.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="pricePerLitre">Price / Litre</Label>
                        <Input id="pricePerLitre" type="number" {...register('pricePerLitre')} placeholder="e.g., 250" step="any" onChangeCapture={() => lastUserEditedField.current = 'price'} />
                        {errors.pricePerLitre && <p className="text-sm text-destructive">{errors.pricePerLitre.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="totalRefund">Total Refund (PKR)</Label>
                        <Input id="totalRefund" type="number" {...register('totalRefund')} placeholder="e.g., 12500" step="any" onChangeCapture={() => lastUserEditedField.current = 'total'} />
                        {errors.totalRefund && <p className="text-sm text-destructive">{errors.totalRefund.message}</p>}
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="reason">Reason for Return</Label>
                    <Textarea id="reason" {...register('reason')} placeholder="e.g., Wrong fuel type dispensed" />
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
                                key="sale-returns-calendar"
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

                {selectedCustomerId && selectedCustomerId !== 'walkin' && (
                    <div className="border-t pt-4 mt-4 space-y-1 text-sm bg-muted/50 p-4 rounded-md">
                        <h4 className="font-semibold mb-2">Customer Account Summary</h4>
                        <div className="flex justify-between text-muted-foreground">
                            <span>Account Opening Bal (Profile)</span>
                            <span>PKR {selectedCustomerData?.openingBalance?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                            <span>Previous Balance (Running)</span>
                            <span>PKR {customerBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg pt-2 border-t mt-2">
                            <span>New Account Balance</span>
                            <span className={cn(newBalance < 0 ? "text-green-600" : "text-destructive")}>PKR {newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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
