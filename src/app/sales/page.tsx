
'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Sun, Check, ChevronsUpDown, Calendar as CalendarIcon } from 'lucide-react';
import type { PaymentMethod, Transaction, Product, Purchase, FuelType } from '@/lib/types';
import { useCustomerBalance } from '@/hooks/use-customer-balance';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useDatabase } from '@/hooks/use-database';
import { format, isValid, startOfDay, endOfDay } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Calendar } from '@/components/ui/calendar';
import { TransactionNav } from '@/components/transaction-nav';

const saleItemSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  productName: z.string().min(1, "Product name is required"),
  unit: z.string().min(1, "Unit is required"),
  quantity: z.coerce.number().min(0.01, "Quantity must be positive"),
  price: z.coerce.number().min(0, "Price cannot be negative"),
  totalAmount: z.coerce.number().min(0.01, "Total must be positive"),
});

type SaleItemFormValues = z.infer<typeof saleItemSchema>;

const transactionSchema = z.object({
  customerId: z.string().optional(),
  paymentMethod: z.string().optional(),
  invoiceDate: z.date({ required_error: "An invoice date is required."}),
  notes: z.string().optional(),
  vehicleNumber: z.string().optional(),
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

export default function SalesPage() {
  const { customers, addTransaction, isLoaded, products, purchases, transactions, colorSettings, machines, machineReadings, addMachineReading, fuelStock } = useDatabase();
  
  const [cart, setCart] = useState<SaleItemFormValues[]>([]);
  const { toast } = useToast();
  const lastUserEditedField = useRef<'quantity' | 'price' | 'totalAmount' | null>(null);

  const [productComboboxOpen, setProductComboboxOpen] = useState(false);
  const [customerComboboxOpen, setCustomerComboboxOpen] = useState(false);
  const [invoiceDateCalendarOpen, setInvoiceDateCalendarOpen] = useState(false);

  const { register: registerItem, handleSubmit: handleItemSubmit, watch: watchItem, setValue: setItemValue, reset: resetItem, control: controlItem, formState: { errors: itemErrors } } = useForm<SaleItemFormValues>({
    resolver: zodResolver(saleItemSchema),
  });

  const { register, handleSubmit, control, watch, setValue, reset, formState: { errors } } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
  });

  useEffect(() => {
    const savedDate = localStorage.getItem('global_lastTransactionDate');
    const initialDate = savedDate && isValid(new Date(savedDate)) ? new Date(savedDate) : new Date();
    reset({
        paymentMethod: 'Cash',
        invoiceDate: initialDate,
        notes: '',
        vehicleNumber: '',
    });
  }, [reset]);

  useEffect(() => {
    if (isLoaded) {
      const savedCustomerId = localStorage.getItem('global_lastCustomerId');
      if (savedCustomerId && customers.find(c => c.id === savedCustomerId)) {
        setValue('customerId', savedCustomerId);
      } else {
        setValue('customerId', 'walkin');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, setValue]);


  const allUnits = useMemo(() => {
    const defaultUnits = ['Ltr', 'Pcs', 'Kg', 'Box', 'Bottle'];
    const unitsFromProducts = products.map(p => p.unit).filter(Boolean);
    const combinedUnits = [...defaultUnits, ...unitsFromProducts].map(u => u.toLowerCase());
    const uniqueUnits = [...new Set(combinedUnits)];
    return uniqueUnits.map(lowerUnit => {
        const originalCasing = unitsFromProducts.find(u => u.toLowerCase() === lowerUnit) || defaultUnits.find(u => u.toLowerCase() === lowerUnit);
        return originalCasing || lowerUnit;
    }).filter(Boolean);
  }, [products]);

  const { customerId } = watch();
  const { productId, quantity, price, totalAmount } = watchItem();

  const selectedProduct = useMemo(() => {
    if (!productId) return null;
    return products.find(p => p.id === productId);
  }, [productId, products]);

  const currentStock = useMemo(() => {
    if (!selectedProduct) return 0;
    return fuelStock[selectedProduct.name as FuelType] || 0;
  }, [selectedProduct, fuelStock]);

  const stockAfterSale = useMemo(() => {
    if (!selectedProduct) return 0;
    const itemQuantity = Number(quantity) || 0;
    const cartQuantity = cart.filter(item => item.productId === selectedProduct.id).reduce((sum, item) => sum + item.quantity, 0);
    return currentStock - cartQuantity - itemQuantity;
  }, [currentStock, quantity, selectedProduct, cart]);


  useEffect(() => {
    const qty = Number(quantity) || 0;
    const prc = Number(price) || 0;
    const total = Number(totalAmount) || 0;

    if (lastUserEditedField.current === 'quantity' || lastUserEditedField.current === 'price') {
      const newTotal = qty * prc;
      if (total !== newTotal) {
        setItemValue('totalAmount', newTotal, { shouldValidate: true });
      }
    } else if (lastUserEditedField.current === 'totalAmount') {
      if (prc > 0) {
        const newQuantity = total / prc;
        if (quantity !== newQuantity) {
          setItemValue('quantity', newQuantity, { shouldValidate: true });
        }
      } else if (qty > 0) {
        const newPrice = total / qty;
        if (price !== newPrice) {
          setItemValue('price', newPrice, { shouldValidate: true });
        }
      }
    }
  }, [quantity, price, totalAmount, setItemValue]);

  const handleProductSelect = useCallback((product: Product) => {
    const lastTransactionForProduct = transactions
        .filter(t => t.product === product.name)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

    const priceToSet = lastTransactionForProduct?.pricePerLitre ?? product.salePrice;

    setItemValue('price', priceToSet);
    setItemValue('unit', product.unit);
    setItemValue('productName', product.name);
  }, [transactions, setItemValue]);

  useEffect(() => {
    if (!customerId || customerId === 'walkin') {
      setValue('paymentMethod', 'Cash');
    } else {
      setValue('paymentMethod', 'Credit');
    }
    setValue('vehicleNumber', ''); // Clear vehicle selection when customer changes
  }, [customerId, setValue]);

  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === customerId);
  }, [customerId, customers]);

  const { balance: customerBalance } = useCustomerBalance(customerId || null);

  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => total + item.totalAmount, 0);
  }, [cart]);

  const invoiceBalance = useMemo(() => {
    return cartTotal;
  }, [cartTotal]);
  
  const newAccountBalance = useMemo(() => {
    return customerBalance + invoiceBalance;
  }, [customerBalance, invoiceBalance]);

  const dispensedTotals = useMemo(() => {
    if (!isLoaded || !machines.length) return {};
    
    const today = new Date();
    const startDate = startOfDay(today);
    const endDate = endOfDay(today);

    const totals: Record<string, number> = {};

    machines.forEach(machine => {
      const allReadingsForMachine = machineReadings
        .filter(r => r.machineId === machine.id)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const endReading = [...allReadingsForMachine]
        .reverse()
        .find(r => new Date(r.timestamp) <= endDate);

      let startReading = [...allReadingsForMachine]
        .reverse()
        .find(r => new Date(r.timestamp) < startDate);

      if (!startReading) {
        // If no reading before the start date, find the first reading on or after the start date
        startReading = allReadingsForMachine.find(r => new Date(r.timestamp) >= startDate);
      }

      if (endReading && startReading && endReading.id !== startReading.id) {
        const dispensed = endReading.volume - startReading.volume;
        if (dispensed > 0) {
          if (!totals[machine.fuelType]) {
            totals[machine.fuelType] = 0;
          }
          totals[machine.fuelType] += dispensed;
        }
      }
    });

    return totals;
  }, [machines, machineReadings, isLoaded]);


  const onAddItemToCart: SubmitHandler<SaleItemFormValues> = (data) => {
    setCart(currentCart => [...currentCart, data]);
    // Reset form for next item
    resetItem({ productId: '', productName: '', unit: '', quantity: undefined, price: undefined, totalAmount: undefined });
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
    
    localStorage.setItem('global_lastTransactionDate', data.invoiceDate.toISOString());
    if (data.customerId) {
        localStorage.setItem('global_lastCustomerId', data.customerId);
    }

    let finalNotes = data.notes || '';
    if (data.vehicleNumber) {
        finalNotes = finalNotes ? `Vehicle: ${data.vehicleNumber}, ${finalNotes}` : `Vehicle: ${data.vehicleNumber}`;
    }
    
    const finalInvoiceDate = data.invoiceDate.toISOString();

    cart.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        let costPrice = 0;
        if (product) {
            if (product.category === 'Main Product') {
                const saleTime = new Date(data.invoiceDate).getTime();
                const latestPurchase = purchases
                    .filter(p => p.fuelType === item.productName && isValid(new Date(p.timestamp)) && new Date(p.timestamp).getTime() <= saleTime)
                    .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                if (latestPurchase && latestPurchase.volume > 0) {
                    const costPerLitre = latestPurchase.totalCost / latestPurchase.volume;
                    costPrice = costPerLitre * item.quantity;
                }
            } else { // Supplementary Product
                costPrice = (product.purchasePrice || 0) * item.quantity;
            }
        }

        const transactionData: Omit<Transaction, 'id' | 'timestamp'> & { timestamp?: string } = {
          fuelType: item.productName,
          volume: item.quantity,
          pricePerLitre: item.price,
          product: item.productName,
          totalAmount: item.totalAmount,
          costPrice: costPrice,
          paymentMethod: (data.paymentMethod as PaymentMethod) || 'Cash',
          customerId: data.customerId,
          customerName: selectedCustomer?.name || 'Walk-in Customer',
          notes: finalNotes,
          timestamp: finalInvoiceDate,
        };
        addTransaction(transactionData);
    });

    toast({
      title: 'Sale Complete',
      description: `Sale of PKR ${cartTotal.toFixed(2)} recorded.`,
    });
    
    reset({
        customerId: data.customerId,
        paymentMethod: 'Cash',
        invoiceDate: data.invoiceDate,
        notes: '',
        vehicleNumber: '',
    });
    resetItem();
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
                      <CardTitle style={{ color: colorSettings['Sale'] }}>Add Items to Sale</CardTitle>
                  </CardHeader>
                  <CardContent>
                      <form onSubmit={handleItemSubmit(onAddItemToCart)} className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
                              <div className="md:col-span-2 space-y-2">
                                  <Label htmlFor="product">Product</Label>
                                   <Controller
                                    name="productId"
                                    control={controlItem}
                                    render={({ field }) => (
                                      <Popover open={productComboboxOpen} onOpenChange={setProductComboboxOpen}>
                                        <PopoverTrigger asChild>
                                          <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={productComboboxOpen}
                                            className="w-full justify-between"
                                          >
                                            {field.value
                                              ? products.find((p) => p.id === field.value)?.name
                                              : "Select a product..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                          <Command>
                                            <CommandInput placeholder="Search product..." />
                                            <CommandList>
                                              <CommandEmpty>No product found.</CommandEmpty>
                                              <CommandGroup>
                                                {isLoaded && products ? products.map(p => (
                                                  <CommandItem
                                                    key={p.id}
                                                    value={p.name}
                                                    onSelect={() => {
                                                      field.onChange(p.id);
                                                      handleProductSelect(p);
                                                      setProductComboboxOpen(false);
                                                    }}
                                                  >
                                                    <Check
                                                      className={cn(
                                                        "mr-2 h-4 w-4",
                                                        field.value === p.id ? "opacity-100" : "opacity-0"
                                                      )}
                                                    />
                                                    {p.name}
                                                  </CommandItem>
                                                )) : <CommandItem disabled>Loading...</CommandItem>}
                                              </CommandGroup>
                                            </CommandList>
                                          </Command>
                                        </PopoverContent>
                                      </Popover>
                                    )}
                                  />
                                  {itemErrors.productId && <p className="text-sm text-destructive">{itemErrors.productId.message}</p>}
                                  {selectedProduct && (
                                    <div className="grid grid-cols-2 gap-2 pt-1">
                                        <div>
                                            <p className="text-xs text-muted-foreground">Current Stock</p>
                                            <p className="text-sm font-semibold">{currentStock.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">After Sale</p>
                                            <p className={cn("text-sm font-semibold", stockAfterSale < 0 && 'text-destructive')}>{stockAfterSale.toFixed(2)}</p>
                                        </div>
                                    </div>
                                  )}
                              </div>
                              <div className="space-y-2">
                                  <Label htmlFor="unit">Unit</Label>
                                   <Controller
                                      name="unit"
                                      control={controlItem}
                                      render={({ field }) => (
                                          <Select onValueChange={field.onChange} value={field.value || ''}>
                                              <SelectTrigger>
                                                  <SelectValue placeholder="Select unit..." />
                                              </SelectTrigger>
                                              <SelectContent>
                                                  {allUnits.map(unit => (
                                                      <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                                                  ))}
                                              </SelectContent>
                                          </Select>
                                      )}
                                  />
                                  {itemErrors.unit && <p className="text-sm text-destructive">{itemErrors.unit.message}</p>}
                              </div>
                               <div className="space-y-2">
                                  <Label htmlFor="quantity">Quantity</Label>
                                  <Input id="quantity" type="number" {...registerItem('quantity')} step="any" onFocus={() => lastUserEditedField.current = 'quantity'} />
                                  {itemErrors.quantity && <p className="text-sm text-destructive">{itemErrors.quantity.message}</p>}
                              </div>
                               <div className="space-y-2">
                                  <Label htmlFor="price">Price</Label>
                                  <Input id="price" type="number" {...registerItem('price')} step="any" onFocus={() => lastUserEditedField.current = 'price'} />
                                   {itemErrors.price && <p className="text-sm text-destructive">{itemErrors.price.message}</p>}
                              </div>
                          </div>
                           <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                              <div className="md:col-span-2 space-y-2">
                                  <Label htmlFor="totalAmount">Total Amount</Label>
                                  <Input id="totalAmount" type="number" {...registerItem('totalAmount')} step="any" className="bg-muted/50 font-bold" onFocus={() => lastUserEditedField.current = 'totalAmount'} />
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
                                          <TableCell>{item.productName}</TableCell>
                                          <TableCell className="text-right">{item.quantity} {item.unit}</TableCell>
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
               <Card>
                <CardHeader>
                    <CardTitle>Dispensed Fuel Totals</CardTitle>
                    <CardDescription>
                        Total volume dispensed from machines for today.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fuel Type</TableHead>
                                <TableHead className="text-right">Volume Dispensed (Ltr)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Object.keys(dispensedTotals).length > 0 ? (
                                Object.entries(dispensedTotals).map(([fuelType, volume]) => (
                                    <TableRow key={fuelType}>
                                        <TableCell className="font-medium">{fuelType}</TableCell>
                                        <TableCell className="text-right font-mono font-semibold text-green-600">
                                            {volume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={2} className="text-center h-24 text-muted-foreground">
                                        No dispensed fuel data for this period.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
              <form onSubmit={handleSubmit(onSubmit)}>
              <Card>
                  <CardHeader>
                      <CardTitle>Customer &amp; Payment</CardTitle>
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
                                  <Popover open={customerComboboxOpen} onOpenChange={setCustomerComboboxOpen}>
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={customerComboboxOpen}
                                        className="w-full justify-between"
                                      >
                                        {field.value && field.value !== 'walkin'
                                          ? customers.find((c) => c.id === field.value)?.name
                                          : "Walk-in Customer"}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                      <Command>
                                        <CommandInput placeholder="Search customer..." />
                                        <CommandList>
                                          <CommandEmpty>No customer found.</CommandEmpty>
                                          <CommandGroup>
                                            <CommandItem
                                                key="walkin"
                                                value="Walk-in Customer"
                                                onSelect={() => {
                                                  field.onChange('walkin');
                                                  setCustomerComboboxOpen(false);
                                                }}
                                              >
                                                <Check
                                                  className={cn(
                                                    "mr-2 h-4 w-4",
                                                    (field.value === 'walkin' || !field.value) ? "opacity-100" : "opacity-0"
                                                  )}
                                                />
                                                Walk-in Customer
                                              </CommandItem>
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
                              <Button variant="outline" size="icon" asChild><Link href="/customers"><UserPlus/></Link></Button>
                          </div>
                      </div>
                      <div className="space-y-2">
                          <Label>Vehicle Number</Label>
                          {selectedCustomer && selectedCustomer.vehicleNumber ? (
                            <Controller
                                name="vehicleNumber"
                                control={control}
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value || ''}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select vehicle..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {selectedCustomer.vehicleNumber.split(/[,\\n]/).map(v => v.trim()).filter(Boolean).map(v => (
                                                <SelectItem key={v} value={v}>{v}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                          ) : (
                            <Input {...register('vehicleNumber')} placeholder="Enter vehicle number... (optional)" />
                          )}
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
                                  <SelectItem value="Credit">Credit</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                      </div>
                      <div className="space-y-2">
                          <Label>Invoice Date</Label>
                            <Controller
                            name="invoiceDate"
                            control={control}
                            render={({ field }) => (
                                <Popover open={invoiceDateCalendarOpen} onOpenChange={setInvoiceDateCalendarOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !field.value && "text-muted-foreground"
                                    )}
                                    >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? format(field.value, "dd-MMM-yyyy") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        key="sales-calendar"
                                        mode="single"
                                        selected={field.value}
                                        defaultMonth={field.value}
                                        onSelect={(date) => {
                                            field.onChange(date);
                                            setInvoiceDateCalendarOpen(false);
                                        }}
                                        initialFocus
                                    />
                                </PopoverContent>
                                </Popover>
                            )}
                            />
                            {errors.invoiceDate && <p className="text-sm text-destructive">{errors.invoiceDate.message}</p>}
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
                      <Button type="submit" size="lg" className="w-full">Complete &amp; Print Invoice</Button>
                      <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => { reset(); resetItem(); setCart([]); }}>Discard</Button>
                  </CardFooter>
              </Card>
              </form>
          </div>
      </main>
    </div>
  );
}
