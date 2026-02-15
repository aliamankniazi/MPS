'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Fuel, Sun, List, PlusCircle, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import type { FuelType } from '@/lib/types';
import { useDatabase } from '@/hooks/use-database';
import React, { useCallback, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { TransactionNav } from '@/components/transaction-nav';
import { startOfDay, endOfDay, isValid, format } from 'date-fns';
import { DateRangePicker } from '@/components/date-range-picker';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';


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
  const { machines, machineReadings, addMachineReading, isLoaded, dateRange, setDateRange, transactions } = useDatabase();
  const { toast } = useToast();
  const [newReadings, setNewReadings] = React.useState<Record<string, string>>({});
  
  const handleReadingChange = (machineId: string, value: string) => {
      setNewReadings(prev => ({ ...prev, [machineId]: value }));
  };

  const getAbsoluteLatestReading = useCallback((machineId: string) => {
    if (!machineReadings) return undefined;
    return machineReadings
        .filter(r => r.machineId === machineId && r.timestamp && isValid(new Date(r.timestamp)))
        .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  }, [machineReadings]);
  
  const getLatestReadingForDisplay = useCallback((machineId: string) => {
    if (!machineReadings) return undefined;
    const readingsForMachine = machineReadings.filter(r => r.machineId === machineId && r.timestamp && isValid(new Date(r.timestamp)));
    const sortedReadings = readingsForMachine.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (dateRange?.from) {
        const endDate = endOfDay(dateRange.to || dateRange.from);
        return sortedReadings.find(r => isValid(new Date(r.timestamp)) && new Date(r.timestamp) <= endDate);
    }

    return sortedReadings[0];
  }, [machineReadings, dateRange]);


  const handleSaveReading = (machineId: string) => {
      const machine = machines.find(m => m.id === machineId);
      const newReadingValue = parseFloat(newReadings[machineId]);
      const absoluteLatestReading = getAbsoluteLatestReading(machineId);
      
      if (!machine || isNaN(newReadingValue)) {
          toast({ variant: 'destructive', title: 'Invalid input', description: 'Please enter a valid number for the reading.' });
          return;
      }

      if (absoluteLatestReading && newReadingValue < absoluteLatestReading.volume) {
           toast({ variant: 'destructive', title: 'Invalid Reading', description: 'New reading cannot be less than the absolute latest reading.' });
          return;
      }

      const readingTimestamp = dateRange?.to || dateRange?.from || new Date();
      localStorage.setItem('global_lastTransactionDate', readingTimestamp.toISOString());

      addMachineReading({
          machineId: machine.id,
          machineName: machine.name,
          fuelType: machine.fuelType,
          volume: newReadingValue,
          timestamp: readingTimestamp.toISOString(),
      });

      toast({ title: 'Reading Updated', description: `New reading for ${machine.name} saved.` });
      
      setNewReadings(prev => ({ ...prev, [machineId]: '' }));
  };

  const fuelReportByFuelType = useMemo(() => {
    if (!isLoaded || !machines.length || !dateRange?.from) return {};

    const startDate = startOfDay(dateRange.from);
    const endDate = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);


    const report: Record<string, {
        dispensed: number;
        startReading: number;
        endReading: number;
        sales: number;
        variance: number;
    }> = {};
    
    const filteredTransactions = transactions.filter(tx => {
        if (!tx.timestamp || !isValid(new Date(tx.timestamp))) return false;
        const txDate = new Date(tx.timestamp);
        return txDate >= startDate && txDate <= endDate;
    });

    const fuelTypes = [...new Set(machines.map(m => m.fuelType))];

    fuelTypes.forEach(fuelType => {
        const totalSales = filteredTransactions
            .filter(tx => tx.fuelType === fuelType && tx.volume)
            .reduce((sum, tx) => sum + (tx.volume || 0), 0);

        let totalDispensed = 0;
        let totalStartReadingValue = 0;
        let totalEndReadingValue = 0;

        const machinesForFuelType = machines.filter(m => m.fuelType === fuelType);

        machinesForFuelType.forEach(machine => {
            const readingsForMachine = machineReadings
                .filter(r => r.machineId === machine.id && r.timestamp && isValid(new Date(r.timestamp)))
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            if (readingsForMachine.length < 1) return;

            const latestReadingInOrBeforePeriod = [...readingsForMachine].reverse().find(r => new Date(r.timestamp) <= endDate);
            if (!latestReadingInOrBeforePeriod) return;

            let dispensedForMachine = 0;
            let startReadingForDisplay: number | undefined;
            let endReadingForDisplay: number | undefined = latestReadingInOrBeforePeriod.volume;

            const readingBeforePeriod = [...readingsForMachine].reverse().find(r => new Date(r.timestamp) < startDate);

            if (readingBeforePeriod) {
                // Case 1: We have a reading from a prior day.
                startReadingForDisplay = readingBeforePeriod.volume;
                dispensedForMachine = latestReadingInOrBeforePeriod.volume - readingBeforePeriod.volume;
            } else {
                // Case 2: No prior reading. Calculate dispensed within the period.
                const readingsWithinPeriod = readingsForMachine.filter(r => {
                    const d = new Date(r.timestamp);
                    return d >= startDate && d <= endDate;
                });
                
                if (readingsWithinPeriod.length > 1) {
                    const firstInPeriod = readingsWithinPeriod[0];
                    const lastInPeriod = readingsWithinPeriod[readingsWithinPeriod.length - 1];
                    startReadingForDisplay = firstInPeriod.volume;
                    dispensedForMachine = lastInPeriod.volume - firstInPeriod.volume;
                } else if (readingsWithinPeriod.length === 1) {
                    // Only one reading in the period, and none before. Dispensed is 0.
                    startReadingForDisplay = readingsWithinPeriod[0].volume;
                }
            }

            if (dispensedForMachine > 0) {
                totalDispensed += dispensedForMachine;
            }

            totalStartReadingValue += startReadingForDisplay || 0;
            totalEndReadingValue += endReadingForDisplay || 0;
        });

        report[fuelType] = {
            dispensed: totalDispensed,
            startReading: totalStartReadingValue,
            endReading: totalEndReadingValue,
            sales: totalSales,
            variance: totalDispensed - totalSales,
        };
    });

    return report;

  }, [machines, machineReadings, transactions, isLoaded, dateRange]);



  const machinesByFuelType = useMemo(() => {
    return machines.reduce((acc, machine) => {
      const fuelTypeKey = machine.fuelType as string;
      if (!acc[fuelTypeKey]) {
        acc[fuelTypeKey] = [];
      }
      acc[fuelTypeKey].push(machine);
      return acc;
    }, {} as Record<string, typeof machines>);
  }, [machines]);

  return (
    <div className="bg-muted/30 min-h-screen">
      <PageHeader />
      <TransactionNav />
      <main className="container mx-auto p-4 md:p-8">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
              <div>
                <CardTitle className="flex items-center gap-2"><Fuel/> Machine Readings & Dispensed Fuel</CardTitle>
                <CardDescription>Update readings to verify dispensed volume against sales.</CardDescription>
              </div>
              <DateRangePicker date={dateRange} onDateChange={setDateRange} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
                {Object.keys(machinesByFuelType).map(fuelType => {
                    const report = fuelReportByFuelType[fuelType];
                    return (
                        <div key={fuelType}>
                            <h3 className={cn("text-lg font-semibold mb-2", 
                                fuelType.toLowerCase().includes('diesel') ? 'text-green-600' :
                                (fuelType.toLowerCase().includes('unleaded') || fuelType.toLowerCase().includes('premium')) ? 'text-destructive' : 'text-primary'
                            )}>{fuelType}</h3>
                            <div className="space-y-4">
                                {machinesByFuelType[fuelType].map(machine => {
                                    const latestReading = getLatestReadingForDisplay(machine.id);
                                    const newReading = newReadings[machine.id] ? parseFloat(newReadings[machine.id]) : null;
                                    const dispensed = latestReading && newReading !== null && newReading > latestReading.volume ? newReading - latestReading.volume : 0;
                                    return (
                                        <div key={machine.id} className="p-3 border rounded-lg space-y-2">
                                            <h4 className={cn("font-semibold",
                                                machine.fuelType.toLowerCase().includes('diesel') && 'text-green-600',
                                                (machine.fuelType.toLowerCase().includes('unleaded') || machine.fuelType.toLowerCase().includes('premium')) && 'text-destructive'
                                            )}>{machine.name}</h4>
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
                                                    <Label className="text-xs">Dispensed (Live)</Label>
                                                    <Input value={dispensed.toFixed(2) + ' Ltr'} readOnly disabled className="font-bold text-green-600" />
                                                </div>
                                                <div>
                                                    <Button onClick={() => handleSaveReading(machine.id)} className="w-full">Save</Button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            {report && (
                                <div className="mt-4 p-3 border-t-2 border-primary grid grid-cols-1 md:grid-cols-5 gap-4 items-center text-right">
                                    <div>
                                        <p className="font-semibold text-muted-foreground text-sm">Total Start Reading</p>
                                        <p className="text-base font-bold">
                                            {report.startReading.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-semibold text-muted-foreground text-sm">Total End Reading</p>
                                        <p className="text-base font-bold">
                                            {report.endReading.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-semibold text-sm">Dispensed Total</p>
                                        <p className="text-lg font-bold text-green-600">
                                            {report.dispensed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ltr
                                        </p>
                                    </div>
                                     <div>
                                        <p className="font-semibold text-sm">Sales Total</p>
                                        <p className="text-lg font-bold text-blue-600">
                                            {report.sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ltr
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-semibold text-sm">Variance</p>
                                        <p className={`text-lg font-bold ${report.variance >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                                            {report.variance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ltr
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
                {machines.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center p-4">No machines configured. Please add them in the <Link href="/settings" className="underline">Settings</Link> page.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
