
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Fuel, Sun } from 'lucide-react';
import type { FuelType } from '@/lib/types';
import { useDatabase } from '@/hooks/use-database';
import React, { useCallback, useState, useEffect } from 'react';
import Link from 'next/link';
import { TransactionNav } from '@/components/transaction-nav';


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

export default function MachineManagementPage() {
  const { machines, machineReadings, addMachineReading } = useDatabase();
  const { toast } = useToast();
  const [newReadings, setNewReadings] = React.useState<Record<string, string>>({});
  
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
    <div className="bg-muted/30 min-h-screen">
      <PageHeader />
      <TransactionNav />
      <main className="container mx-auto p-4 md:p-8">
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
                  <p className="text-sm text-muted-foreground text-center p-4">No machines configured. Please add them in the <Link href="/settings" className="underline">Settings</Link> page.</p>
              )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
