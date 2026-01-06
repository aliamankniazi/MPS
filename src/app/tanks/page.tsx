
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
import { format } from 'date-fns';
import type { FuelType, Tank } from '@/lib/types';
import { useDatabase } from '@/hooks/use-database';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import React from 'react';

const FUEL_TYPES: FuelType[] = ['Unleaded', 'Premium', 'Diesel'];

const tankSchema = z.object({
  name: z.string().min(1, 'Tank name is required'),
  fuelType: z.enum(FUEL_TYPES, { required_error: 'Please select a fuel type.' }),
});

type TankFormValues = z.infer<typeof tankSchema>;

const tankReadingSchema = z.object({
  tankId: z.string().min(1, 'Please select a tank.'),
  volume: z.coerce.number().min(0, 'Volume cannot be negative'),
  date: z.date({ required_error: "A date is required."}),
});

type TankReadingFormValues = z.infer<typeof tankReadingSchema>;

export default function TankManagementPage() {
  const { tanks, tankReadings, addTank, deleteTank, addTankReading, setFuelStock } = useDatabase();
  const { toast } = useToast();

  const { register: registerReading, handleSubmit: handleSubmitReading, control: controlReading, reset: resetReading, formState: { errors: readingErrors } } = useForm<TankReadingFormValues>({
    resolver: zodResolver(tankReadingSchema),
    defaultValues: {
        date: new Date(),
    }
  });
  
  const { register: registerTank, handleSubmit: handleSubmitTank, control: controlTank, reset: resetTank, formState: { errors: tankErrors } } = useForm<TankFormValues>();

  const onReadingSubmit: SubmitHandler<TankReadingFormValues> = (data) => {
    const tank = tanks.find(t => t.id === data.tankId);
    if (!tank) return;

    addTankReading({ 
        tankId: tank.id,
        tankName: tank.name,
        fuelType: tank.fuelType,
        volume: data.volume,
        timestamp: data.date.toISOString(),
    });
    // This assumes one tank reading overrides the stock for that fuel type.
    // For multiple tanks of the same fuel, this logic would need to be more complex.
    setFuelStock(tank.fuelType, data.volume);
    toast({
      title: 'Tank Reading Logged',
      description: `New volume for ${tank.name} has been recorded as ${data.volume}L.`,
    });
    resetReading({ tankId: '', volume: 0, date: new Date() });
  };
  
  const onTankSubmit: SubmitHandler<TankFormValues> = (data) => {
    addTank(data);
    toast({
      title: 'Tank Added',
      description: `${data.name} has been added to your tank list.`,
    });
    resetTank();
  };

  return (
    <div className="p-4 md:p-8 grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-1 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlusCircle /> New Tank Reading
            </CardTitle>
            <CardDescription>Enter the current volume for a fuel tank.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitReading(onReadingSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label>Tank</Label>
                <Controller
                  name="tankId"
                  control={controlReading}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value} defaultValue="">
                      <SelectTrigger>
                        <SelectValue placeholder="Select a tank" />
                      </SelectTrigger>
                      <SelectContent>
                        {tanks.map(tank => (
                          <SelectItem key={tank.id} value={tank.id}>{tank.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {readingErrors.tankId && <p className="text-sm text-destructive">{readingErrors.tankId.message}</p>}
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
                          {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  )}
                />
                {readingErrors.date && <p className="text-sm text-destructive">{readingErrors.date.message}</p>}
              </div>

              <Button type="submit" className="w-full">Log Reading</Button>
            </form>
          </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle>Add a New Tank</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmitTank(onTankSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="tankName">Tank Name</Label>
                        <Input id="tankName" {...registerTank('name')} placeholder="e.g. Unleaded Tank 1 (A+B Side)" />
                        {tankErrors.name && <p className="text-sm text-destructive">{tankErrors.name.message}</p>}
                    </div>
                     <div className="space-y-2">
                        <Label>Fuel Type</Label>
                        <Controller
                        name="fuelType"
                        control={controlTank}
                        render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value} defaultValue="">
                            <SelectTrigger><SelectValue placeholder="Select fuel type" /></SelectTrigger>
                            <SelectContent>
                                {FUEL_TYPES.map(fuel => (
                                <SelectItem key={fuel} value={fuel}>{fuel}</SelectItem>
                                ))}
                            </SelectContent>
                            </Select>
                        )}
                        />
                        {tankErrors.fuelType && <p className="text-sm text-destructive">{tankErrors.fuelType.message}</p>}
                    </div>
                    <Button type="submit" className="w-full">Add Tank</Button>
                </form>
            </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <List /> Tank Reading History
            </CardTitle>
            <CardDescription>
              A historical record of all tank volume entries.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tankReadings.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Tank</TableHead>
                    <TableHead className="text-right">Volume (L)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tankReadings.map(reading => (
                      <TableRow key={reading.id}>
                        <TableCell className="font-medium">{format(new Date(reading.timestamp), 'PP pp')}</TableCell>
                        <TableCell>{reading.tankName} ({reading.fuelType})</TableCell>
                        <TableCell className="text-right">{reading.volume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
                <Fuel className="w-16 h-16" />
                <h3 className="text-xl font-semibold">No Tank Readings Found</h3>
                <p>Use the form to log your first tank volume reading.</p>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="mt-8">
            <CardHeader><CardTitle>Manage Tanks</CardTitle></CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Tank Name</TableHead>
                            <TableHead>Fuel Type</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tanks.length > 0 ? tanks.map(tank => (
                            <TableRow key={tank.id}>
                                <TableCell>{tank.name}</TableCell>
                                <TableCell>{tank.fuelType}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" onClick={() => deleteTank(tank.id)}>
                                        <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={3} className="h-24 text-center">No tanks configured yet.</TableCell>
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
