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
import type { Purchase } from '@/lib/types';
import { format, isValid } from 'date-fns';
import { useDatabase } from '@/hooks/use-database';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { TransactionNav } from '@/components/transaction-nav';
import { useSupplierBalance } from '@/hooks/use-supplier-balance';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

const purchaseSchema = z.object({
  supplierId: z.string().min(1, 'Please select a supplier.'),
  fuelType: z.string({ required_error: 'Please select a product.' }).min(1, 'Please select a product.'),
  volume: z.coerce.number().min(0.01, 'Volume must be greater than 0'),
  pricePerLitre: z.coerce.number().min(0.01, 'Price must be greater than 0'),
  totalCost: z.coerce.number().min(0.01, 'Total cost must be greater than 0'),
  date: z.date({ required_error: "A date is required."}),
  pin: z.string().optional(),
});

type PurchaseFormValues = z.infer<typeof purchaseSchema>;

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
                <Button variant="ghost" size="icon"><Sun className="h-5 w-5" /></Button>
            </div>
        </div>
      </header>
    );
}

export default function PurchasesPage() {
  const { addPurchase, updatePurchase, suppliers, purchases, products, isLoaded } = useDatabase();
  const { isPinVerified, confirmPin } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const editId = searchParams.get('edit');
  const { toast } = useToast();
  const [supplierComboboxOpen, setSupplierComboboxOpen] = useState(false);
  const [purchaseDateCalendarOpen, setPurchaseDateCalendarOpen] = useState(false);
  const lastUserEditedField = useRef<'volume' | 'price' | 'total' | null>(null);

  const { register, handleSubmit, reset, control, watch, setValue, formState: { errors } } = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
  });

  const { volume, pricePerLitre, totalCost, fuelType, supplierId } = watch();
  const { balance: supplierBalance } = useSupplierBalance(supplierId);
  const newBalance = useMemo(() => supplierBalance + (Number(totalCost) || 0), [supplierBalance, totalCost]);

  useEffect(() => {
    if (isLoaded && editId) {
        const p = purchases.find(item => item.id === editId);
        if (p) {
            setValue('supplierId', p.supplierId); setValue('fuelType', p.fuelType); setValue('volume', p.volume);
            setValue('pricePerLitre', p.volume > 0 ? p.totalCost / p.volume : 0); setValue('totalCost', p.totalCost);
            setValue('date', new Date(p.timestamp));
        }
    }
  }, [isLoaded, editId, purchases, setValue]);

  useEffect(() => {
    if (lastUserEditedField.current === 'volume' || lastUserEditedField.current === 'price') {
      setValue('totalCost', (Number(volume) || 0) * (Number(pricePerLitre) || 0), { shouldValidate: true });
    }
  }, [volume, pricePerLitre, setValue]);

  useEffect(() => {
    if (lastUserEditedField.current === 'total') {
      if ((Number(pricePerLitre) || 0) > 0) setValue('volume', (Number(totalCost) || 0) / (Number(pricePerLitre) || 0), { shouldValidate: true });
    }
  }, [totalCost, pricePerLitre, setValue]);

  useEffect(() => {
    if (!editId) {
        const savedDate = localStorage.getItem('global_date_from');
        const initialDate = savedDate && isValid(new Date(savedDate)) ? new Date(savedDate) : new Date();
        reset({ date: initialDate, supplierId: localStorage.getItem('global_lastSupplierId') || '', fuelType: localStorage.getItem('global_lastPurchaseProductId') || '' });
    }
  }, [reset, editId]);

  useEffect(() => {
    if (fuelType && purchases.length > 0 && !editId) {
      const lastP = purchases.filter(p => p.fuelType === fuelType).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      if (lastP && lastP.volume > 0) { setValue('pricePerLitre', lastP.totalCost / lastP.volume); lastUserEditedField.current = 'price'; }
    }
  }, [fuelType, purchases, setValue, editId]);

  const onSubmit: SubmitHandler<PurchaseFormValues> = (data) => {
    if (!isPinVerified() && data.pin !== '0200') {
      toast({ variant: 'destructive', title: 'Incorrect PIN' });
      return;
    }
    if (data.pin === '0200') confirmPin('0200');

    const supplier = suppliers.find(s => s.id === data.supplierId);
    if (!supplier) return;

    localStorage.setItem('global_date_from', data.date.toISOString());
    localStorage.setItem('global_lastSupplierId', data.supplierId);
    localStorage.setItem('global_lastPurchaseProductId', data.fuelType);

    const purchaseData: any = { 
        supplierId: data.supplierId, 
        supplier: supplier.name, 
        fuelType: data.fuelType, 
        volume: data.volume, 
        totalCost: data.totalCost, 
        timestamp: data.date.toISOString() 
    };

    if (editId) { 
        // Maintain old color code if update exists
        updatePurchase(editId, purchaseData); 
        toast({ title: 'Purchase Updated' }); 
        router.push('/ledger'); 
    }
    else { 
        addPurchase(purchaseData); 
        toast({ title: 'Purchase Recorded' }); 
        reset({ date: data.date, supplierId: data.supplierId, fuelType: data.fuelType, pricePerLitre: data.pricePerLitre }); 
    }
  };

  return (
    <div className="bg-muted/30 min-h-screen">
      <PageHeader /><TransactionNav />
      <main className="container mx-auto p-4">
        <div className="max-w-2xl mx-auto"><Card><CardHeader><CardTitle>{editId ? 'Edit Purchase' : 'New Purchase'}</CardTitle></CardHeader><CardContent><form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-2"><Label>Supplier</Label><Controller name="supplierId" control={control} render={({ field }) => (<Popover open={supplierComboboxOpen} onOpenChange={setSupplierComboboxOpen}><PopoverTrigger asChild><Button variant="outline" className="w-full justify-between">{field.value ? suppliers.find(s => s.id === field.value)?.name : "Select supplier..."}<ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" /></Button></PopoverTrigger><PopoverContent className="w-[--radix-popover-trigger-width] p-0"><Command><CommandInput placeholder="Search..." /><CommandList><CommandEmpty>None.</CommandEmpty><CommandGroup>{isLoaded && suppliers.map(s => (<CommandItem key={s.id} value={s.name} onSelect={() => { field.onChange(s.id); setSupplierComboboxOpen(false); }}><Check className={cn("mr-2 h-4 w-4", field.value === s.id ? "opacity-100" : "opacity-0")} />{s.name}</CommandItem>))}</CommandGroup></CommandList></Command></PopoverContent></Popover>)}/></div>
                <div className="space-y-2"><Label>Product</Label><Controller name="fuelType" control={control} render={({ field }) => (<Select onValueChange={field.onChange} value={field.value}><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{products.map(p => (<SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>))}</SelectContent></Select>)}/></div>
                <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2"><Label>Litres</Label><Input type="number" {...register('volume')} step="any" onChangeCapture={() => lastUserEditedField.current = 'volume'} /></div>
                    <div className="space-y-2"><Label>Price</Label><Input type="number" {...register('pricePerLitre')} step="any" onChangeCapture={() => lastUserEditedField.current = 'price'} /></div>
                    <div className="space-y-2"><Label>Total Cost</Label><Input type="number" {...register('totalCost')} step="any" onChangeCapture={() => lastUserEditedField.current = 'total'} /></div>
                </div>
                <div className="space-y-2"><Label>Date</Label><Controller name="date" control={control} render={({ field }) => (<Popover open={purchaseDateCalendarOpen} onOpenChange={setPurchaseDateCalendarOpen}><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "dd-MMM-yyyy") : "Pick date"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={(d) => { field.onChange(d); setPurchaseDateCalendarOpen(false); }} initialFocus /></PopoverContent></Popover>)}/></div>
                
                {!isPinVerified() && (
                    <div className="space-y-2 border-t pt-4">
                        <Label className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary"/> Security PIN</Label>
                        <Input type="password" {...register('pin')} placeholder="Enter 4-digit PIN" maxLength={4} />
                    </div>
                )}

                {supplierId && (<div className="border-t pt-4 mt-4 space-y-1 text-sm font-semibold"><span>Account Balance: </span><span className={cn(newBalance > 0 ? "text-green-600" : "text-destructive")}>{newBalance.toFixed(2)} PKR</span></div>)}
                <Button type="submit" className="w-full">{editId ? 'Update' : 'Record'}</Button>
                {editId && <Button type="button" variant="outline" className="w-full" onClick={() => router.push('/ledger')}>Cancel</Button>}
                </form></CardContent></Card></div></main></div>
  );
}
