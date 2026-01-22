
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
import { DollarSign, ListChecks, WalletCards, Calendar as CalendarIcon, Trash2, AlertTriangle } from 'lucide-react';
import type { OtherIncomeCategory, OtherIncome } from '@/lib/types';
import { format, getDaysInMonth, getYear, getMonth, getDate, isValid } from 'date-fns';
import { useDatabase } from '@/hooks/use-database';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useState, useEffect } from 'react';

const INCOME_CATEGORIES: OtherIncomeCategory[] = ['Service Station', 'Tire Shop', 'Tuck Shop', 'Other'];

const incomeSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  category: z.enum(INCOME_CATEGORIES, { required_error: 'Please select a category.' }),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  date: z.date({ required_error: "A date is required."}),
});

type IncomeFormValues = z.infer<typeof incomeSchema>;

export default function OtherIncomesPage() {
  const { otherIncomes, addOtherIncome, deleteOtherIncome } = useDatabase();
  const { toast } = useToast();
  const [incomeToDelete, setIncomeToDelete] = useState<OtherIncome | null>(null);

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<IncomeFormValues>({
    resolver: zodResolver(incomeSchema),
  });

  useEffect(() => {
    reset({
      date: new Date(),
    });
  }, [reset]);

  const onSubmit: SubmitHandler<IncomeFormValues> = (data) => {
    addOtherIncome({
        ...data,
        timestamp: data.date.toISOString(),
    });
    toast({
      title: 'Income Recorded',
      description: `Income of PKR ${data.amount} for "${data.description}" has been logged.`,
    });
    reset();
  };
  
  const handleDeleteIncome = () => {
    if (!incomeToDelete) return;
    deleteOtherIncome(incomeToDelete.id);
    toast({
      title: 'Income Deleted',
      description: `The income entry for "${incomeToDelete.description}" has been removed.`,
    });
    setIncomeToDelete(null);
  };

  return (
    <>
    <div className="p-4 md:p-8 grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WalletCards /> New Income
            </CardTitle>
            <CardDescription>Record a new source of income.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" {...register('description')} placeholder="e.g., Oil change for customer" />
                {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                 <Controller
                  name="category"
                  control={control}
                  render={({ field }) => (
                     <Select onValueChange={field.onChange} value={field.value} defaultValue="">
                        <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                            {INCOME_CATEGORIES.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                  )}
                />
                {errors.category && <p className="text-sm text-destructive">{errors.category.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount (PKR)</Label>
                <Input id="amount" type="number" {...register('amount')} placeholder="e.g., 1500" step="0.01" />
                {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
              </div>
              
              <div className="space-y-2">
                  <Label>Date</Label>
                  <Controller
                    name="date"
                    control={control}
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
                  {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
                </div>

              <Button type="submit" className="w-full">Record Income</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign /> Income History
            </CardTitle>
            <CardDescription>
              A record of all other business income.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {otherIncomes.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {otherIncomes.map(e => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{format(new Date(e.timestamp), 'dd-MMM-yyyy')}</TableCell>
                        <TableCell>{e.description}</TableCell>
                        <TableCell>{e.category}</TableCell>
                        <TableCell className="text-right">PKR {e.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-center">
                            <Button variant="ghost" size="icon" title="Delete" className="text-destructive hover:text-destructive" onClick={() => setIncomeToDelete(e)}>
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
                <ListChecks className="w-16 h-16" />
                <h3 className="text-xl font-semibold">No Income Recorded</h3>
                <p>Use the form to log your first business income.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    <AlertDialog open={!!incomeToDelete} onOpenChange={(isOpen) => !isOpen && setIncomeToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the income entry for: <br />
              <strong className="font-medium text-foreground">{incomeToDelete?.description}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteIncome} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, delete entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
