
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Users, UserPlus, List, BookText, Pencil, Trash2, AlertTriangle, Search, UserX } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { useDatabase } from '@/hooks/use-database';
import Link from 'next/link';
import Barcode from 'react-barcode';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { Customer } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';


const customerSchema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  contact: z.string().min(1, 'Contact information is required'),
  vehicleNumber: z.string().optional(),
  area: z.string().optional(),
  openingBalance: z.coerce.number().optional(),
  isPartner: z.boolean().optional(),
  sharePercentage: z.coerce.number().optional(),
  isBlacklisted: z.boolean().optional(),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      aria-hidden="true"
      fill="currentColor"
      viewBox="0 0 448 512"
      {...props}
    >
      <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 .9c34.9 0 67.7 13.5 92.8 38.6 25.1 25.1 38.6 57.9 38.6 92.8 0 97.8-79.7 177.6-177.6 177.6-34.9 0-67.7-13.5-92.8-38.6s-38.6-57.9-38.6-92.8c0-97.8 79.7-177.6 177.6-177.6zm93.8 148.6c-3.3-1.5-19.8-9.8-23-11.5s-5.5-2.5-7.8 2.5c-2.3 5-8.7 11.5-10.7 13.8s-3.9 2.5-7.3 1c-3.3-1.5-14-5.2-26.6-16.5c-9.9-8.9-16.5-19.8-18.5-23s-2-5.5-.6-7.5c1.4-2 3-3.3 4.5-5.2s3-4.2 4.5-7.1c1.5-2.8.8-5.2-.4-6.8s-7.8-18.5-10.7-25.4c-2.8-6.8-5.6-5.8-7.8-5.8s-4.5-.4-6.8-.4-7.8 1.1-11.8 5.5c-4 4.4-15.2 14.8-15.2 36.1s15.5 41.9 17.5 44.8c2 2.8 30.4 46.4 73.8 65.4 10.8 4.8 19.3 7.6 25.9 9.8s11.1 1.5 15.2 1c4.8-.7 19.8-8.2 22.5-16.1s2.8-14.8 2-16.1c-.8-1.5-3.3-2.5-6.8-4z"></path>
    </svg>
);

const contactDisplay = (contact: any): string => {
  if (!contact) return '';
  if (Array.isArray(contact)) return contact.join(', ');
  if (typeof contact === 'object' && contact !== null) return Object.values(contact).join(', ');
  return String(contact).replace(/[\n,]+/g, ', ');
};

export default function CustomersPage() {
  const { customers, businessPartners, addCustomer, updateCustomer, deleteCustomer, updateBusinessPartner, deleteBusinessPartner, transactions, customerPayments, cashAdvances } = useDatabase();
  const { toast } = useToast();
  const router = useRouter();
  
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [password, setPassword] = useState('');
  
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
  });

  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEdit, setValue: setEditValue, watch: watchEdit, formState: { errors: editErrors } } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
  });
  
  const isPartnerWatch = watchEdit('isPartner');
  const isBlacklistedWatch = watchEdit('isBlacklisted');

  const lastActivityMap = useMemo(() => {
    const activityMap = new Map<string, string>();

    const allEntries = [
        ...transactions,
        ...customerPayments,
        ...cashAdvances,
        ...customers.map(c => ({ customerId: c.id, timestamp: c.timestamp })),
        ...businessPartners.map(p => ({ customerId: p.id, timestamp: p.timestamp })),
    ];

    for (const entry of allEntries) {
        const id = entry.customerId || (entry as any).id;
        if (id && entry.timestamp && isValid(new Date(entry.timestamp))) {
            const existing = activityMap.get(id);
            if (!existing || new Date(entry.timestamp) > new Date(existing)) {
                activityMap.set(id, entry.timestamp);
            }
        }
    }
    return activityMap;
  }, [transactions, customerPayments, cashAdvances, customers, businessPartners]);

  const balances = useMemo(() => {
    const balanceMap = new Map<string, number>();
    customers.forEach(c => {
        const openingBalance = c.openingBalance || 0;
        const totalSales = transactions.filter(tx => tx.customerId === c.id).reduce((sum, tx) => sum + tx.totalAmount, 0);
        const totalCashAdvances = cashAdvances.filter(ca => ca.customerId === c.id).reduce((sum, ca) => sum + ca.amount, 0);
        const totalPayments = customerPayments.filter(p => p.customerId === c.id).reduce((sum, p) => sum + p.amount, 0);
        balanceMap.set(c.id, openingBalance + totalSales + totalCashAdvances - totalPayments);
    });
    return balanceMap;
  }, [customers, transactions, customerPayments, cashAdvances]);

  const allPeople = useMemo(() => {
    const peopleMap = new Map<string, Customer>();

    customers.forEach(c => {
        peopleMap.set(c.id, { ...c, isPartner: false }); // default to not partner
    });
    
    businessPartners.forEach(p => {
        if (!peopleMap.has(p.id)) {
            peopleMap.set(p.id, {
                id: p.id,
                name: p.name,
                contact: p.contact || '',
                timestamp: p.timestamp,
                isPartner: true,
            });
        } else {
            const customer = peopleMap.get(p.id)!;
            customer.isPartner = true;
        }
    });
    
    const peopleArray = Array.from(peopleMap.values());
    
    peopleArray.sort((a, b) => {
        const balanceA = balances.get(a.id) ?? 0;
        const balanceB = balances.get(b.id) ?? 0;

        const isZeroA = Math.abs(balanceA) < 0.01;
        const isZeroB = Math.abs(balanceB) < 0.01;

        if (isZeroA && !isZeroB) {
            return 1; // a (zero balance) comes after b (non-zero)
        }
        if (!isZeroA && isZeroB) {
            return -1; // a (non-zero balance) comes before b (zero)
        }

        // Both are zero or both are non-zero, sort by last activity
        const dateA = lastActivityMap.get(a.id);
        const dateB = lastActivityMap.get(b.id);
        if(dateA && dateB) {
            return new Date(dateB).getTime() - new Date(dateA).getTime();
        }
        if(dateA) return -1;
        if(dateB) return 1;
        return a.name.localeCompare(b.name);
    });

    return peopleArray;
  }, [customers, businessPartners, lastActivityMap, balances]);
  
  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return allPeople;
    const lowercasedTerm = searchTerm.toLowerCase();
    return allPeople.filter(c =>
        c.name.toLowerCase().includes(lowercasedTerm) ||
        (c.contact && String(c.contact).toLowerCase().includes(lowercasedTerm)) ||
        (c.area && c.area.toLowerCase().includes(lowercasedTerm)) ||
        (c.vehicleNumber && c.vehicleNumber.toLowerCase().includes(lowercasedTerm))
    );
  }, [allPeople, searchTerm]);

  const onAddSubmit: SubmitHandler<CustomerFormValues> = (data) => {
    addCustomer({ ...data, isPartner: false });
    toast({
      title: 'Customer Added',
      description: `${data.name} has been added to your customer list.`,
    });
    reset();
  };
  
  const onEditSubmit: SubmitHandler<CustomerFormValues> = (data) => {
    if (!customerToEdit) return;
    
    updateCustomer(customerToEdit.id, {
        name: data.name,
        contact: data.contact,
        vehicleNumber: data.vehicleNumber,
        area: data.area,
        openingBalance: data.openingBalance,
        isBlacklisted: data.isBlacklisted,
    });
    
    const isAlreadyPartner = businessPartners.some(p => p.id === customerToEdit.id);

    if (data.isPartner) {
        const partnerData = {
            name: data.name,
            sharePercentage: data.sharePercentage || 0,
            contact: data.contact,
        };
        // This will create if not exists, or update if it does.
        // Requires a flexible backend function (e.g., using set with merge).
        updateBusinessPartner(customerToEdit.id, partnerData);
    } else if (isAlreadyPartner) {
        deleteBusinessPartner(customerToEdit.id);
    }

    toast({
        title: 'Customer Updated',
        description: "The customer's details have been saved."
    });
    setCustomerToEdit(null);
  };

  const handleDeleteCustomer = () => {
    if (!customerToDelete) return;
    if (password !== '03006555459') {
      toast({ variant: 'destructive', title: 'Incorrect Password', description: 'The password to delete is incorrect.' });
      setPassword('');
      return;
    }
    deleteCustomer(customerToDelete.id);
    toast({
        title: 'Customer Deleted',
        description: `${customerToDelete.name} has been removed.`,
    });
    setCustomerToDelete(null);
    setPassword('');
  };

  const openEditDialog = (customer: Customer) => {
    setCustomerToEdit(customer);
  }

  const formatPhoneNumberForWhatsApp = (phone: any) => {
    let primaryPhone = '';
    if (phone) {
        primaryPhone = String(phone).split(/[,\n]/)[0].trim();
    }
    if (!primaryPhone) return '';
    return String(primaryPhone).replace(/[^0-9]/g, '');
  }
  
  const handleRowClick = (customerId: string, e: React.MouseEvent) => {
    // Prevent navigation if the click was on a button or an interactive element
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a')) {
      return;
    }
    router.push(`/customers/${customerId}/ledger`);
  };

  const handleToggleBlacklist = (customer: Customer) => {
    updateCustomer(customer.id, { isBlacklisted: !customer.isBlacklisted });
    toast({
        title: customer.isBlacklisted ? 'Customer Unblacklisted' : 'Customer Blacklisted',
        description: `${customer.name} has been ${customer.isBlacklisted ? 'removed from' : 'added to'} the blacklist.`,
    });
  };

  useEffect(() => {
    if (customerToEdit) {
      const isPartner = businessPartners.some(p => p.id === customerToEdit.id);
      const partnerData = businessPartners.find(p => p.id === customerToEdit.id);
      setEditValue('name', customerToEdit.name);
      setEditValue('contact', contactDisplay(customerToEdit.contact));
      setEditValue('vehicleNumber', customerToEdit.vehicleNumber || '');
      setEditValue('area', customerToEdit.area || '');
      setEditValue('openingBalance', customerToEdit.openingBalance || 0);
      setEditValue('isPartner', isPartner);
      setEditValue('sharePercentage', partnerData?.sharePercentage || 0);
      setEditValue('isBlacklisted', !!customerToEdit.isBlacklisted);
    } else {
      resetEdit();
    }
  }, [customerToEdit, setEditValue, resetEdit, businessPartners]);

  return (
    <>
    <div className="p-4 md:p-8 grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus /> New Customer
            </CardTitle>
            <CardDescription>Add a new customer to your records.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onAddSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Customer Name</Label>
                <Input id="name" {...register('name')} placeholder="e.g., John Doe" />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="contact">Contact Info (Phone Number, comma/new-line separated)</Label>
                <Textarea id="contact" {...register('contact')} placeholder="e.g., 923001234567, 923338765432" />
                {errors.contact && <p className="text-sm text-destructive">{errors.contact.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="vehicleNumber">Vehicle Number (Optional, comma/new-line separated)</Label>
                <Textarea id="vehicleNumber" {...register('vehicleNumber')} placeholder="e.g., ABC-123, RIL-456" />
                {errors.vehicleNumber && <p className="text-sm text-destructive">{errors.vehicleNumber.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="area">Area (Optional)</Label>
                <Input id="area" {...register('area')} placeholder="e.g., Mianwali City" />
                {errors.area && <p className="text-sm text-destructive">{errors.area.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="openingBalance">Opening Balance (PKR)</Label>
                <Input id="openingBalance" type="number" {...register('openingBalance')} placeholder="e.g., 5000" step="any" />
                {errors.openingBalance && <p className="text-sm text-destructive">{errors.openingBalance.message}</p>}
              </div>

              <Button type="submit" className="w-full">Add Customer</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <CardTitle className="flex items-center gap-2">
                    <List /> Customer &amp; Partner List
                    </CardTitle>
                    <CardDescription>
                    A record of all your customers and business partners.
                    </CardDescription>
                </div>
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search by name, contact, area..." 
                        className="pl-10"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredCustomers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer Details</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map(c => {
                    const balance = balances.get(c.id) ?? 0;
                    return (
                      <TableRow key={c.id} onClick={(e) => handleRowClick(c.id, e)} className="cursor-pointer">
                        <TableCell>
                          <div className={cn("font-bold text-lg flex items-center gap-2", balance > 0 ? "text-destructive" : balance < 0 ? "text-green-600" : "")}>
                            {c.name}
                            {c.isPartner && <Badge variant="secondary">Partner</Badge>}
                            {c.isBlacklisted && <Badge variant="destructive">Blacklisted</Badge>}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {c.contact && String(c.contact).split(/[,\n]/).map((contact, i) => (
                                <div key={i}>{contact.trim()}</div>
                            ))}
                          </div>
                           <div className="text-xs text-muted-foreground">{c.area || 'N/A'}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.vehicleNumber && String(c.vehicleNumber).split(/[,\n]/).map((vehicle, i) => (
                                <div key={i}>{vehicle.trim()}</div>
                            ))}
                          </div>
                          <div className="text-xs text-muted-foreground">Last Activity: {lastActivityMap.get(c.id) ? format(new Date(lastActivityMap.get(c.id)!), 'dd-MMM-yyyy') : 'N/A'}</div>
                          <div className={cn(
                              "font-bold mt-1",
                              balance > 0 ? "text-destructive" : balance < 0 ? "text-green-600" : ""
                          )}>
                            Balance: PKR {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Barcode value={c.id} height={40} width={1.5} fontSize={10} margin={2} />
                        </TableCell>
                        <TableCell className="text-center space-x-0">
                           <Button asChild variant="ghost" size="icon" title="View Ledger">
                              <Link href={`/customers/${c.id}/ledger`}>
                                <BookText className="w-5 h-5" />
                              </Link>
                           </Button>
                           <Button variant="ghost" size="icon" title="Edit Customer" onClick={(e) => { e.stopPropagation(); openEditDialog(c); }}>
                                <Pencil className="w-4 h-4" />
                           </Button>
                           {c.contact && (
                             <Button asChild variant="ghost" size="icon" className="text-green-500 hover:text-green-600" title={`Message ${c.name} on WhatsApp`}>
                               <a 
                                href={`https://wa.me/${formatPhoneNumberForWhatsApp(c.contact)}`}
                                target="_blank" 
                                rel="noopener noreferrer"
                              >
                                 <WhatsAppIcon className="w-5 h-5" />
                              </a>
                            </Button>
                           )}
                           <Button variant="ghost" size="icon" title={c.isBlacklisted ? 'Remove from Blacklist' : 'Add to Blacklist'} onClick={(e) => { e.stopPropagation(); handleToggleBlacklist(c); }}>
                                <UserX className={c.isBlacklisted ? 'text-destructive' : ''} />
                           </Button>
                           <Button variant="ghost" size="icon" title="Delete Customer" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setCustomerToDelete(c); }}>
                                <Trash2 className="w-4 h-4" />
                           </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
                <Users className="w-16 h-16" />
                <h3 className="text-xl font-semibold">{searchTerm ? 'No Matching Customers' : 'No Customers Recorded'}</h3>
                <p>{searchTerm ? 'Try a different search term.' : 'Use the form to add your first customer.'}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    
    <Dialog open={!!customerToEdit} onOpenChange={(isOpen) => { if (!isOpen) { setCustomerToEdit(null); resetEdit(); } }}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Edit Customer</DialogTitle>
                <DialogDescription>
                    Update the details for this customer.
                </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmitEdit(onEditSubmit)}>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="edit-name">Customer Name</Label>
                        <Input id="edit-name" {...registerEdit('name')} />
                        {editErrors.name && <p className="text-sm text-destructive">{editErrors.name.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit-contact">Contact Info (comma/new-line separated)</Label>
                        <Textarea id="edit-contact" {...registerEdit('contact')} />
                        {editErrors.contact && <p className="text-sm text-destructive">{editErrors.contact.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit-vehicleNumber">Vehicle Number (comma/new-line separated)</Label>
                        <Textarea id="edit-vehicleNumber" {...registerEdit('vehicleNumber')} />
                        {editErrors.vehicleNumber && <p className="text-sm text-destructive">{editErrors.vehicleNumber.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit-area">Area</Label>
                        <Input id="edit-area" {...registerEdit('area')} />
                        {editErrors.area && <p className="text-sm text-destructive">{editErrors.area.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit-openingBalance">Opening Balance (PKR)</Label>
                        <Input id="edit-openingBalance" type="number" {...registerEdit('openingBalance')} step="any" />
                        {editErrors.openingBalance && <p className="text-sm text-destructive">{editErrors.openingBalance.message}</p>}
                    </div>
                     <Separator className="my-4"/>
                    <div className="flex items-center space-x-2">
                        <Switch id="isBlacklisted" checked={isBlacklistedWatch} onCheckedChange={(checked) => setEditValue('isBlacklisted', checked)} />
                        <Label htmlFor="isBlacklisted">Blacklist Customer</Label>
                    </div>
                     <Separator className="my-4"/>
                    <div className="space-y-4">
                        <div className="flex items-center space-x-2">
                            <Switch id="isPartner" checked={isPartnerWatch} onCheckedChange={(checked) => setEditValue('isPartner', checked)} />
                            <Label htmlFor="isPartner">Make Business Partner</Label>
                        </div>
                        {isPartnerWatch && (
                        <div className="space-y-2 pl-4">
                            <Label htmlFor="sharePercentage">Share Percentage (%)</Label>
                            <Input id="sharePercentage" type="number" {...registerEdit('sharePercentage')} step="0.01" />
                            {editErrors.sharePercentage && <p className="text-sm text-destructive">{editErrors.sharePercentage.message}</p>}
                        </div>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setCustomerToEdit(null)}>Cancel</Button>
                    <Button type="submit">Save Changes</Button>
                </DialogFooter>
            </form>
        </DialogContent>
    </Dialog>

    <AlertDialog open={!!customerToDelete} onOpenChange={(isOpen) => { if (!isOpen) { setCustomerToDelete(null); setPassword(''); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the customer: <br />
            <strong className="font-medium text-foreground">{customerToDelete?.name}</strong>.
            All their associated transactions will remain but will no longer be linked to them.
            <div className="mt-4 space-y-2">
              <Label htmlFor="delete-password-customer">Enter password to confirm deletion:</Label>
              <Input
                id="delete-password-customer"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password required"
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPassword('')}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteCustomer} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Yes, delete customer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
