
'use client';

import * as React from 'react';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Package, Edit, List, Trash2, AlertTriangle, Sun, Check, ChevronsUpDown, Calendar as CalendarIcon, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { FuelType, StockAdjustment } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDatabase } from '@/hooks/use-database';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isValid, startOfDay, endOfDay } from 'date-fns';
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


const adjustmentSchema = z.object({
  fuelType: z.string().min(1, 'Please select a fuel type.'),
  supplierId: z.string().optional(),
  adjustment: z.coerce.number(),
  date: z.date({ required_error: "A date is required."}),
  pin: z.string().length(4, "PIN must be 4 digits"),
});

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

function PageHeader() {
    const [currentTime, setCurrentTime] = React.useState('');
    
    React.useEffect(() => {
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


export default function StockAdjustmentPage() {
  const { 
    fuelStock, 
    stockAdjustments,
    addStockAdjustment,
    deleteStockAdjustment,
    isLoaded,
    dateRange,
    products,
    suppliers,
  } = useDatabase();
  const { toast } = useToast();
  const [adjustmentToDelete, setAdjustmentToDelete] = React.useState<StockAdjustment | null>(null);
  const [deletePin, setDeletePin] = React.useState('');
  const [supplierComboboxOpen, setSupplierComboboxOpen] = React.useState(false);


  const mainProducts = React.useMemo(() => {
    if (!products) return [];
    return products.filter(p => p.category === 'Main Product');
  }, [products]);

  const { register, handleSubmit, control, reset, watch, formState: { errors } } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
  });

  React.useEffect(() => {
    const savedDate = localStorage.getItem('global_date_from');
    const initialDate = savedDate && isValid(new Date(savedDate)) ? new Date(savedDate) : new Date();
    reset({
        adjustment: 0,
        date: initialDate,
    });
  }, [reset]);

  const selectedFuelType = watch('fuelType');
  const adjustmentValue = watch('adjustment');
  const currentStock = selectedFuelType ? (fuelStock[selectedFuelType] || 0) : 0;
  
  const newStock = React.useMemo(() => {
    const adj = Number(adjustmentValue) || 0;
    return Number(currentStock) + adj;
  }, [currentStock, adjustmentValue]);

  const filteredAdjustments = React.useMemo(() => {
    if (!dateRange || !dateRange.from) {
      return stockAdjustments;
    }
    const from = startOfDay(dateRange.from);
    const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);
    return stockAdjustments.filter(adj => {
        const adjDate = new Date(adj.timestamp);
        return isValid(adjDate) && adjDate >= from && adjDate <= to;
    });
  }, [stockAdjustments, dateRange]);


  const onAdjustmentSubmit: SubmitHandler<AdjustmentFormValues> = (data) => {
    if (data.pin !== '0200') {
      toast({
        variant: 'destructive',
        title: 'Incorrect PIN',
        description: 'Verification failed. Incorrect Security PIN.',
      });
      return;
    }

    if (newStock < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Adjustment',
        description: 'Stock level cannot be negative.',
      });
      return;
    }

    const supplier = data.supplierId ? suppliers.find(s => s.id === data.supplierId) : null;
    
    const isoDate = data.date.toISOString();
    localStorage.setItem('global_date_from', isoDate);
    localStorage.setItem('global_date_to', isoDate);

    addStockAdjustment({
        fuelType: data.fuelType as FuelType,
        supplierId: data.supplierId,
        supplierName: supplier?.name,
        adjustment: data.adjustment,
        newStock: newStock,
        timestamp: data.date.toISOString(),
    });

    toast({
      title: 'Stock Adjusted',
      description: `${data.fuelType} stock has been updated to ${newStock.toLocaleString()} L.`,
    });
    reset({
        fuelType: undefined,
        supplierId: undefined,
        adjustment: 0,
        date: data.date,
        pin: '',
    });
  };
  
  const handleDeleteAdjustment = () => {
    if (!adjustmentToDelete) return;

    if (deletePin !== '0200') {
      toast({ variant: 'destructive', title: 'Incorrect PIN', description: 'Verification failed. Incorrect Security PIN.' });
      return;
    }

    deleteStockAdjustment(adjustmentToDelete.id);
    toast({
      title: 'Adjustment Deleted',
      description: `The stock adjustment has been moved to the recycle bin.`,
    });
    setAdjustmentToDelete(null);
    setDeletePin('');
  };


  return (
    <>
    <div className="bg-muted/30 min-h-screen">
      <PageHeader />
      <TransactionNav />
      <main className="container mx-auto p-4 md:p-8">
        <div className="space-y-8">
            <Card>
                <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-2">
                    <Package /> Stock Adjustment
                </CardTitle>
                <CardDescription>
                    Manually add or remove stock from inventory. This should be used for corrections, spoilage, or other non-standard events.
                </CardDescription>
                </CardHeader>
                <CardContent>
                <form onSubmit={handleSubmit(onAdjustmentSubmit)} className="space-y-4">
                    <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
                        <div className="space-y-2 md:col-span-1">
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
                        </div>
                        <div className="space-y-2 md:col-span-1">
                            <Label>Supplier (Optional)</Label>
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
                                        </Group>
                                        </CommandList>
                                    </Command>
                                    </PopoverContent>
                                </Popover>
                                )}
                            />
                        </div>
                        <div className="space-y-2 md:col-span-1">
                            <Label htmlFor="currentStock">Current Stock (L)</Label>
                            <Input id="currentStock" type="number" value={isLoaded ? currentStock.toFixed(2) : "Loading..."} readOnly disabled className="bg-muted/50" />
                        </div>
                        <div className="space-y-2 md:col-span-1">
                            <Label htmlFor="adjustment">Adjustment (L)</Label>
                            <Input id="adjustment" type="number" {...register('adjustment')} placeholder="e.g., -50 or 100" step="any" />
                        </div>
                            <div className="space-y-2 md:col-span-1">
                            <Label htmlFor="newStock">New Stock (L)</Label>
                            <Input id="newStock" type="number" value={selectedFuelType ? newStock.toFixed(2) : "..."} readOnly disabled className="bg-muted/50 font-bold" />
                        </div>
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
                                        <Button
                                            variant={"outline"}
                                            className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {field.value ? format(field.value, "dd-MMM-yyyy") : <span>Pick a date</span>}
                                        </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={field.value}
                                            onSelect={field.onChange}
                                            defaultMonth={field.value}
                                            initialFocus
                                        />
                                        </PopoverContent>
                                    </Popover>
                                )}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="pin" className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary"/> Security PIN</Label>
                            <Input id="pin" type="password" {...register('pin')} placeholder="Enter 4-digit PIN" maxLength={4} />
                            {errors.pin && <p className="text-sm text-destructive">{errors.pin.message}</p>}
                        </div>
                    </div>
                    <Button type="submit" disabled={!selectedFuelType || !isLoaded} className="flex items-center gap-2"><Edit /> Adjust Stock</Button>
                </form>
                </CardContent>
            </Card>
          
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2"><List /> Adjustment History</CardTitle>
                            <CardDescription>A log of all manual stock adjustments.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Fuel Type</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead className="text-right">Adjustment (Ltr)</TableHead>
                                <TableHead className="text-right">Adjustment (Value)</TableHead>
                                <TableHead className="text-right">New Stock Level</TableHead>
                                <TableHead className="text-center">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoaded && filteredAdjustments.length > 0 ? (
                                filteredAdjustments.map(adj => (
                                    <TableRow key={adj.id}>
                                        <TableCell className="font-medium">{format(new Date(adj.timestamp), 'dd-MMM-yyyy hh:mm a')}</TableCell>
                                        <TableCell>{adj.fuelType}</TableCell>
                                        <TableCell>{adj.supplierName || 'N/A'}</TableCell>
                                        <TableCell className={`text-right font-mono ${adj.adjustment >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                                            {adj.adjustment.toLocaleString(undefined, { signDisplay: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} L
                                        </TableCell>
                                        <TableCell className={`text-right font-mono ${adj.adjustment >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                                            PKR {adj.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-right font-semibold font-mono">
                                            {adj.newStock.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Button variant="ghost" size="icon" title="Delete" onClick={() => setAdjustmentToDelete(adj)}>
                                                <Trash2 className="w-4 h-4 text-destructive" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                        {isLoaded ? 'No adjustments recorded.' : 'Loading adjustments...'}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
      </main>
    </div>

      <AlertDialog open={!!adjustmentToDelete} onOpenChange={(isOpen) => { if (!isOpen) { setAdjustmentToDelete(null); setDeletePin(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the stock adjustment entry to the recycle bin: <br/>
              <strong className="font-medium text-foreground">{adjustmentToDelete?.adjustment.toFixed(2)}L of {adjustmentToDelete?.fuelType} on {adjustmentToDelete && format(new Date(adjustmentToDelete.timestamp), 'dd-MMM-yyyy')}</strong>
              <div className="mt-4 space-y-2">
                <Label htmlFor="delete-pin-adj">Enter PIN to confirm deletion:</Label>
                <Input
                  id="delete-pin-adj"
                  type="password"
                  value={deletePin}
                  onChange={(e) => setDeletePin(e.target.value)}
                  placeholder="Enter 4-digit PIN"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setAdjustmentToDelete(null); setDeletePin(''); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAdjustment} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, delete entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
