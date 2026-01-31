
'use client';

import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Fuel, List, PlusCircle, Calendar as CalendarIcon, Trash2 } from 'lucide-react';
import { format, getDaysInMonth, getYear, getMonth, getDate, isValid } from 'date-fns';
import type { FuelType, Machine } from '@/lib/types';
import { useDatabase } from '@/hooks/use-database';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import React, { useEffect, useMemo } from 'react';

const machineSchema = z.object({
  name: z.string().min(1, 'Machine name is required'),
  fuelType: z.string({ required_error: 'Please select a fuel type.' }).min(1, "Please select a fuel type."),
});

type MachineFormValues = z.infer<typeof machineSchema>;

const machineReadingSchema = z.object({
  machineId: z.string().min(1, 'Please select a machine.'),
  volume: z.coerce.number().min(0, 'Volume cannot be negative'),
  date: z.date({ required_error: "A date is required."}),
});

type MachineReadingFormValues = z.infer<typeof machineReadingSchema>;

export default function MachineManagementPage() {
  const { machines, machineReadings, addMachine, deleteMachine, addMachineReading, fuelStock, products } = useDatabase();
  const { toast } = useToast();

  const mainProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p => p.category === 'Main Product');
  }, [products]);

  const { register: registerReading, handleSubmit: handleSubmitReading, control: controlReading, reset: resetReading, formState: { errors: readingErrors } } = useForm<MachineReadingFormValues>({
    resolver: zodResolver(machineReadingSchema),
  });
  
  useEffect(() => {
    resetReading({
        date: new Date(),
    });
  }, [resetReading]);
  
  const { register: registerMachine, handleSubmit: handleSubmitMachine, control: controlMachine, reset: resetMachine, formState: { errors: machineErrors }, watch: watchMachine } = useForm<MachineFormValues>();
  
  const selectedFuelTypeForNewMachine = watchMachine('fuelType');

  const latestReadingForSelectedFuel = useMemo(() => {
    if (!selectedFuelTypeForNewMachine || !machineReadings) return null;

    return [...machineReadings]
        .filter(r => r.fuelType === selectedFuelTypeForNewMachine)
        .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  }, [selectedFuelTypeForNewMachine, machineReadings]);

  const onReadingSubmit: SubmitHandler<MachineReadingFormValues> = (data) => {
    const machine = machines.find(t => t.id === data.machineId);
    if (!machine) return;

    addMachineReading({ 
        machineId: machine.id,
        machineName: machine.name,
        fuelType: machine.fuelType,
        volume: data.volume,
        timestamp: data.date.toISOString(),
    });
    
    toast({
      title: 'Machine Reading Logged',
      description: `New volume for ${machine.name} has been recorded as ${data.volume}L.`,
    });
    resetReading({ machineId: '', volume: 0, date: new Date() });
  };
  
  const onMachineSubmit: SubmitHandler<MachineFormValues> = (data) => {
    addMachine(data);
    toast({
      title: 'Machine Added',
      description: `${data.name} has been added to your machine list.`,
    });
    resetMachine();
  };

  return (
    <div className="p-4 md:p-8 grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-1 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlusCircle /> New Machine Reading
            </CardTitle>
            <CardDescription>Enter the current volume for a fuel machine.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitReading(onReadingSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label>Machine</Label>
                <Controller
                  name="machineId"
                  control={controlReading}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value} defaultValue="">
                      <SelectTrigger>
                        <SelectValue placeholder="Select a machine" />
                      </SelectTrigger>
                      <SelectContent>
                        {machines.map(machine => (
                          <SelectItem key={machine.id} value={machine.id}>{machine.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {readingErrors.machineId && <p className="text-sm text-destructive">{readingErrors.machineId.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="volume">Current Volume (Litres)</Label>
                <Input id="volume" type="number" {...registerReading('volume')} placeholder="e.g., 12500" step="0.01" />
                {readingErrors.volume && <p className="text-sm text-destructive">{readingErrors.volume.message}</p>}
              </div>

               <div className="space-y-2">
                <Label>Date</Label>
                <Controller
                    name="date"
                    control={controlReading}
                    render={({ field }) => {
                        const handleDateChange = (part: 'day' | 'month' | 'year', value: string) => {
                            const currentDate = field.value || new Date();
                            let newDate = new Date(currentDate);
            
                            if (part === 'year') newDate.setFullYear(parseInt(value, 10));
                            if (part === 'month') newDate.setMonth(parseInt(value, 10));
                            if (part === 'day') newDate.setDate(parseInt(value, 10));
                            
                            const daysInNewMonth = getDaysInMonth(newDate);
                            if (newDate.getDate() > daysInNewMonth) {
                                newDate.setDate(daysInNewMonth);
                            }
            
                            if (isValid(newDate)) {
                                field.onChange(newDate);
                            }
                        };
                        
                        const selectedDate = field.value || new Date();
                        const currentDay = getDate(selectedDate).toString();
                        const currentMonth = getMonth(selectedDate).toString();
                        const currentYear = getYear(selectedDate).toString();
            
                        const years = Array.from({ length: 20 }, (_, i) => (new Date().getFullYear() - 10 + i).toString());
                        const months = Array.from({ length: 12 }, (_, i) => ({ value: i.toString(), label: format(new Date(0, i), 'MMMM') }));
                        const daysInMonth = getDaysInMonth(selectedDate);
                        const days = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString());
            
                        return (
                            <div className="flex gap-2">
                                <Select value={currentDay} onValueChange={(val) => handleDateChange('day', val)}>
                                    <SelectTrigger className="w-[80px]"><SelectValue placeholder="Day" /></SelectTrigger>
                                    <SelectContent>
                                        {days.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select value={currentMonth} onValueChange={(val) => handleDateChange('month', val)}>
                                    <SelectTrigger className="w-[120px]"><SelectValue placeholder="Month" /></SelectTrigger>
                                    <SelectContent>
                                        {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select value={currentYear} onValueChange={(val) => handleDateChange('year', val)}>
                                    <SelectTrigger className="w-[100px]"><SelectValue placeholder="Year" /></SelectTrigger>
                                    <SelectContent>
                                        {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        );
                    }}
                />
                {readingErrors.date && <p className="text-sm text-destructive">{readingErrors.date.message}</p>}
              </div>

              <Button type="submit" className="w-full">Log Reading</Button>
            </form>
          </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle>Add a New Machine</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmitMachine(onMachineSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="machineName">Machine Name</Label>
                        <Input id="machineName" {...registerMachine('name')} placeholder="e.g. Unleaded Machine 1 (A+B Side)" />
                        {machineErrors.name && <p className="text-sm text-destructive">{machineErrors.name.message}</p>}
                    </div>
                     <div className="space-y-2">
                        <Label>Fuel Type</Label>
                        <Controller
                        name="fuelType"
                        control={controlMachine}
                        render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value} defaultValue="">
                            <SelectTrigger><SelectValue placeholder="Select fuel type" /></SelectTrigger>
                            <SelectContent>
                                {mainProducts.map(fuel => (
                                <SelectItem key={fuel.id} value={fuel.name}>{fuel.name}</SelectItem>
                                ))}
                            </SelectContent>
                            </Select>
                        )}
                        />
                        {machineErrors.fuelType && <p className="text-sm text-destructive">{machineErrors.fuelType.message}</p>}
                        {selectedFuelTypeForNewMachine && (
                            <div className="text-xs text-muted-foreground mt-2 space-y-1">
                                {fuelStock && (
                                    <div>
                                        Current Stock: {(fuelStock[selectedFuelTypeForNewMachine as FuelType] || 0).toLocaleString()} Ltr
                                    </div>
                                )}
                                {latestReadingForSelectedFuel ? (
                                    <div>
                                        Latest Reading: {latestReadingForSelectedFuel.volume.toLocaleString()} Ltr on '{latestReadingForSelectedFuel.machineName}' ({format(new Date(latestReadingForSelectedFuel.timestamp), 'dd-MMM-yy')})
                                    </div>
                                ) : (
                                    <div>Latest Reading: N/A</div>
                                )}
                            </div>
                        )}
                    </div>
                    <Button type="submit" className="w-full">Add Machine</Button>
                </form>
            </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <List /> Machine Reading History
            </CardTitle>
            <CardDescription>
              A historical record of all machine volume entries.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {machineReadings && machineReadings.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead className="text-right">Volume (L)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {machineReadings.map(reading => (
                      <TableRow key={reading.id}>
                        <TableCell className="font-medium">{format(new Date(reading.timestamp), 'dd-MMM-yyyy hh:mm a')}</TableCell>
                        <TableCell>{reading.machineName} ({reading.fuelType})</TableCell>
                        <TableCell className="text-right">{reading.volume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
                <Fuel className="w-16 h-16" />
                <h3 className="text-xl font-semibold">No Machine Readings Found</h3>
                <p>Use the form to log your first machine volume reading.</p>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="mt-8">
            <CardHeader><CardTitle>Manage Machines</CardTitle></CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Machine Name</TableHead>
                            <TableHead>Fuel Type</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {machines && machines.length > 0 ? machines.map(machine => (
                            <TableRow key={machine.id}>
                                <TableCell>{machine.name}</TableCell>
                                <TableCell>{machine.fuelType}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" onClick={() => deleteMachine(machine.id)}>
                                        <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={3} className="h-24 text-center">No machines configured yet.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
