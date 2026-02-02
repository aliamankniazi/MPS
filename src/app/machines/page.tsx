
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Fuel, Sun } from 'lucide-react';
import type { FuelType } from '@/lib/types';
import { useDatabase } from '@/hooks/use-database';
import React, { useCallback, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { TransactionNav } from '@/components/transaction-nav';
import { startOfDay, endOfDay, isValid } from 'date-fns';
import { DateRangePicker } from '@/components/date-range-picker';


function PageHeader() {
    const [currentTime, setCurrentTime] = useState('');
    
    useEffect(() => {
      const updateClock = () => {
        setCurrentTime(new Date().toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        }));
      };
      updateClock();
      const timer = setInterval(updateClock, 1000);
      return () => clearInterval(timer);
    }, []);

    if (!currentTime) {
      return (
        <header className="bg-background shadow-sm sticky top-0 z-20">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <p className="text-sm font-medium">Loading time...</p>
          </div>
        </header>
      );
    }


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

      const readingTimestamp = dateRange?.to || dateRange?.from || new Date();

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
    if (!isLoaded) return {};

    const { from, to } = dateRange || {};
    const startDate = from ? startOfDay(from) : null;
    const endDate = to ? endOfDay(to) : (from ? endOfDay(from) : null);

    const report: Record<string, {
        dispensed: number;
        startReading: number;
        endReading: number;
        sales: number;
        variance: number;
    }> = {};

    const fuelTypes = [...new Set(machines.map(m => m.fuelType))];

    fuelTypes.forEach(fuelType => {
        // --- Sales Calculation ---
        const filteredTransactions = transactions.filter(tx => {
            if (!startDate || !endDate) return true;
            const txDate = new Date(tx.timestamp);
            return isValid(txDate) && txDate >= startDate && txDate <= endDate;
        });

        const totalSales = filteredTransactions
            .filter(tx => tx.fuelType === fuelType && tx.volume)
            .reduce((sum, tx) => sum + (tx.volume || 0), 0);

        // --- Dispensed Calculation ---
        let totalDispensed = 0;
        let totalStartReading = 0;
        let totalEndReading = 0;

        const machinesForFuelType = machines.filter(m => m.fuelType === fuelType);
        machinesForFuelType.forEach(machine => {
            const readingsForMachine = machineReadings
                .filter(r => r.machineId === machine.id)
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            if (readingsForMachine.length > 0) {
                let startReadingObj, endReadingObj;

                if (startDate && endDate) { // Date range is selected
                    endReadingObj = [...readingsForMachine].reverse().find(r => new Date(r.timestamp) <= endDate);
                    startReadingObj = [...readingsForMachine].reverse().find(r => new Date(r.timestamp) < startDate);
                    
                    if (!startReadingObj) {
                         const firstReadingInPeriod = readingsForMachine.find(r => new Date(r.timestamp) >= startDate);
                         if (endReadingObj && firstReadingInPeriod && endReadingObj.id !== firstReadingInPeriod.id) {
                            startReadingObj = firstReadingInPeriod;
                         } else {
                            startReadingObj = endReadingObj;
                         }
                    }

                } else { // No date range (all time)
                    startReadingObj = readingsForMachine[0];
                    endReadingObj = readingsForMachine[readingsForMachine.length - 1];
                }

                if (startReadingObj && endReadingObj && startReadingObj.id !== endReadingObj.id) {
                    const dispensed = endReadingObj.volume - startReadingObj.volume;
                    totalDispensed += dispensed > 0 ? dispensed : 0;
                }
                
                totalStartReading += startReadingObj?.volume || 0;
                totalEndReading += endReadingObj?.volume || 0;
            }
        });

        const variance = totalDispensed - totalSales;

        report[fuelType] = {
            dispensed: totalDispensed,
            startReading: totalStartReading,
            endReading: totalEndReading,
            sales: totalSales,
            variance: variance,
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
                            <h3 className="text-lg font-semibold mb-2 text-primary">{fuelType}</h3>
                            <div className="space-y-4">
                                {machinesByFuelType[fuelType].map(machine => {
                                    const latestReading = getLatestReading(machine.id);
                                    const newReading = newReadings[machine.id] ? parseFloat(newReadings[machine.id]) : null;
                                    const dispensed = latestReading && newReading !== null && newReading > latestReading.volume ? newReading - latestReading.volume : 0;
                                    return (
                                        <div key={machine.id} className="p-3 border rounded-lg space-y-2">
                                            <h4 className="font-semibold">{machine.name}</h4>
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
