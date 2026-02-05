
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
import type { FuelType } from '@/lib/types';
import { format, isValid } from 'date-fns';
import { useDatabase } from '@/hooks/use-database';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import React, { useState, useEffect } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { TransactionNav } from '@/components/transaction-nav';


const FUEL_TYPES: FuelType[] = ['Unleaded', 'Premium', 'Diesel'];

const purchaseReturnSchema = z.object({
  supplierId: z.string().min(1, 'Please select a supplier.'),
  fuelType: z.enum(FUEL_TYPES, { required_error: 'Please select a fuel type.' }),
  volume: z.coerce.number().min(0.01, 'Volume must be greater than 0'),
  totalRefund: z.coerce.number().min(0.01, 'Total refund must be greater than 0'),
  reason: z.string().min(1, 'Reason for return is required'),
  date: z.date({ required_error: "A date is required."}),
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
  const { addPurchaseReturn, suppliers, isLoaded } = useDatabase();
  const { toast } = useToast();
  const [supplierComboboxOpen, setSupplierComboboxOpen] = useState(false);
  const [returnDateCalendarOpen, setReturnDateCalendarOpen] = useState(false);

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<PurchaseReturnFormValues>({
    resolver: zodResolver(purchaseReturnSchema),
  });
  
  useEffect(() => {
    const savedDate = localStorage.getItem('global_lastTransactionDate');
    const initialDate = savedDate && isValid(new Date(savedDate)) ? new Date(savedDate) : new Date();
    reset({
      date: initialDate,
    });
  }, [reset]);

  const onSubmit: SubmitHandler<PurchaseReturnFormValues> = (data) => {
    const supplier = suppliers.find(s => s.id === data.supplierId);
    if (!supplier) return;

    localStorage.setItem('global_lastTransactionDate', data.date.toISOString());

    addPurchaseReturn({ 
        ...data, 
        supplier: supplier.name, // Pass name for display
        timestamp: data.date.toISOString() 
    });
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
      reason: ''
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
                <CardTitle>New Purchase Return</CardTitle>
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
                            {FUEL_TYPES.map(fuel => (
                            <SelectItem key={fuel} value={fuel}>{fuel}</SelectItem>
                            ))}
                        </SelectContent>
                        </Select>
                    )}
                    />
                    {errors.fuelType && <p className="text-sm text-destructive">{errors.fuelType.message}</p>}
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

                <Button type="submit" className="w-full">Record Return</Button>
                </form>
            </CardContent>
            </Card>
            </div>
        </main>
    </div>
  );
}
