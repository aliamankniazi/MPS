'use client';

import * as React from 'react';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Wrench, Trash2, ShieldCheck, Sun, Calendar as CalendarIcon, ChevronsUpDown, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { FuelType, StockAdjustment } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDatabase } from '@/hooks/use-database';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isValid, startOfToday, endOfToday } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TransactionNav } from '@/components/transaction-nav';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { useAuth } from '@/hooks/use-auth';
import { useSearchParams, useRouter } from 'next/navigation';
import { SignedInEmail } from '@/components/signed-in-email';

const adjustmentSchema = z.object({
  fuelType: z.string().min(1, 'Please select a fuel type.'),
  supplierId: z.string().optional(),
  adjustment: z.coerce.number(),
  date: z.date({ required_error: "A date is required."}),
  pin: z.string().optional(),
});

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

function PageHeader() {
    const [currentTime, setCurrentTime] = React.useState('');
    React.useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date().toLocaleString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
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
                <Button variant="ghost" size="icon"><Sun className="h-5 w-5" /></Button>
            </div>
        </div>
      </header>
    );
}

export default function StockAdjustmentPage() {
  const { fuelStock, stockAdjustments, addStockAdjustment, updateStockAdjustment, deleteStockAdjustment, isLoaded, products, suppliers } = useDatabase();
  const { isPinVerified, confirmPin } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const editId = searchParams.get('edit');
  const { toast } = useToast();
  const [adjustmentToDelete, setAdjustmentToDelete] = React.useState<StockAdjustment | null>(null);
  const [deletePin, setDeletePin] = React.useState('');
  const [supplierComboboxOpen, setSupplierComboboxOpen] = React.useState(false);

  const { register, handleSubmit, control, reset, watch, setValue, formState: { errors } } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
  });

  React.useEffect(() => {
    if (isLoaded && editId) {
        const adj = stockAdjustments.find(a => a.id === editId);
        if (adj) {
            setValue('fuelType', adj.fuelType);
            setValue('supplierId', adj.supplierId || '');
            setValue('adjustment', adj.adjustment);
            setValue('date', new Date(adj.timestamp));
        }
    }
  }, [isLoaded, editId, stockAdjustments, setValue]);

  React.useEffect(() => {
    if (!editId) {
        const savedDate = localStorage.getItem('global_date_from');
        reset({ adjustment: 0, date: savedDate && isValid(new Date(savedDate)) ? new Date(savedDate) : new Date() });
    }
  }, [reset, editId]);

  const selectedFuelType = watch('fuelType');
  const adjustmentValue = watch('adjustment');
  const currentStock = selectedFuelType ? (fuelStock[selectedFuelType] || 0) : 0;
  
  const displayCurrentStock = React.useMemo(() => {
      if (!editId || !selectedFuelType) return currentStock;
      const originalAdj = stockAdjustments.find(a => a.id === editId);
      if (originalAdj && originalAdj.fuelType === selectedFuelType) {
          return currentStock - originalAdj.adjustment;
      }
      return currentStock;
  }, [editId, selectedFuelType, currentStock, stockAdjustments]);

  const newStock = Number(displayCurrentStock) + (Number(adjustmentValue) || 0);

  const onAdjustmentSubmit: SubmitHandler<AdjustmentFormValues> = (data) => {
    if (!isPinVerified() && data.pin !== '0200') {
      toast({ variant: 'destructive', title: 'Incorrect PIN' });
      return;
    }
    if (data.pin === '0200') confirmPin('0200');

    if (newStock < 0) {
      toast({ variant: 'destructive', title: 'Invalid Adjustment', description: 'Stock level cannot be negative.' });
      return;
    }

    const supplier = data.supplierId ? suppliers.find(s => s.id === data.supplierId) : null;
    const adjustmentData = { 
        fuelType: data.fuelType, 
        supplierId: data.supplierId, 
        supplierName: supplier?.name, 
        adjustment: data.adjustment, 
        newStock: newStock, 
        timestamp: data.date.toISOString() 
    };

    if (editId) {
        updateStockAdjustment(editId, adjustmentData);
        toast({ title: 'Adjustment Updated' });
        router.push('/ledger');
    } else {
        addStockAdjustment(adjustmentData);
        toast({ title: 'Stock Adjusted' });
        reset({ fuelType: '', supplierId: '', adjustment: 0, date: data.date, pin: '' });
    }
  };
  
  const handleDeleteAdjustment = () => {
    if (!adjustmentToDelete) return;
    if (!isPinVerified() && deletePin !== '0200') {
      toast({ variant: 'destructive', title: 'Incorrect PIN' });
      return;
    }
    if (deletePin === '0200') confirmPin('0200');
    deleteStockAdjustment(adjustmentToDelete.id);
    toast({ title: 'Adjustment Deleted' });
    setAdjustmentToDelete(null); 
    setDeletePin('');
  };

  return (
    <div className="bg-muted/30 min-h-screen">
      <PageHeader /><TransactionNav />
      <main className="container mx-auto p-4 md:p-8">
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>{editId ? 'Edit Stock Adjustment' : 'Stock Adjustment'}</CardTitle>
              <CardDescription>Manually correct fuel stock levels.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onAdjustmentSubmit)} className="space-y-4">
                    <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
                        <div className="space-y-2">
                          <Label>Fuel Type</Label>
                          <Controller 
                            name="fuelType" 
                            control={control} 
                            render={({ field }) => (
                              <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Fuel" />
                                </SelectTrigger>
                                <SelectContent>
                                  {products.filter(p => p.category === 'Main Product').map(f => (
                                    <SelectItem key={f.id} value={f.name}>{f.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Supplier (Optional)</Label>
                          <Controller 
                            name="supplierId" 
                            control={control} 
                            render={({ field }) => (
                              <Popover open={supplierComboboxOpen} onOpenChange={setSupplierComboboxOpen}>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" className="w-full justify-between">
                                    {field.value ? suppliers.find(s => s.id === field.value)?.name : "None"}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                  <Command>
                                    <CommandInput placeholder="Search..." />
                                    <CommandList>
                                      <CommandEmpty>None found.</CommandEmpty>
                                      <CommandGroup>
                                        {isLoaded ? suppliers.map(s => (
                                          <CommandItem key={s.id} value={s.name} onSelect={() => { field.onChange(s.id); setSupplierComboboxOpen(false); }}>
                                            <Check className={cn("mr-2 h-4 w-4", field.value === s.id ? "opacity-100" : "opacity-0")} />
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
                        </div>
                        <div className="space-y-2"><Label>Current</Label><Input value={displayCurrentStock.toFixed(2)} readOnly disabled className="bg-muted" /></div>
                        <div className="space-y-2"><Label>Adj (Ltr)</Label><Input type="number" {...register('adjustment')} step="any" /></div>
                        <div className="space-y-2"><Label>New Level</Label><Input value={newStock.toFixed(2)} readOnly disabled className="bg-muted font-bold" /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                        <div className="space-y-2">
                          <Label>Date</Label>
                          <Controller 
                            name="date" 
                            control={control} 
                            render={({ field }) => (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? format(field.value, "dd-MMM-yyyy") : "Pick date"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                  <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                </PopoverContent>
                              </Popover>
                            )}
                          />
                        </div>
                        {!isPinVerified() && (
                            <div className="space-y-2">
                              <Label className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary"/> Security PIN</Label>
                              <Input type="password" {...register('pin')} placeholder="PIN" maxLength={4} />
                            </div>
                        )}
                    </div>
                    <Button type="submit" disabled={!selectedFuelType || !isLoaded} className="w-full">{editId ? 'Update Adjustment' : 'Adjust Stock'}</Button>
                    {editId && <Button type="button" variant="outline" className="w-full" onClick={() => router.push('/ledger')}>Cancel</Button>}
                </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Adjustment History</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Fuel</TableHead>
                    <TableHead className="text-right">Adj (L)</TableHead>
                    <TableHead className="text-right">New Level</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoaded && stockAdjustments.map(adj => (
                    <TableRow key={adj.id}>
                      <TableCell>{format(new Date(adj.timestamp), 'dd-MMM-yy HH:mm')}</TableCell>
                      <TableCell>{adj.fuelType}</TableCell>
                      <TableCell className={cn("text-right font-mono", adj.adjustment >= 0 ? 'text-green-600' : 'text-destructive')}>
                        {adj.adjustment.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-bold">{adj.newStock.toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" onClick={() => setAdjustmentToDelete(adj)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
      <AlertDialog open={!!adjustmentToDelete} onOpenChange={(o) => { if (!o) { setAdjustmentToDelete(null); setDeletePin(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Delete this adjustment record of {adjustmentToDelete?.adjustment.toFixed(2)}L?
              {!isPinVerified() && (
                <div className="mt-4 space-y-2">
                  <Label>Security PIN Required:</Label>
                  <Input type="password" value={deletePin} onChange={(e) => setDeletePin(e.target.value)} placeholder="0200" maxLength={4} />
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAdjustment} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
