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
import { UserPlus, Sun, Check, ChevronsUpDown, Calendar as CalendarIcon, Mic, ShieldCheck } from 'lucide-react';
import type { Transaction, Product, Purchase, FuelType } from '@/lib/types';
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
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

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
  pin: z.string().optional(),
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
                <Button variant="ghost" size="icon"><Sun className="h-5 w-5" /></Button>
            </div>
        </div>
      </header>
    );
}

export default function SalesPage() {
  const { customers, addTransaction, updateTransaction, isLoaded, products, purchases, transactions, colorSettings, fuelStock } = useDatabase();
  const { isPinVerified, confirmPin } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const editId = searchParams.get('edit');
  const [cart, setCart] = useState<SaleItemFormValues[]>([]);
  const { toast } = useToast();
  const lastUserEditedField = useRef<'quantity' | 'price' | 'totalAmount' | null>(null);
  const [productComboboxOpen, setProductComboboxOpen] = useState(false);
  const [customerComboboxOpen, setCustomerComboboxOpen] = useState(false);
  const [invoiceDateCalendarOpen, setInvoiceDateCalendarOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [language, setLanguage] = useState('en-US');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [sessionPrices, setSessionPrices] = useState<Record<string, number>>({});

  const { register: registerItem, handleSubmit: handleItemSubmit, watch: watchItem, setValue: setItemValue, reset: resetItem, control: controlItem, formState: { errors: itemErrors } } = useForm<SaleItemFormValues>({
    resolver: zodResolver(saleItemSchema),
  });

  const { register, handleSubmit, control, watch, setValue, reset, formState: { errors } } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: { paymentMethod: 'Cash', notes: '', vehicleNumber: '' },
  });

  const { customerId } = watch();
  const { productId, quantity, price, totalAmount } = watchItem();
  const isWalkIn = !customerId || customerId === 'walkin';

  useEffect(() => {
    if (isLoaded && editId) {
        const tx = transactions.find(t => t.id === editId);
        if (tx) {
            const product = products.find(p => p.name === (tx.product || tx.fuelType));
            if (product) {
                setItemValue('productId', product.id);
                setItemValue('productName', product.name);
                setItemValue('unit', product.unit);
                setItemValue('quantity', tx.volume);
                setItemValue('price', tx.pricePerLitre);
                setItemValue('totalAmount', tx.totalAmount);
                setCart([{ productId: product.id, productName: product.name, unit: product.unit, quantity: tx.volume, price: tx.pricePerLitre, totalAmount: tx.totalAmount }]);
            }
            setValue('customerId', tx.customerId || 'walkin');
            setValue('invoiceDate', new Date(tx.timestamp));
            setValue('paymentMethod', tx.paymentMethod);
            setValue('notes', tx.notes || '');
            if (tx.notes && tx.notes.includes('Vehicle: ')) {
                const match = tx.notes.match(/Vehicle: ([^,]+)/);
                if (match) setValue('vehicleNumber', match[1]);
            }
        }
    }
  }, [isLoaded, editId, transactions, products, setItemValue, setValue]);

  const updateSessionPrice = useCallback((productId: string, price: number) => {
    setSessionPrices(prev => {
        const newPrices = { ...prev, [productId]: price };
        localStorage.setItem('session_product_prices', JSON.stringify(newPrices));
        return newPrices;
    });
  }, []);

  const handleProductSelect = useCallback((product: Product) => {
    const lastTx = transactions.filter(t => t.product === product.name).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    const priceToSet = sessionPrices[product.id] ?? lastTx?.pricePerLitre ?? product.salePrice;
    setItemValue('price', priceToSet);
    setItemValue('unit', product.unit);
    setItemValue('productName', product.name);
  }, [transactions, setItemValue, sessionPrices]);

  useEffect(() => {
    const saved = localStorage.getItem('session_product_prices');
    if (saved) try { setSessionPrices(JSON.parse(saved)); } catch (e) {}
  }, []);

  useEffect(() => {
    if (!editId) {
        const savedDate = localStorage.getItem('global_date_from');
        setValue('invoiceDate', savedDate && isValid(new Date(savedDate)) ? new Date(savedDate) : new Date());
    }
  }, [setValue, editId]);
  
  useEffect(() => {
    if (isLoaded && !editId) {
      const savedId = localStorage.getItem('global_lastCustomerId');
      if (savedId) {
        const customer = customers.find(c => c.id === savedId);
        if (customer) {
          setValue('customerId', customer.id);
          if (customer.vehicleNumber) setValue('vehicleNumber', String(customer.vehicleNumber).split(/[,\n]/)[0].trim());
        } else setValue('customerId', 'walkin');
      } else setValue('customerId', 'walkin');
    }
  }, [isLoaded, customers, setValue, editId]);

  useEffect(() => {
    if (isLoaded && !editId) {
      const savedProdId = localStorage.getItem('global_lastSaleProductId');
      if (savedProdId) {
        const product = products.find(p => p.id === savedProdId);
        if (product) { setItemValue('productId', product.id); handleProductSelect(product); }
      }
    }
  }, [isLoaded, products, setItemValue, handleProductSelect, editId]);

  useEffect(() => {
    setValue('paymentMethod', isWalkIn ? 'Cash' : 'Credit');
  }, [isWalkIn, setValue]);

  const allUnits = useMemo(() => {
    const defaultUnits = ['Ltr', 'Pcs', 'Kg', 'Box', 'Bottle'];
    const unitsFromProducts = products.map(p => p.unit).filter(Boolean) as string[];
    const combined = [...new Set([...defaultUnits, ...unitsFromProducts].map(u => u.toLowerCase()))];
    return combined.map(l => unitsFromProducts.find(u => u.toLowerCase() === l) || defaultUnits.find(u => u.toLowerCase() === l) || l).filter(Boolean);
  }, [products]);

  const sortedProducts = useMemo(() => {
    if (!products) return [];
    const counts = transactions.reduce<Record<string, number>>((acc, tx) => {
        const name = tx.product || tx.fuelType;
        if (name) acc[name] = (acc[name] || 0) + 1;
        return acc;
    }, {});
    return [...products].sort((a, b) => (counts[b.name] || 0) - (counts[a.name] || 0));
  }, [products, transactions]);

  const selectedProduct = useMemo(() => products.find(p => p.id === productId), [productId, products]);
  const currentStockValue = useMemo(() => selectedProduct ? (fuelStock[selectedProduct.name as FuelType] || 0) : 0, [selectedProduct, fuelStock]);
  const stockAfterSale = useMemo(() => {
    if (!selectedProduct) return 0;
    const cartQty = cart.filter(i => i.productId === selectedProduct.id).reduce((s, i) => s + i.quantity, 0);
    return currentStockValue - (editId ? 0 : cartQty) - (Number(quantity) || 0);
  }, [currentStockValue, quantity, selectedProduct, cart, editId]);

  useEffect(() => {
    const qty = Number(quantity) || 0;
    const prc = Number(price) || 0;
    const total = Number(totalAmount) || 0;
    if (lastUserEditedField.current === 'quantity' || lastUserEditedField.current === 'price') {
      setItemValue('totalAmount', qty * prc, { shouldValidate: true });
    } else if (lastUserEditedField.current === 'totalAmount') {
      if (prc > 0) setItemValue('quantity', total / prc, { shouldValidate: true });
      else if (qty > 0) setItemValue('price', total / qty, { shouldValidate: true });
    }
  }, [quantity, price, totalAmount, setItemValue]);
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = false; recognition.interimResults = false; recognition.lang = language;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setValue('notes', (watch('notes') || '') + ' ' + transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
  }, [language, watch, setValue]);

  const handleToggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) recognitionRef.current.stop(); else recognitionRef.current.start();
    setIsListening(!isListening);
  };

  const { balance: customerBalance } = useCustomerBalance(customerId || null);
  const cartTotal = useMemo(() => cart.reduce((t, i) => t + i.totalAmount, 0), [cart]);

  const onAddItemToCart: SubmitHandler<SaleItemFormValues> = (data) => {
    if (editId) setCart([data]); else setCart(prev => [...prev, data]);
    updateSessionPrice(data.productId, data.price);
    if (!editId) resetItem({ productId: '', productName: '', unit: '', quantity: undefined, price: undefined, totalAmount: undefined });
  };
  
  const onSubmit: SubmitHandler<TransactionFormValues> = (data) => {
    if (cart.length === 0) {
      toast({ variant: 'destructive', title: 'Empty Cart', description: 'Please add items.' });
      return;
    }

    const pinToVerify = data.pin;
    if (!isPinVerified() && pinToVerify !== '0200') {
      toast({ variant: 'destructive', title: 'Incorrect PIN' });
      return;
    }
    if (pinToVerify === '0200') confirmPin('0200');

    const isoDate = data.invoiceDate.toISOString();
    localStorage.setItem('global_date_from', isoDate);
    localStorage.setItem('global_date_to', isoDate);
    if (data.customerId) localStorage.setItem('global_lastCustomerId', data.customerId);
    if (cart[0]?.productId) localStorage.setItem('global_lastSaleProductId', cart[0].productId);

    let finalNotes = data.notes || '';
    if (data.vehicleNumber && !isWalkIn) finalNotes = `Vehicle: ${data.vehicleNumber}${finalNotes ? ', ' + finalNotes : ''}`;
    
    cart.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        let costPrice = 0;
        if (product) {
            if (product.category === 'Main Product') {
                const latest = purchases.filter(p => p.fuelType === item.productName && isValid(new Date(p.timestamp)) && new Date(p.timestamp) <= data.invoiceDate).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                if (latest && latest.volume > 0) costPrice = (latest.totalCost / latest.volume) * item.quantity;
            } else costPrice = (product.purchasePrice || 0) * item.quantity;
        }

        const txData: any = {
          fuelType: item.productName, 
          volume: item.quantity, 
          pricePerLitre: item.price, 
          product: item.productName, 
          totalAmount: item.totalAmount, 
          costPrice, 
          paymentMethod: isWalkIn ? 'Cash' : 'Credit', 
          customerId: data.customerId, 
          customerName: (customers.find(c => c.id === data.customerId)?.name) || 'Walk-in Customer', 
          notes: finalNotes, 
          timestamp: isoDate, 
          isWalkIn, 
          saleType: isWalkIn ? 'cash' : 'credit', 
          entryType: isWalkIn ? 'cash_sale' : 'credit_sale', 
          journalColumn: isWalkIn ? 'credit' : 'debit'
        };

        // Maintain old color code if editing
        if (!editId) {
            txData.colorCode = isWalkIn ? '#22C55E' : '#3B82F6';
        }

        if (editId) updateTransaction(editId, txData); else addTransaction(txData);
    });

    toast({ title: editId ? 'Sale Updated' : 'Sale Complete' });
    if (editId) router.push('/ledger'); else { reset({ customerId: data.customerId, paymentMethod: isWalkIn ? 'Cash' : 'Credit', invoiceDate: data.invoiceDate, notes: '', vehicleNumber: '', pin: '' }); resetItem(); setCart([]); }
  };

  return (
    <div className="bg-muted/30 min-h-screen">
      <PageHeader /><TransactionNav />
      <main className="container mx-auto p-4 grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
              <Card>
                  <CardHeader><CardTitle>{editId ? 'Edit Sale' : 'Add to Sale'}</CardTitle></CardHeader>
                  <CardContent>
                      <form onSubmit={handleItemSubmit(onAddItemToCart)} className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
                              <div className="md:col-span-2 space-y-2">
                                  <Label>Product</Label>
                                   <Controller name="productId" control={controlItem} render={({ field }) => (
                                      <Popover open={productComboboxOpen} onOpenChange={setProductComboboxOpen}>
                                        <PopoverTrigger asChild><Button variant="outline" className="w-full justify-between">{field.value ? products.find(p => p.id === field.value)?.name : "Select product..."}<ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" /></Button></PopoverTrigger>
                                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0"><Command><CommandInput placeholder="Search..." /><CommandList><CommandEmpty>Not found.</CommandEmpty><CommandGroup>{isLoaded && sortedProducts.map(p => (<CommandItem key={p.id} value={p.name} onSelect={() => { field.onChange(p.id); handleProductSelect(p); setProductComboboxOpen(false); }}><Check className={cn("mr-2 h-4 w-4", field.value === p.id ? "opacity-100" : "opacity-0")} />{p.name}</CommandItem>))}</CommandGroup></CommandList></Command></PopoverContent>
                                      </Popover>
                                   )}/>
                                  {selectedProduct && (
                                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                                        <div><p className="text-muted-foreground font-medium">Stock</p><p className="font-bold">{currentStockValue.toFixed(2)}</p></div>
                                        <div><p className="text-muted-foreground font-medium">Remaining</p><p className={cn("font-bold", stockAfterSale < 0 && 'text-destructive')}>{stockAfterSale.toFixed(2)}</p></div>
                                    </div>
                                  )}
                              </div>
                              <div className="space-y-2"><Label>Unit</Label><Controller name="unit" control={controlItem} render={({ field }) => (<Select onValueChange={field.onChange} value={field.value || ''}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{allUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select>)}/></div>
                              <div className="space-y-2"><Label>Qty</Label><Input type="number" {...registerItem('quantity')} step="any" onFocus={() => lastUserEditedField.current = 'quantity'} /></div>
                              <div className="space-y-2"><Label>Price</Label><Input type="number" {...registerItem('price')} step="any" onFocus={() => lastUserEditedField.current = 'price'} /></div>
                          </div>
                           <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                              <div className="md:col-span-2 space-y-2"><Label>Total</Label><Input type="number" {...registerItem('totalAmount')} step="any" className="bg-muted font-bold" onFocus={() => lastUserEditedField.current = 'totalAmount'} /></div>
                              <div className="md:col-span-1"><Button type="submit" className="w-full">{editId ? 'Apply' : 'Add'}</Button></div>
                          </div>
                      </form>
                  </CardContent>
              </Card>
              <Card><CardHeader><CardTitle>Cart</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>{cart.length > 0 ? cart.map((i, idx) => (<TableRow key={idx}><TableCell>{i.productName}</TableCell><TableCell className="text-right">{i.quantity} {i.unit}</TableCell><TableCell className="text-right">{i.price.toFixed(2)}</TableCell><TableCell className="text-right font-bold">{i.totalAmount.toFixed(2)}</TableCell></TableRow>)) : <TableRow><TableCell colSpan={4} className="text-center h-24 text-muted-foreground">Empty</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
          </div>
          <div className="lg:col-span-1">
              <form onSubmit={handleSubmit(onSubmit)}><Card><CardHeader><CardTitle>Payment</CardTitle></CardHeader><CardContent className="space-y-4">
                      <div className="space-y-2"><Label>Customer</Label><div className="flex gap-2"><Controller name="customerId" control={control} render={({ field }) => (<Popover open={customerComboboxOpen} onOpenChange={setCustomerComboboxOpen}><PopoverTrigger asChild><Button variant="outline" className="w-full justify-between">{field.value && field.value !== 'walkin' ? customers.find(c => c.id === field.value)?.name : "Walk-in Customer"}<ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" /></Button></PopoverTrigger><PopoverContent className="w-[--radix-popover-trigger-width] p-0"><Command><CommandInput placeholder="Search..." /><CommandList><CommandEmpty>None.</CommandEmpty><CommandGroup><CommandItem value="Walk-in Customer" onSelect={() => { field.onChange('walkin'); setCustomerComboboxOpen(false); }}><Check className={cn("mr-2 h-4 w-4", (field.value === 'walkin' || !field.value) ? "opacity-100" : "opacity-0")} />Walk-in</CommandItem>{isLoaded && customers.map(c => (<CommandItem key={c.id} value={c.name} onSelect={() => { field.onChange(c.id); setCustomerComboboxOpen(false); }}><Check className={cn("mr-2 h-4 w-4", field.value === c.id ? "opacity-100" : "opacity-0")} />{c.name}</CommandItem>))}</CommandGroup></CommandList></Command></PopoverContent></Popover>)}/><Button variant="outline" size="icon" asChild><Link href="/customers"><UserPlus/></Link></Button></div></div>
                      {!isWalkIn && <div className="space-y-2"><Label>Vehicle</Label>{(customers.find(c => c.id === customerId)?.vehicleNumber) ? <Controller name="vehicleNumber" control={control} render={({ field }) => (<Select onValueChange={field.onChange} value={field.value || ''}><SelectTrigger><SelectValue placeholder="Select vehicle..." /></SelectTrigger><SelectContent>{String(customers.find(c => c.id === customerId)!.vehicleNumber).split(/[,\n]/).map(v => v.trim()).filter(Boolean).map(v => (<SelectItem key={v} value={v}>{v}</SelectItem>))}</SelectContent></Select>)}/> : <Input {...register('vehicleNumber')} placeholder="Optional" />}</div>}
                      <div className="space-y-2"><Label>Method</Label><Controller name="paymentMethod" control={control} render={({ field }) => (<Select onValueChange={field.onChange} value={field.value} disabled><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{isWalkIn ? <SelectItem value="Cash">Cash</SelectItem> : <SelectItem value="Credit">Credit (Udhar)</SelectItem>}</SelectContent></Select>)}/><p className="text-[10px] text-muted-foreground italic">Automatic based on customer type.</p></div>
                      <div className="space-y-2"><Label>Date</Label><Controller name="invoiceDate" control={control} render={({ field }) => (<Popover open={invoiceDateCalendarOpen} onOpenChange={setInvoiceDateCalendarOpen}><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "dd-MMM-yyyy") : "Pick date"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={(d) => { field.onChange(d); setInvoiceDateCalendarOpen(false); }} initialFocus /></PopoverContent></Popover>)}/></div>
                      <div className="space-y-2"><Label>Notes</Label><div className="relative"><Textarea {...register('notes')} placeholder="Notes..." className="pr-12"/><Button type="button" size="icon" variant={isListening ? "destructive" : "ghost"} className="absolute right-1 top-1 h-8 w-8" onClick={handleToggleListening}><Mic className="h-4 w-4" /></Button></div></div>
                      
                      {!isPinVerified() && (
                        <div className="space-y-2 border-t pt-4">
                            <Label className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary"/> Security PIN</Label>
                            <Input type="password" {...register('pin')} placeholder="Enter 4-digit PIN" maxLength={4} />
                        </div>
                      )}

                      <div className="space-y-1 text-sm pt-4 border-t">
                          <div className="flex justify-between font-bold text-lg"><span>Invoice Total</span><span>PKR {cartTotal.toFixed(2)}</span></div>
                          {customerId && customerId !== 'walkin' && (<div className="space-y-1 mt-4 p-3 bg-muted rounded-md text-xs"><div className="flex justify-between text-muted-foreground"><span>Prev Balance</span><span>{customerBalance.toFixed(2)}</span></div><div className="flex justify-between font-bold text-sm"><span>New Balance</span><span className="text-destructive">{(customerBalance + cartTotal).toFixed(2)}</span></div></div>)}
                      </div>
                  </CardContent>
                  <CardFooter className="flex flex-col gap-2"><Button type="submit" size="lg" className="w-full">{editId ? 'Update' : 'Complete & Print'}</Button><Button type="button" variant="outline" className="w-full" onClick={() => { if (editId) router.push('/ledger'); else { reset(); setCart([]); } }}>Discard</Button></CardFooter></Card></form>
          </div>
      </main>
    </div>
  );
}
