
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Sun, Truck, Undo } from 'lucide-react';
import type { PaymentMethod, Transaction } from '@/lib/types';
import { useCustomerBalance } from '@/hooks/use-customer-balance';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { DollarSign, Redo, ShoppingCart, User, Wallet, Undo2 } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';

const saleItemSchema = z.object({
  product: z.string().min(1, "Product is required"),
  unit: z.string().min(1, "Unit is required"),
  quantity: z.coerce.number().min(0.01, "Quantity must be positive"),
  price: z.coerce.number().min(0, "Price cannot be negative"),
  totalAmount: z.coerce.number().min(0.01, "Total must be positive"),
});

type SaleItemFormValues = z.infer<typeof saleItemSchema>;

const transactionSchema = z.object({
  customerId: z.string().optional(),
  paymentMethod: z.string().optional(),
  invoiceDate: z.string().optional(),
  notes: z.string().optional(),
  paidAmount: z.coerce.number().min(0),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;


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


function TransactionNav() {
    const pathname = usePathname();
    const navItems = [
      { href: '/', label: 'Sale', icon: ShoppingCart },
      { href: '/customer-payments', label: 'Customer Payment', icon: Wallet },
      { href: '/sale-returns', label: 'Sale Return', icon: Undo },
      { href: '/purchases', label: 'Purchase', icon: Truck },
      { href: '/supplier-payments', label: 'Supplier Payment', icon: Redo },
      { href: '/purchase-returns', label: 'Purchase Return', icon: Undo2 },
      { href: '/cash-advances', label: 'Cash Advance', icon: DollarSign },
      { href: '/employees', label: 'Salary Payment', icon: User },
    ];
    return (
        <nav className="bg-background shadow-sm">
            <div className="container mx-auto px-4 flex items-center space-x-1 overflow-x-auto">
                {navItems.map(item => (
                    <Button
                        asChild
                        key={item.href}
                        variant="ghost"
                        className={cn(
                            "border-b-2 rounded-none flex-shrink-0",
                            pathname === item.href ? "border-primary text-primary" : "border-transparent"
                        )}
                    >
                        <Link href={item.href}><item.icon className="mr-2"/> {item.label}</Link>
                    </Button>
                ))}
            </div>
        </nav>
    );
}


export default function SalesPage() {
  const { customers, addTransaction, addCustomerPayment, isLoaded: customersLoaded } = useDatabase();
  
  const [cart, setCart] = useState<SaleItemFormValues[]>([]);
  const { toast } = useToast();

  const { register: registerItem, handleSubmit: handleItemSubmit, watch: watchItem, setValue: setItemValue, reset: resetItem, formState: { errors: itemErrors } } = useForm<SaleItemFormValues>({
    resolver: zodResolver(saleItemSchema),
  });

  const { register, handleSubmit, control, watch, setValue, reset, formState: { errors } } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      paidAmount: 0,
    }
  });

  const { customerId, paidAmount } = watch();
  const { quantity, price } = watchItem();

  useEffect(() => {
    const total = (quantity || 0) * (price || 0);
    setItemValue('totalAmount', total);
  }, [quantity, price, setItemValue]);

  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === customerId);
  }, [customerId, customers]);

  const { balance: customerBalance } = useCustomerBalance(customerId || null);

  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => total + item.totalAmount, 0);
  }, [cart]);

  const invoiceBalance = useMemo(() => {
    return cartTotal - (paidAmount || 0);
  }, [cartTotal, paidAmount]);
  
  const newAccountBalance = useMemo(() => {
    return customerBalance + invoiceBalance;
  }, [customerBalance, invoiceBalance]);


  const onAddItemToCart: SubmitHandler<SaleItemFormValues> = (data) => {
    setCart(currentCart => [...currentCart, data]);
    resetItem();
  };

  const onSubmit: SubmitHandler<TransactionFormValues> = (data) => {
    if (cart.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Empty Cart',
        description: 'Please add at least one item to the cart.',
      });
      return;
    }
    
    // For simplicity, we'll create a single transaction representing the whole cart.
    // A more complex system might save each cart item individually.
    const transactionData: Omit<Transaction, 'id' | 'timestamp'> = {
      fuelType: cart.map(i => i.product).join(', '),
      volume: cart.reduce((sum, item) => sum + item.quantity, 0),
      pricePerLitre: 1, // Placeholder
      product: cart.length === 1 ? cart[0].product : `${cart.length} items`,
      totalAmount: cartTotal,
      paymentMethod: (data.paymentMethod as PaymentMethod) || 'Cash',
      customerId: data.customerId,
      customerName: selectedCustomer?.name,
    };

    addTransaction(transactionData);
    
    if (data.customerId && data.paidAmount > 0) {
        addCustomerPayment({
            customerId: data.customerId,
            customerName: selectedCustomer!.name,
            amount: data.paidAmount,
            paymentMethod: (data.paymentMethod as PaymentMethod) || 'Cash',
        });
    }

    toast({
      title: 'Sale Complete',
      description: `Sale of PKR ${cartTotal.toFixed(2)} recorded.`,
    });
    
    reset();
    setCart([]);
  };

  return (
    <div className="bg-muted/30 min-h-screen">
      <PageHeader />
      <TransactionNav />
      <main className="container mx-auto p-4 grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
              <Card>
                  <CardHeader>
                      <CardTitle>Add Items to Sale</CardTitle>
                  </CardHeader>
                  <CardContent>
                      <form onSubmit={handleItemSubmit(onAddItemToCart)} className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                              <div className="md:col-span-2 space-y-2">
                                  <Label htmlFor="product">Product</Label>
                                  <Input id="product" {...registerItem('product')} placeholder="Select a product..."/>
                                  {itemErrors.product && <p className="text-sm text-destructive">{itemErrors.product.message}</p>}
                              </div>
                              <div className="space-y-2">
                                  <Label htmlFor="unit">Unit</Label>
                                  <Input id="unit" {...registerItem('unit')} placeholder="e.g., Ltr, Kg, Pcs" />
                                   {itemErrors.unit && <p className="text-sm text-destructive">{itemErrors.unit.message}</p>}
                              </div>
                               <div className="space-y-2">
                                  <Label htmlFor="quantity">Quantity</Label>
                                  <Input id="quantity" type="number" {...registerItem('quantity')} step="0.01" />
                                  {itemErrors.quantity && <p className="text-sm text-destructive">{itemErrors.quantity.message}</p>}
                              </div>
                               <div className="space-y-2">
                                  <Label htmlFor="price">Price</Label>
                                  <Input id="price" type="number" {...registerItem('price')} step="0.01" />
                                   {itemErrors.price && <p className="text-sm text-destructive">{itemErrors.price.message}</p>}
                              </div>
                          </div>
                           <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                              <div className="md:col-span-2 space-y-2">
                                  <Label htmlFor="totalAmount">Total Amount</Label>
                                  <Input id="totalAmount" type="number" {...registerItem('totalAmount')} readOnly className="bg-muted/50 font-bold" />
                              </div>
                               <div className="md:col-span-1 flex items-end">
                                  <Button type="submit" className="w-full">Add to Cart</Button>
                              </div>
                          </div>
                      </form>
                  </CardContent>
              </Card>

              <Card>
                  <CardHeader>
                      <CardTitle>Current Cart</CardTitle>
                      <CardDescription>Items to be included in the sale.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <div className="border rounded-md">
                          <Table>
                              <TableHeader>
                                  <TableRow>
                                      <TableHead>Item</TableHead>
                                      <TableHead className="text-right">Qty</TableHead>
                                      <TableHead className="text-right">Price</TableHead>
                                      <TableHead className="text-right">Total</TableHead>
                                  </TableRow>
                              </TableHeader>
                              <TableBody>
                                  {cart.length > 0 ? cart.map((item, index) => (
                                      <TableRow key={index}>
                                          <TableCell>{item.product}</TableCell>
                                          <TableCell className="text-right">{item.quantity}</TableCell>
                                          <TableCell className="text-right">{item.price.toFixed(2)}</TableCell>
                                          <TableCell className="text-right font-medium">{item.totalAmount.toFixed(2)}</TableCell>
                                      </TableRow>
                                  )) : (
                                      <TableRow>
                                          <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                                              List is empty
                                          </TableCell>
                                      </TableRow>
                                  )}
                              </TableBody>
                          </Table>
                      </div>
                  </CardContent>
              </Card>
          </div>

          <div className="lg:col-span-1">
              <form onSubmit={handleSubmit(onSubmit)}>
              <Card>
                  <CardHeader>
                      <CardTitle>Customer & Payment</CardTitle>
                      <CardDescription>Select customer and finalize payment details.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                      <div className="space-y-2">
                          <Label>Customer</Label>
                          <div className="flex gap-2">
                               <Controller
                                name="customerId"
                                control={control}
                                render={({ field }) => (
                                  <Select onValueChange={field.onChange} value={field.value} defaultValue="">
                                    <SelectTrigger>
                                      <SelectValue placeholder="Walk-in Customer" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="walkin">Walk-in Customer</SelectItem>
                                      {customersLoaded ? customers.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                      )) : <SelectItem value="loading" disabled>Loading...</SelectItem>}
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                              <Button variant="outline" size="icon" asChild><Link href="/customers"><UserPlus/></Link></Button>
                          </div>
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
                                  <SelectItem value="Cash">Cash</SelectItem>
                                  <SelectItem value="Card">Card</SelectItem>
                                  <SelectItem value="Mobile">Mobile Wallet</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                      </div>
                      <div className="space-y-2">
                          <Label>Invoice Date</Label>
                          <Input type="date" {...register('invoiceDate')} defaultValue={new Date().toISOString().split('T')[0]}/>
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="notes">Notes</Label>
                          <Textarea id="notes" {...register('notes')} placeholder="Add any notes for the invoice..."/>
                      </div>
                      <div className="space-y-1 text-sm">
                          <div className="flex justify-between font-semibold text-lg">
                              <span>Total</span>
                              <span>{cartTotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                              <Label htmlFor="paidAmount">Paid Amount</Label>
                              <Input id="paidAmount" type="number" {...register('paidAmount')} className="w-32 h-8 text-right" />
                          </div>
                           <div className="flex justify-between font-bold text-red-500 text-lg">
                              <span>Invoice Balance</span>
                              <span>{invoiceBalance.toFixed(2)}</span>
                          </div>
                      </div>
                      
                      {selectedCustomer && (
                          <div className="border-t pt-4 mt-4 space-y-1 text-sm">
                               <h4 className="font-semibold mb-2">Customer Account</h4>
                               <div className="flex justify-between">
                                  <span className="text-muted-foreground">Previous Balance</span>
                                  <span>{customerBalance.toFixed(2)}</span>
                              </div>
                               <div className="flex justify-between font-bold text-lg">
                                  <span>New Account Balance</span>
                                  <span>{newAccountBalance.toFixed(2)}</span>
                              </div>
                          </div>
                      )}
                  </CardContent>
                  <CardFooter className="flex flex-col gap-2">
                      <Button type="submit" size="lg" className="w-full">Complete & Print Invoice</Button>
                      <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => { reset(); resetItem(); setCart([]); }}>Discard</Button>
                  </CardFooter>
              </Card>
              </form>
          </div>
      </main>
    </div>
  );
}
