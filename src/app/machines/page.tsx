
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Fuel, Sun, Calendar as CalendarIcon, Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import type { FuelType } from '@/lib/types';
import { useDatabase } from '@/hooks/use-database';
import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { TransactionNav } from '@/components/transaction-nav';
import { startOfDay, endOfDay, isValid, format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { SignedInEmail } from '@/components/signed-in-email';

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
                <SignedInEmail />
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
  const [newReadings, setNewReadings] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  
  // Ref to manage keyboard navigation focus
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const selectedDate = useMemo(() => dateRange?.from || new Date(), [dateRange]);

  const handleReadingChange = (machineId: string, value: string) => {
      setNewReadings(prev => ({ ...prev, [machineId]: value }));
  };

  const getAbsoluteLatestReadingBefore = useCallback((machineId: string, date: Date) => {
    if (!machineReadings) return undefined;
    return machineReadings
        .filter(r => r.machineId === machineId && r.timestamp && isValid(new Date(r.timestamp)) && new Date(r.timestamp) < startOfDay(date))
        .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  }, [machineReadings]);

  const getReadingOnDate = useCallback((machineId: string, date: Date) => {
    if (!machineReadings) return undefined;
    return machineReadings.find(r => r.machineId === machineId && isValid(new Date(r.timestamp)) && format(new Date(r.timestamp), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd'));
  }, [machineReadings]);

  const handleSaveReading = async (machineId: string) => {
      const machine = machines.find(m => m.id === machineId);
      const valString = newReadings[machineId];
      const newReadingValue = parseFloat(valString);
      
      if (!machine || isNaN(newReadingValue)) return;

      const previousReading = getAbsoluteLatestReadingBefore(machineId, selectedDate);
      if (previousReading && newReadingValue < previousReading.volume) {
          toast({ 
              variant: 'destructive', 
              title: 'Invalid Reading', 
              description: `New reading for ${machine.name} cannot be less than the previous reading (${previousReading.volume}).` 
          });
          return;
      }

      setSavingId(machineId);
      try {
          const timestamp = endOfDay(selectedDate).toISOString();
          await addMachineReading({
              machineId: machine.id,
              machineName: machine.name,
              fuelType: machine.fuelType,
              volume: newReadingValue,
              timestamp,
          });

          toast({ title: 'Saved', description: `${machine.name} reading updated.` });
          setNewReadings(prev => ({ ...prev, [machineId]: '' }));
      } finally {
          setSavingId(null);
      }
  };

  const sortedMachines = useMemo(() => [...machines].sort((a,b) => a.name.localeCompare(b.name)), [machines]);

  const handleKeyDown = (e: React.KeyboardEvent, machineId: string, currentIndex: number) => {
      if (e.key === 'Enter') {
          e.preventDefault();
          handleSaveReading(machineId);
          
          // Move focus to next machine input
          const nextMachine = sortedMachines[currentIndex + 1];
          if (nextMachine) {
              inputRefs.current[nextMachine.id]?.focus();
          }
      }
  };

  const fuelReportByFuelType = useMemo(() => {
    if (!isLoaded || !machines.length) return {};

    const startDate = startOfDay(selectedDate);
    const endDate = endOfDay(selectedDate);

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
        let totalDispensed = 0;
        let totalStartReadingValue = 0;
        let totalEndReadingValue = 0;

        const machinesForFuelType = machines.filter(m => m.fuelType === fuelType);

        machinesForFuelType.forEach(machine => {
            const closingReading = getReadingOnDate(machine.id, selectedDate);
            const openingReading = getAbsoluteLatestReadingBefore(machine.id, selectedDate);
            
            let startVal = openingReading?.volume || 0;
            let endVal = closingReading?.volume || startVal;
            let dispensed = endVal - startVal;

            if (dispensed > 0) totalDispensed += dispensed;
            totalStartReadingValue += startVal;
            totalEndReadingValue += endVal;
        });

        const totalSales = filteredTransactions
            .filter(tx => tx.fuelType === fuelType && tx.volume)
            .reduce((sum, tx) => sum + (tx.volume || 0), 0);

        report[fuelType] = {
            dispensed: totalDispensed,
            startReading: totalStartReadingValue,
            endReading: totalEndReadingValue,
            sales: totalSales,
            variance: totalDispensed - totalSales,
        };
    });

    return report;
  }, [machines, machineReadings, transactions, isLoaded, selectedDate, getReadingOnDate, getAbsoluteLatestReadingBefore]);

  const machinesByFuelType = useMemo(() => {
    return sortedMachines.reduce((acc, machine) => {
      const fuelTypeKey = machine.fuelType as string;
      if (!acc[fuelTypeKey]) acc[fuelTypeKey] = [];
      acc[fuelTypeKey].push(machine);
      return acc;
    }, {} as Record<string, typeof machines>);
  }, [sortedMachines]);

  return (
    <div className="bg-muted/30 min-h-screen">
      <PageHeader />
      <TransactionNav />
      <main className="container mx-auto p-4 md:p-8">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
              <div>
                <CardTitle className="flex items-center gap-2"><Fuel/> Machine Readings</CardTitle>
                <CardDescription>Enter closing readings for the day. Press <strong>Enter</strong> to save and move to next field.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Select Date:</Label>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="w-[200px] justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {format(selectedDate, "dd-MMM-yyyy")}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                        <Calendar 
                            mode="single" 
                            selected={selectedDate} 
                            onSelect={(d) => d && setDateRange({ from: d, to: d })} 
                            initialFocus 
                        />
                    </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
                {Object.keys(machinesByFuelType).map(fuelType => {
                    const report = fuelReportByFuelType[fuelType];
                    return (
                        <div key={fuelType} className="space-y-4">
                            <div className="flex items-center gap-2 border-b pb-2">
                                <div className={cn("w-2 h-6 rounded", 
                                    fuelType.toLowerCase().includes('diesel') ? 'bg-green-600' : 'bg-destructive'
                                )} />
                                <h3 className="text-xl font-bold uppercase tracking-tight">{fuelType}</h3>
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                                {machinesByFuelType[fuelType].map((machine, idx) => {
                                    const machineIndex = sortedMachines.findIndex(m => m.id === machine.id);
                                    const latestReading = getReadingOnDate(machine.id, selectedDate);
                                    const previousReading = getAbsoluteLatestReadingBefore(machine.id, selectedDate);
                                    const currentInput = newReadings[machine.id];
                                    const previewValue = currentInput ? parseFloat(currentInput) : (latestReading?.volume || null);
                                    const dispensed = (previewValue !== null && previousReading) ? previewValue - previousReading.volume : 0;
                                    
                                    return (
                                        <div key={machine.id} className="group relative bg-card p-4 rounded-xl border shadow-sm hover:border-primary/50 transition-all">
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Unit Name</Label>
                                                    <p className="font-semibold text-foreground leading-tight">{machine.name}</p>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Opening Reading</Label>
                                                    <p className="font-mono text-lg">{previousReading ? previousReading.volume.toLocaleString() : '0.00'}</p>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-bold text-primary uppercase tracking-wider">Closing Reading</Label>
                                                    <div className="relative">
                                                        <Input 
                                                            ref={el => { inputRefs.current[machine.id] = el; }}
                                                            type="number"
                                                            step="any"
                                                            value={newReadings[machine.id] !== undefined ? newReadings[machine.id] : (latestReading?.volume || '')}
                                                            onChange={(e) => handleReadingChange(machine.id, e.target.value)}
                                                            onKeyDown={(e) => handleKeyDown(e, machine.id, machineIndex)}
                                                            placeholder="0.00"
                                                            className="font-mono text-lg h-11 border-primary/20 focus:border-primary focus:ring-primary/20"
                                                        />
                                                        {savingId === machine.id && (
                                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Dispensed (Ltr)</Label>
                                                    <div className={cn(
                                                        "text-2xl font-bold font-mono tracking-tighter",
                                                        dispensed > 0 ? "text-green-600" : "text-muted-foreground/30"
                                                    )}>
                                                        {dispensed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            {report && (
                                <Card className="bg-muted/40 border-dashed">
                                    <CardContent className="p-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-center md:text-right">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Start Readings</p>
                                            <p className="text-sm font-mono font-bold">{report.startReading.toLocaleString()}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">End Readings</p>
                                            <p className="text-sm font-mono font-bold">{report.endReading.toLocaleString()}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest">Dispensed Total</p>
                                            <p className="text-lg font-mono font-black text-green-600">{report.dispensed.toLocaleString()} L</p>
                                        </div>
                                         <div className="space-y-1 border-l pl-4">
                                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Invoiced Sales</p>
                                            <p className="text-lg font-mono font-black text-blue-600">{report.sales.toLocaleString()} L</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Variance</p>
                                            <p className={cn(
                                                "text-lg font-mono font-black",
                                                report.variance > 0.01 ? "text-green-600" : report.variance < -0.01 ? "text-destructive" : "text-muted-foreground"
                                            )}>
                                                {report.variance.toLocaleString()} L
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    )
                })}
                {machines.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
                      <Fuel className="w-16 h-16 opacity-20 mb-4" />
                      <p>No machines configured. Please add them in Settings.</p>
                  </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
