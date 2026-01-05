

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Fuel, DollarSign, User, CreditCard, Smartphone, Wallet, ScanLine, X, History, Printer } from 'lucide-react';
import { Numpad } from '@/components/numpad';
import type { FuelType, PaymentMethod, Transaction } from '@/lib/types';
import { useFuelPrices } from '@/hooks/use-fuel-prices';
import { useCustomers } from '@/hooks/use-customers';
import { useCustomerBalance } from '@/hooks/use-customer-balance';
import { useTransactions } from '@/hooks/use-transactions';
import { useCustomerPayments } from '@/hooks/use-customer-payments';
import { useBankAccounts } from '@/hooks/use-bank-accounts';
import Link from 'next/link';

const transactionSchema = z.object({
  fuelType: z.enum(['Unleaded', 'Premium', 'Diesel'], { required_error: 'Fuel type is required' }),
  transactionType: z.enum(['amount', 'volume']),
  value: z.coerce.number().positive('Value must be a positive number'),
  paymentMethod: z.enum(['Cash', 'Card', 'Mobile'], { required_error: 'Payment method is required' }),
  customerId: z.string().optional(),
  bankAccountId: z.string().optional(),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

export default function SalesPage() {
  const { fuelPrices, isLoaded: pricesLoaded } = useFuelPrices();
  const { customers, isLoaded: customersLoaded } = useCustomers();
  const { addTransaction, transactions } = useTransactions();
  const { addCustomerPayment } = useCustomerPayments();
  const { bankAccounts, isLoaded: banksLoaded } = useBankAccounts();
  
  const [activeInput, setActiveInput] = useState<'value' | 'customerId'>('value');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const { toast } = useToast();

  const { register, handleSubmit, control, watch, setValue, reset, formState: { errors } } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      fuelType: 'Unleaded',
      transactionType: 'amount',
      value: 0,
      paymentMethod: 'Cash',
    },
  });

  const { fuelType, transactionType, value, customerId, paymentMethod } = watch();
  
  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === customerId);
  }, [customerId, customers]);

  const { balance: customerBalance } = useCustomerBalance(customerId || null);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    return customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.contact && c.contact.includes(customerSearch)));
  }, [customers, customerSearch]);

  const pricePerLitre = useMemo(() => fuelPrices[fuelType] || 0, [fuelType, fuelPrices]);

  const { totalAmount, totalVolume } = useMemo(() => {
    const numericValue = Number(value) || 0;
    if (transactionType === 'amount') {
      const amount = numericValue;
      const volume = pricePerLitre > 0 ? amount / pricePerLitre : 0;
      return { totalAmount: amount, totalVolume: volume };
    } else { // volume
      const volume = numericValue;
      const amount = volume * pricePerLitre;
      return { totalAmount: amount, totalVolume: volume };
    }
  }, [value, transactionType, pricePerLitre]);
  
  const recentTransactions = useMemo(() => {
    return [...transactions].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5);
  }, [transactions]);


  const handleNumpadKeyPress = useCallback((key: string) => {
    if (activeInput === 'value') {
      const currentValue = value.toString();
      if (key === '.' && currentValue.includes('.')) return;
      setValue('value', Number(currentValue + key), { shouldValidate: true });
    }
  }, [activeInput, value, setValue]);

  const handleClear = useCallback(() => {
    if (activeInput === 'value') {
      setValue('value', 0, { shouldValidate: true });
    }
  }, [activeInput, setValue]);

  const onSubmit: SubmitHandler<TransactionFormValues> = (data) => {
    if (totalAmount <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Transaction',
        description: 'Total amount must be greater than zero.',
      });
      return;
    }
    
    const transactionData: Omit<Transaction, 'id'> = {
      fuelType: data.fuelType,
      volume: totalVolume,
      pricePerLitre: pricePerLitre,
      totalAmount: totalAmount,
      paymentMethod: data.paymentMethod,
      timestamp: new Date().toISOString(),
      customerId: data.customerId,
      customerName: selectedCustomer?.name,
      bankAccountId: data.bankAccountId,
      bankAccountName: data.paymentMethod === 'Card' ? bankAccounts.find(b => b.id === data.bankAccountId)?.bankName : undefined,
    };

    addTransaction(transactionData);
    
    // If it was a cash sale for a credit customer, log it as a payment against their balance.
    if (data.customerId && (data.paymentMethod === 'Cash' || data.paymentMethod === 'Card' || data.paymentMethod === 'Mobile')) {
        addCustomerPayment({
            customerId: data.customerId,
            customerName: selectedCustomer!.name,
            amount: totalAmount,
            paymentMethod: data.paymentMethod,
            timestamp: new Date().toISOString(),
        });
    }

    toast({
      title: 'Transaction Complete',
      description: `Sale of ${totalVolume.toFixed(2)}L of ${data.fuelType} for PKR ${totalAmount.toFixed(2)} recorded.`,
    });
    
    reset({
      fuelType: 'Unleaded',
      transactionType: 'amount',
      value: 0,
      paymentMethod: 'Cash',
      customerId: undefined,
      bankAccountId: undefined,
    });
  };

  if (showCustomerList) {
    return (
      <div className="p-4 md:p-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Select a Customer</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowCustomerList(false)}><X /></Button>
            </div>
            <Input 
              placeholder="Search customers..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="mt-4"
            />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
              {customersLoaded ? filteredCustomers.map(c => (
                <Button key={c.id} variant="outline" className="justify-start h-auto py-3" onClick={() => {
                  setValue('customerId', c.id);
                  setShowCustomerList(false);
                }}>
                  <div>
                    <p className="font-semibold text-base">{c.name}</p>
                    <p className="text-muted-foreground text-sm">{c.contact}</p>
                  </div>
                </Button>
              )) : <p>Loading customers...</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8 p-4 md:p-8">
      <div className="lg:col-span-2 space-y-4 md:space-y-8">
        <Card>
            <CardHeader>
                <CardTitle>Fuel Type</CardTitle>
            </CardHeader>
            <CardContent>
                 <Controller
                    name="fuelType"
                    control={control}
                    render={({ field }) => (
                        <RadioGroup
                            value={field.value}
                            onValueChange={field.onChange}
                            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
                        >
                            {(['Unleaded', 'Premium', 'Diesel'] as FuelType[]).map(type => (
                                <Label key={type} htmlFor={type} className={`relative flex flex-col items-center justify-center rounded-md border-2 p-4 font-bold text-lg hover:bg-accent focus:outline-none ${field.value === type ? 'border-primary' : ''}`}>
                                    <RadioGroupItem value={type} id={type} className="sr-only" />
                                    <Fuel className="mb-3 h-8 w-8" />
                                    {type}
                                    <p className="font-normal text-sm text-muted-foreground">PKR {fuelPrices[type]}/L</p>
                                </Label>
                            ))}
                        </RadioGroup>
                    )}
                 />
            </CardContent>
        </Card>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 md:space-y-8">
            <div className="grid md:grid-cols-2 gap-4 md:gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Transaction Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Controller
                            name="transactionType"
                            control={control}
                            render={({ field }) => (
                                <RadioGroup 
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    className="flex items-center space-x-4 mb-4"
                                >
                                    <Label htmlFor="type-amount" className="flex items-center gap-2 cursor-pointer">
                                        <RadioGroupItem value="amount" id="type-amount"/>Amount (PKR)
                                    </Label>
                                    <Label htmlFor="type-volume" className="flex items-center gap-2 cursor-pointer">
                                        <RadioGroupItem value="volume" id="type-volume"/>Volume (L)
                                    </Label>
                                </RadioGroup>
                            )}
                        />
                        <div className="relative">
                             <Input
                                {...register('value')}
                                className="h-20 text-5xl font-bold text-right pr-16"
                                onFocus={() => setActiveInput('value')}
                            />
                             <span className="absolute right-6 top-1/2 -translate-y-1/2 text-2xl text-muted-foreground font-semibold">
                                {transactionType === 'amount' ? 'PKR' : 'L'}
                            </span>
                        </div>
                        {errors.value && <p className="text-sm text-destructive mt-2">{errors.value.message}</p>}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="flex items-baseline justify-between border-b pb-2">
                             <p className="text-muted-foreground">Total Volume</p>
                             <p className="text-2xl font-bold">{totalVolume.toFixed(3)} <span className="text-base font-normal text-muted-foreground">L</span></p>
                         </div>
                         <div className="flex items-baseline justify-between">
                             <p className="text-muted-foreground">Total Amount</p>
                             <p className="text-2xl font-bold">{totalAmount.toFixed(2)} <span className="text-base font-normal text-muted-foreground">PKR</span></p>
                         </div>
                    </CardContent>
                </Card>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>Payment & Customer</CardTitle>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-8">
                     <div>
                        <Label className="mb-4 block">Payment Method</Label>
                        <Controller
                            name="paymentMethod"
                            control={control}
                            render={({ field }) => (
                                <RadioGroup
                                    value={field.value}
                                    onValueChange={(value) => {
                                      field.onChange(value as PaymentMethod);
                                      if(value !== 'Card') setValue('bankAccountId', undefined);
                                    }}
                                    className="flex items-center space-x-2"
                                >
                                    <Label htmlFor="pay-cash" className="flex flex-col items-center justify-center gap-2 rounded-md border-2 p-4 flex-1 hover:bg-accent cursor-pointer data-[state=checked]:border-primary" data-state={field.value === 'Cash' ? 'checked' : 'unchecked'}>
                                        <RadioGroupItem value="Cash" id="pay-cash" className="sr-only" />
                                        <Wallet className="w-8 h-8" />
                                        <span>Cash</span>
                                    </Label>
                                    <Label htmlFor="pay-card" className="flex flex-col items-center justify-center gap-2 rounded-md border-2 p-4 flex-1 hover:bg-accent cursor-pointer data-[state=checked]:border-primary" data-state={field.value === 'Card' ? 'checked' : 'unchecked'}>
                                        <RadioGroupItem value="Card" id="pay-card" className="sr-only" />
                                        <CreditCard className="w-8 h-8" />
                                        <span>Card</span>
                                    </Label>
                                    <Label htmlFor="pay-mobile" className="flex flex-col items-center justify-center gap-2 rounded-md border-2 p-4 flex-1 hover:bg-accent cursor-pointer data-[state=checked]:border-primary" data-state={field.value === 'Mobile' ? 'checked' : 'unchecked'}>
                                        <RadioGroupItem value="Mobile" id="pay-mobile" className="sr-only" />
                                        <Smartphone className="w-8 h-8" />
                                        <span>Mobile</span>
                                    </Label>
                                </RadioGroup>
                            )}
                        />
                        {paymentMethod === 'Card' && (
                             <div className="mt-4 space-y-2">
                                <Label htmlFor="bank-account">Bank Account</Label>
                                <Controller
                                  name="bankAccountId"
                                  control={control}
                                  render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value}>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select a bank account" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {banksLoaded ? bankAccounts.map(b => (
                                          <SelectItem key={b.id} value={b.id}>{b.bankName} - (...{b.accountNumber.slice(-4)})</SelectItem>
                                        )) : <SelectItem value="loading" disabled>Loading...</SelectItem>}
                                      </SelectContent>
                                    </Select>
                                  )}
                                />
                             </div>
                        )}
                     </div>
                     <div className="space-y-4">
                         <div className="flex justify-between items-center">
                            <Label>Customer (Optional)</Label>
                            <Button variant="outline" size="sm" onClick={() => setShowCustomerList(true)}>
                                <ScanLine className="mr-2 h-4 w-4" /> Select Customer
                            </Button>
                         </div>
                        {selectedCustomer ? (
                            <Card className="p-4">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="font-semibold">{selectedCustomer.name}</p>
                                        <p className="text-sm text-muted-foreground">{selectedCustomer.contact}</p>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setValue('customerId', undefined)}><X className="h-4 w-4"/></Button>
                                </div>
                                <div className="border-t mt-2 pt-2">
                                    <p className="text-sm text-muted-foreground">Current Balance</p>
                                    <p className={`font-semibold ${customerBalance > 0 ? 'text-destructive' : 'text-green-600'}`}>{customerBalance.toLocaleString(undefined, {style: 'currency', currency: 'PKR'})}</p>
                                </div>
                            </Card>
                        ) : (
                             <div className="flex items-center justify-center h-24 border-2 border-dashed rounded-md">
                                <p className="text-muted-foreground">No customer selected</p>
                            </div>
                        )}
                     </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                    <Button size="lg" type="submit" disabled={totalAmount <= 0}>Complete Transaction</Button>
                </CardFooter>
            </Card>
        </form>
      </div>

      <div className="space-y-4 md:space-y-8">
        <Card>
            <CardHeader>
                <CardTitle>Numpad</CardTitle>
            </CardHeader>
            <CardContent>
                <Numpad onKeyPress={(key) => {
                  if (key === 'C') {
                    handleClear();
                  } else {
                    handleNumpadKeyPress(key);
                  }
                }}/>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><History/> Recent Sales</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    {recentTransactions.length > 0 ? recentTransactions.map(tx => (
                        <div key={tx.id} className="flex items-center justify-between border-b pb-2">
                            <div>
                                <p className="font-semibold">{tx.customerName || 'Walk-in'}</p>
                                <p className="text-sm text-muted-foreground">{tx.volume.toFixed(2)}L {tx.fuelType}</p>
                            </div>
                             <div className="text-right">
                                <p className="font-semibold">PKR {tx.totalAmount.toFixed(2)}</p>
                                <Button asChild variant="link" size="sm" className="p-0 h-auto">
                                    <Link href={`/invoice/sale/${tx.id}`} target="_blank"><Printer className="w-3 h-3 mr-1" />Print</Link>
                                </Button>
                             </div>
                        </div>
                    )) : (
                        <p className="text-sm text-center text-muted-foreground py-8">No transactions yet.</p>
                    )}
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
