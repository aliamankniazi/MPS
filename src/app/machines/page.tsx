
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
import { Fuel, List, PlusCircle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import type { FuelType } from '@/lib/types';
import { useDatabase } from '@/hooks/use-database';
import React, { useCallback, useMemo } from 'react';
import Link from 'next/link';

const machineSchema = z.object({
  name: z.string().min(1, 'Machine name is required'),
  fuelType: z.string({ required_error: 'Please select a fuel type.' }).min(1, "Please select a fuel type."),
  currentReading: z.coerce.number().optional(),
});

type MachineFormValues = z.infer<typeof machineSchema>;

export default function MachineManagementPage() {
  const { machines, machineReadings, addMachine, deleteMachine, addMachineReading, fuelStock, products, initialFuelStock } = useDatabase();
  const { toast } = useToast();
  const [newReadings, setNewReadings] = React.useState<Record<string, string>>({});


  const mainProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p => p.category === 'Main Product');
  }, [products]);

  const { register: registerMachine, handleSubmit: handleSubmitMachine, control: controlMachine, reset: resetMachine, formState: { errors: machineErrors }, watch: watchMachine } = useForm<MachineFormValues>();
  
  const selectedFuelTypeForNewMachine = watchMachine('fuelType');

  const latestReadingForSelectedFuel = useMemo(() => {
    if (!selectedFuelTypeForNewMachine || !machineReadings) return null;

    return [...machineReadings]
        .filter(r => r.fuelType === selectedFuelTypeForNewMachine)
        .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  }, [selectedFuelTypeForNewMachine, machineReadings]);

  const onMachineSubmit: SubmitHandler<MachineFormValues> = async (data) => {
    const newMachine = await addMachine({
        name: data.name,
        fuelType: data.fuelType,
    });

    if (data.currentReading && data.currentReading > 0 && newMachine) {
        addMachineReading({
            machineId: newMachine.id,
            machineName: newMachine.name,
            fuelType: newMachine.fuelType as FuelType,
            volume: data.currentReading,
            timestamp: new Date().toISOString(),
        });
        toast({
            title: 'Machine Added & Reading Logged',
            description: `${data.name} added and initial reading logged.`,
        });
    } else if (newMachine) {
        toast({
          title: 'Machine Added',
          description: `${data.name} has been added to your machine list.`,
        });
    }

    resetMachine({ name: '', fuelType: '', currentReading: undefined });
  };
  
  const handleReadingChange = (machineId: string, value: string) => {
      setNewReadings(prev => ({ ...prev, [machineId]: value }));
  };

  const getLatestReading = useCallback((machineId: string) => {
    if (!machineReadings) return undefined;
    return machineReadings
        .filter(r => r.machineId === machineId)
        .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  }, [machineReadings]);


  const handleSaveReading = (machineId: string) => {
      const machine = machines.find(m => m.id === machineId);
      const newReadingValue = parseFloat(newReadings[machineId]);
      const latestReading = getLatestReading(machineId);
      
      if (!machine || isNaN(newReadingValue)) {
          toast({ variant: 'destructive', title: 'Invalid input', description: 'Please enter a valid number for the reading.' });
          return;
      }

      if (latestReading && newReadingValue < latestReading.volume) {
           toast({ variant: 'destructive', title: 'Invalid Reading', description: 'New reading cannot be less than the last reading.' });
          return;
      }

      addMachineReading({
          machineId: machine.id,
          machineName: machine.name,
          fuelType: machine.fuelType,
          volume: newReadingValue,
          timestamp: new Date().toISOString(),
      });

      toast({ title: 'Reading Updated', description: `New reading for ${machine.name} saved.` });
      
      setNewReadings(prev => ({ ...prev, [machineId]: '' }));
  };


  return (
    <div className="p-4 md:p-8 grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-1 space-y-8">
        <Card>
          <CardHeader>
              <CardTitle className="flex items-center gap-2"><Fuel/> Machine Readings & Dispensed Fuel</CardTitle>
              <CardDescription>Update readings to verify dispensed volume against sales.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              {machines.map(machine => {
                  const latestReading = getLatestReading(machine.id);
                  const newReading = newReadings[machine.id] ? parseFloat(newReadings[machine.id]) : null;
                  const dispensed = latestReading && newReading !== null && newReading > latestReading.volume ? newReading - latestReading.volume : 0;
                  return (
                      <div key={machine.id} className="p-3 border rounded-lg space-y-2">
                          <h4 className="font-semibold">{machine.name} ({machine.fuelType})</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                              <div className="space-y-1">
                                  <Label className="text-xs">Last Reading</Label>
                                  <Input value={latestReading ? latestReading.volume.toFixed(2) : 'N/A'} readOnly disabled />
                              </div>
                              <div className="space-y-1">
                                  <Label htmlFor={`reading-${machine.id}`} className="text-xs">New Reading</Label>
                                  <Input 
                                      id={`reading-${machine.id}`}
                                      type="number"
                                      step="any"
                                      value={newReadings[machine.id] || ''}
                                      onChange={(e) => handleReadingChange(machine.id, e.target.value)}
                                      placeholder="Enter reading"
                                  />
                              </div>
                              <div className="space-y-1">
                                  <Label className="text-xs">Dispensed</Label>
                                  <Input value={dispensed.toFixed(2) + ' Ltr'} readOnly disabled className="font-bold text-green-600" />
                              </div>
                              <div>
                                  <Button onClick={() => handleSaveReading(machine.id)} className="w-full">Save</Button>
                              </div>
                          </div>
                      </div>
                  )
              })}
                {machines.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center p-4">No machines configured. Please add them in the <Link href="/machines" className="underline">Machines</Link> page.</p>
              )}
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
                        <Label htmlFor="currentReading">Current Unit Reading (Optional)</Label>
                        <Input id="currentReading" type="number" {...registerMachine('currentReading')} placeholder="e.g., 12345.67" step="any" />
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
                                {initialFuelStock && (
                                    <div>
                                        Initial Stock: {(initialFuelStock[selectedFuelTypeForNewMachine as FuelType] || 0).toLocaleString()} Ltr
                                    </div>
                                )}
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
              A historical record of all machine reading entries.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {machineReadings && machineReadings.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead className="text-right">Reading</TableHead>
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
