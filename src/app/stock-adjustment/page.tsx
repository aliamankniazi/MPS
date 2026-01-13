

'use client';

import * as React from 'react';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Package, Edit, List, Calendar as CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { FuelType } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDatabase } from '@/hooks/use-database';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, isSameDay } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';


const FUEL_TYPES: FuelType[] = ['Unleaded', 'Premium', 'Diesel'];

const adjustmentSchema = z.object({
  fuelType: z.enum(FUEL_TYPES, { required_error: 'Please select a fuel type.' }),
  adjustment: z.coerce.number(),
});

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;


export default function StockAdjustmentPage() {
  const { 
    fuelStock, 
    stockAdjustments,
    addStockAdjustment,
    isLoaded 
  } = useDatabase();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>();

  const { register, handleSubmit, control, reset, watch } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      adjustment: 0,
    }
  });

  const selectedFuelType = watch('fuelType');
  const adjustmentValue = watch('adjustment');
  const currentStock = selectedFuelType ? (fuelStock[selectedFuelType] || 0) : 0;
  
  const newStock = React.useMemo(() => {
    const adj = Number(adjustmentValue) || 0;
    return Number(currentStock) + adj;
  }, [currentStock, adjustmentValue]);


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
    });

    toast({
      title: 'Stock Adjusted',
      description: `${data.fuelType} stock has been updated to ${newStock.toLocaleString()} L.`,
    });
    reset({ fuelType: data.fuelType, adjustment: 0 });
  };
  
  const filteredAdjustments = React.useMemo(() => {
    if (!selectedDate) return stockAdjustments;
    return stockAdjustments.filter(adj => isSameDay(new Date(adj.timestamp), selectedDate));
  }, [stockAdjustments, selectedDate]);


  return (
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
                            variant={"outline"}
                            className={cn(
                            "w-full sm:w-[240px] justify-start text-left font-normal",
                            !selectedDate && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {selectedDate ? format(selectedDate, "PPP") : <span>Filter by date...</span>}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                        <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus />
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
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoaded && filteredAdjustments.length > 0 ? (
                            filteredAdjustments.map(adj => (
                                <TableRow key={adj.id}>
                                    <TableCell className="font-medium">{format(new Date(adj.timestamp), 'PP pp')}</TableCell>
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
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    {isLoaded ? 'No adjustments recorded for this date.' : 'Loading adjustments...'}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

    </div>
  );
}

