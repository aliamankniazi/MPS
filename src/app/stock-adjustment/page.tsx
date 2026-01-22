
'use client';

import * as React from 'react';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Package, Edit, List, Calendar as CalendarIcon, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { FuelType, StockAdjustment, DateRange } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDatabase } from '@/hooks/use-database';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isValid, startOfDay, endOfDay } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
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


const FUEL_TYPES: FuelType[] = ['Unleaded', 'Premium', 'Diesel'];

const adjustmentSchema = z.object({
  fuelType: z.enum(FUEL_TYPES, { required_error: 'Please select a fuel type.' }),
  adjustment: z.coerce.number(),
  date: z.date({ required_error: "A date is required."}),
});

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;


export default function StockAdjustmentPage() {
  const { 
    fuelStock, 
    stockAdjustments,
    addStockAdjustment,
    deleteStockAdjustment,
    isLoaded,
    dateRange,
    setDateRange
  } = useDatabase();
  const { toast } = useToast();
  const [adjustmentToDelete, setAdjustmentToDelete] = React.useState<StockAdjustment | null>(null);

  const { register, handleSubmit, control, reset, watch, setValue } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
  });

  React.useEffect(() => {
    reset({
        adjustment: 0,
        date: new Date(),
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
    if (newStock < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Adjustment',
        description: 'Stock level cannot be negative.',
      });
      return;
    }

    addStockAdjustment({
        fuelType: data.fuelType,
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
        adjustment: 0,
        date: new Date()
    });
  };
  
  const handleDeleteAdjustment = () => {
    if (!adjustmentToDelete) return;
    deleteStockAdjustment(adjustmentToDelete.id);
    toast({
      title: 'Adjustment Deleted',
      description: `The stock adjustment has been moved to the recycle bin.`,
    });
    setAdjustmentToDelete(null);
  };


  return (
    <>
    <div className="p-4 md:p-8 space-y-8">
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
                <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
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
                                {FUEL_TYPES.map(fuel => (
                                <SelectItem key={fuel} value={fuel}>{fuel}</SelectItem>
                                ))}
                            </SelectContent>
                            </Select>
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
                 <div className="space-y-2 max-w-xs">
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
                                key="stock-adjustment-form-calendar"
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                initialFocus
                            />
                            </PopoverContent>
                        </Popover>
                        )}
                    />
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
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                id="date"
                                variant={"outline"}
                                className={cn(
                                    "w-[260px] justify-start text-left font-normal",
                                    !dateRange && "text-muted-foreground"
                                )}
                                >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (
                                    dateRange.to ? (
                                    <>
                                        {format(dateRange.from, "dd-MMM-yyyy")} -{" "}
                                        {format(dateRange.to, "dd-MMM-yyyy")}
                                    </>
                                    ) : (
                                    format(dateRange.from, "dd-MMM-yyyy")
                                    )
                                ) : (
                                    <span>Pick a date range</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                key="stock-adjustment-calendar"
                                initialFocus
                                mode="range"
                                defaultMonth={dateRange?.from}
                                selected={dateRange}
                                onSelect={setDateRange}
                                numberOfMonths={2}
                            />
                        </PopoverContent>
                    </Popover>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Fuel Type</TableHead>
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
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                    {isLoaded ? 'No adjustments recorded.' : 'Loading adjustments...'}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

    </div>
      <AlertDialog open={!!adjustmentToDelete} onOpenChange={(isOpen) => !isOpen && setAdjustmentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the stock adjustment entry to the recycle bin: <br/>
              <strong className="font-medium text-foreground">{adjustmentToDelete?.adjustment.toFixed(2)}L of {adjustmentToDelete?.fuelType} on {adjustmentToDelete && format(new Date(adjustmentToDelete.timestamp), 'dd-MMM-yyyy')}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAdjustment} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, delete entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
