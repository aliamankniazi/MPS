
'use client';

import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Wallet, CreditCard, Smartphone, Calendar as CalendarIcon, Sun, Check, ChevronsUpDown, Mic } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { useDatabase } from '@/hooks/use-database';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import type { PaymentMethod } from '@/lib/types';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { TransactionNav } from '@/components/transaction-nav';
import { useCustomerBalance } from '@/hooks/use-customer-balance';

const customerPaymentSchema = z.object({
  customerId: z.string().min(1, 'Please select a customer.'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  paymentMethod: z.enum(['Cash', 'Card', 'Mobile'], { required_error: 'Please select a payment method.' }),
  notes: z.string().optional(),
  date: z.date({ required_error: "A date is required."}),
});

type CustomerPaymentFormValues = z.infer<typeof customerPaymentSchema>;

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

export default function CustomerPaymentsPage() {
  const { customers, addCustomerPayment, isLoaded, colorSettings } = useDatabase();
  const { toast } = useToast();
  const [customerComboboxOpen, setCustomerComboboxOpen] = useState(false);
  const [paymentDateCalendarOpen, setPaymentDateCalendarOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [language, setLanguage] = useState('en-US');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const { register, handleSubmit, reset, control, setValue, getValues, watch, formState: { errors } } = useForm<CustomerPaymentFormValues>({
    resolver: zodResolver(customerPaymentSchema),
    defaultValues: {
        paymentMethod: 'Cash',
    }
  });

  const selectedCustomerId = watch('customerId');
  const paymentAmount = watch('amount');
  const { balance: customerBalance } = useCustomerBalance(selectedCustomerId);
  const newBalance = useMemo(() => customerBalance - (Number(paymentAmount) || 0), [customerBalance, paymentAmount]);

  useEffect(() => {
    // SpeechRecognition is a browser-only API
    if (typeof window === 'undefined' || !('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = language;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const currentNotes = getValues('notes') || '';
      setValue('notes', currentNotes ? `${currentNotes} ${transcript}` : transcript);
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      toast({
          variant: 'destructive',
          title: 'Voice Error',
          description: `Speech recognition error: ${event.error}`,
      });
      setIsListening(false);
    };
    
    recognition.onend = () => {
        setIsListening(false);
    };

    recognitionRef.current = recognition;

  }, [language, getValues, setValue, toast]);

  const handleToggleListening = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      recognition.start();
      setIsListening(true);
    }
  };

  useEffect(() => {
    const savedDate = localStorage.getItem('global_date_from');
    const initialDate = savedDate && isValid(new Date(savedDate)) ? new Date(savedDate) : new Date();
    
    reset({
        date: initialDate,
        paymentMethod: 'Cash'
    });
  }, [reset]);

  useEffect(() => {
    if (isLoaded) {
      const savedCustomerId = localStorage.getItem('global_lastCustomerId');
      if (savedCustomerId) {
        const customer = customers.find(c => c.id === savedCustomerId);
        if (customer) {
          setValue('customerId', customer.id);
        }
      }
    }
  }, [isLoaded, customers, setValue]);

  const onSubmit: SubmitHandler<CustomerPaymentFormValues> = (data) => {
    const customer = customers.find(c => c.id === data.customerId);
    if (!customer) return;

    const isoDate = data.date.toISOString();
    localStorage.setItem('global_date_from', isoDate);
    localStorage.setItem('global_date_to', isoDate);
    localStorage.setItem('global_lastCustomerId', data.customerId);

    addCustomerPayment({
      customerId: data.customerId,
      customerName: customer.name,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      timestamp: data.date.toISOString(),
      notes: data.notes,
    });
    
    toast({
      title: 'Payment Recorded',
      description: `Payment of PKR ${data.amount} from ${customer.name} has been logged.`,
    });

    reset({
        date: data.date,
        paymentMethod: data.paymentMethod,
        customerId: data.customerId,
        amount: undefined,
        notes: ''
    });
  };

  return (
    <div className="bg-muted/30 min-h-screen">
      <PageHeader />
      <TransactionNav />
      <main className="container mx-auto p-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle style={{ color: colorSettings['Customer Payment'] || '#14B8A6' }}>New Customer Payment</CardTitle>
            <CardDescription>Record a payment received from a customer.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-2">
                <Label>Customer</Label>
                <Controller
                  name="customerId"
                  control={control}
                  render={({ field }) => (
                     <Popover open={customerComboboxOpen} onOpenChange={setCustomerComboboxOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={customerComboboxOpen}
                          className="w-full justify-between"
                        >
                          {field.value
                            ? customers.find((c) => c.id === field.value)?.name
                            : "Select a person..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                        <Command>
                          <CommandInput placeholder="Search person..." />
                          <CommandList>
                            <CommandEmpty>No person found.</CommandEmpty>
                            <CommandGroup>
                              {isLoaded ? customers.map(c => (
                                <CommandItem
                                  key={c.id}
                                  value={c.name}
                                  onSelect={() => {
                                    field.onChange(c.id);
                                    setCustomerComboboxOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      field.value === c.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {c.name}
                                </CommandItem>
                              )) : <CommandItem disabled>Loading...</CommandItem>}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                />
                {errors.customerId && <p className="text-sm text-destructive">{errors.customerId.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount (PKR)</Label>
                <Input id="amount" type="number" {...register('amount')} placeholder="e.g., 5000" step="0.01" />
                {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
              </div>

              <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Controller
                    name="paymentMethod"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Cash"><div className="flex items-center gap-2"><Wallet/>Cash</div></SelectItem>
                          <SelectItem value="Card"><div className="flex items-center gap-2"><CreditCard/>Card</div></SelectItem>
                          <SelectItem value="Mobile"><div className="flex items-center gap-2"><Smartphone/>Mobile</div></SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.paymentMethod && <p className="text-sm text-destructive">{errors.paymentMethod.message}</p>}
                </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <div className="relative">
                  <Textarea id="notes" {...register('notes')} placeholder="e.g., Payment for last week's fuel" className="pr-12"/>
                  {recognitionRef.current && (
                    <Button
                        type="button"
                        size="icon"
                        variant={isListening ? "destructive" : "ghost"}
                        className="absolute right-1 top-1 h-8 w-8"
                        onClick={handleToggleListening}
                        title="Toggle voice input"
                    >
                        <Mic className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {errors.notes && <p className="text-sm text-destructive">{errors.notes.message}</p>}
              </div>
              {recognitionRef.current && (
                <div className="space-y-2">
                      <Label htmlFor="language">Voice Language</Label>
                      <Select value={language} onValueChange={setLanguage}>
                          <SelectTrigger id="language">
                              <SelectValue placeholder="Select language" />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="en-US">English (US)</SelectItem>
                              <SelectItem value="ur-PK">Urdu (Pakistan)</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>
              )}
              
              <div className="space-y-2">
                <Label>Date</Label>
                <Controller
                    name="date"
                    control={control}
                    render={({ field }) => (
                        <Popover open={paymentDateCalendarOpen} onOpenChange={setPaymentDateCalendarOpen}>
                            <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, "dd-MMM-yyyy") : <span>Pick a date</span>}
                            </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                            <Calendar
                                mode="single"
                                selected={field.value}
                                defaultMonth={field.value}
                                onSelect={(date) => {
                                  field.onChange(date);
                                  setPaymentDateCalendarOpen(false);
                                }}
                                initialFocus
                            />
                            </PopoverContent>
                        </Popover>
                    )}
                />
                {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
              </div>
              
                {selectedCustomerId && (
                    <div className="border-t pt-4 mt-4 space-y-1 text-sm">
                        <h4 className="font-semibold mb-2">Customer Account</h4>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Previous Balance</span>
                            <span>{customerBalance.toFixed(2)} PKR</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg">
                            <span>New Account Balance</span>
                            <span className={cn(newBalance < 0 ? "text-green-600" : "text-destructive")}>{newBalance.toFixed(2)} PKR</span>
                        </div>
                    </div>
                )}


              <Button type="submit" className="w-full">Record Payment</Button>
            </form>
          </CardContent>
        </Card>
        </div>
      </main>
    </div>
  );
}

    
