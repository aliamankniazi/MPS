'use client';

import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PiggyBank, PlusCircle, Calendar as CalendarIcon, Edit, Trash2, AlertTriangle, Banknote, TrendingUp, TrendingDown, Clock, Upload, Search, Mic, ShieldCheck, Phone, Percent } from 'lucide-react';
import { format, startOfDay, endOfDay, isValid } from 'date-fns';
import { useDatabase } from '@/hooks/use-database';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { useMemo, useState, useEffect, useRef } from 'react';
import type { BusinessPartner } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const investmentSchema = z.object({
  partnerId: z.string().min(1, 'Partner name is required'),
  type: z.enum(['Investment', 'Withdrawal'], { required_error: 'Please select a transaction type.'}),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  notes: z.string().optional(),
  date: z.date({ required_error: "A date is required."}),
  pin: z.string().length(4, "PIN must be 4 digits"),
});

type InvestmentFormValues = z.infer<typeof investmentSchema>;

const partnerSchema = z.object({
  name: z.string().min(1, 'Partner name is required.'),
  contact: z.string().optional(),
  area: z.string().optional(),
  sharePercentage: z.coerce.number().min(0, "Percentage can't be negative.").max(100, "Percentage can't exceed 100."),
});
type PartnerFormValues = z.infer<typeof partnerSchema>;


export default function InvestmentsPage() {
  const { 
    investments, 
    addInvestment, 
    businessPartners, 
    addBusinessPartner, 
    updateBusinessPartner, 
    deleteBusinessPartner, 
    isLoaded,
    dateRange
  } = useDatabase();
  const [partnerToEdit, setPartnerToEdit] = useState<BusinessPartner | null>(null);
  const [partnerToDelete, setPartnerToDelete] = useState<BusinessPartner | null>(null);
  const [transactionPartner, setTransactionPartner] = setTransactionPartner = useState<BusinessPartner | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [language, setLanguage] = useState('en-US');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [password, setPassword] = useState('');

  const { toast } = useToast();
  
  // Form for new investments/withdrawals
  const { register: registerInvestment, handleSubmit: handleSubmitInvestment, reset: resetInvestment, control: controlInvestment, getValues: getValuesInvestment, setValue: setValueInvestment, formState: { errors: investmentErrors } } = useForm<InvestmentFormValues>({
    resolver: zodResolver(investmentSchema),
  });

  useEffect(() => {
    resetInvestment({ date: new Date(), type: 'Investment' });
  }, [resetInvestment]);
  
  // Form for adding/editing partners
  const { register: registerPartner, handleSubmit: handleSubmitPartner, reset: resetPartner, setValue: setPartnerValue, formState: { errors: partnerErrors } } = useForm<PartnerFormValues>({
    resolver: zodResolver(partnerSchema),
  });

   useEffect(() => {
    // SpeechRecognition is a browser-only API
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = language;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const currentNotes = getValuesInvestment('notes') || '';
      setValueInvestment('notes', currentNotes ? currentNotes + ' ' + transcript : transcript);
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

  }, [language, getValuesInvestment, setValueInvestment, toast]);

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
  
  const onInvestmentSubmit: SubmitHandler<InvestmentFormValues> = (data) => {
    if (data.pin !== '0200') {
      toast({
        variant: 'destructive',
        title: 'Incorrect PIN',
        description: 'Verification failed. Incorrect Security PIN.',
      });
      return;
    }

    const partner = businessPartners.find(p => p.id === data.partnerId);
    if (!partner) return;

    addInvestment({ 
        partnerId: data.partnerId, 
        partnerName: partner.name,
        type: data.type,
        amount: data.amount,
        notes: data.notes,
        timestamp: data.date.toISOString() 
    });
    toast({
      title: 'Transaction Recorded',
      description: `${data.type} of PKR ${data.amount} by ${partner.name} has been logged.`,
    });
    setTransactionPartner(null);
    resetInvestment({ partnerId: '', amount: 0, notes: '', date: new Date(), type: 'Investment', pin: '' });
  };
  
  const onPartnerSubmit: SubmitHandler<PartnerFormValues> = (data) => {
    if (partnerToEdit && partnerToEdit.id) {
      updateBusinessPartner(partnerToEdit.id, data);
      toast({ title: 'Partner Updated', description: `${data.name}'s details have been updated.` });
    } else {
      addBusinessPartner(data);
      toast({ title: 'Partner Added', description: `${data.name} has been added as a permanent partner.` });
    }
    setPartnerToEdit(null);
    resetPartner({ name: '', sharePercentage: 0, contact: '', area: '' });
  };

  const openEditDialog = (partner: BusinessPartner) => {
    setPartnerToEdit(partner);
    setPartnerValue('name', partner.name);
    setPartnerValue('sharePercentage', partner.sharePercentage);
    setPartnerValue('contact', partner.contact || '');
    setPartnerValue('area', (partner as any).area || '');
  }

  const handleDeletePartner = () => {
    if (!partnerToDelete) return;
    
    if (password !== '0200') {
      toast({ variant: 'destructive', title: 'Incorrect PIN', description: 'Verification failed. Incorrect PIN.' });
      return;
    }

    deleteBusinessPartner(partnerToDelete.id);
    toast({ title: 'Partner Deleted', description: `${partnerToDelete.name} has been removed.`});
    setPartnerToDelete(null);
    setPassword('');
  }

  const openTransactionDialog = (partner: BusinessPartner, type: 'Investment' | 'Withdrawal') => {
    setTransactionPartner(partner);
    resetInvestment({ partnerId: partner.id, amount: 0, notes: '', date: new Date(), type: type, pin: '' });
  };
  
  const partnerSummary = useMemo(() => {
    if (!isLoaded) return [];
    
    let filteredInvestments = investments;
    if (dateRange?.from) {
        const from = startOfDay(dateRange.from);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);
        filteredInvestments = investments.filter(inv => {
            const invDate = new Date(inv.timestamp);
            return isValid(invDate) && invDate >= from && invDate <= to;
        });
    }

    const summary = filteredInvestments.reduce((acc, curr) => {
        if (!acc[curr.partnerId]) {
            acc[curr.partnerId] = { investment: 0, withdrawal: 0 };
        }
        if (curr.type === 'Investment') acc[curr.partnerId].investment += curr.amount;
        else acc[curr.partnerId].withdrawal += curr.amount;

        return acc;
    }, {} as Record<string, { investment: number, withdrawal: number }>);
    
    return businessPartners.map(p => {
        const s = summary[p.id] || { investment: 0, withdrawal: 0 };
        return { 
            ...p, 
            investment: s.investment,
            withdrawal: s.withdrawal,
            profit: 0, // Placeholder
            loss: 0, // Placeholder
        }
    }).sort((a,b) => b.sharePercentage - a.sharePercentage);

  }, [investments, businessPartners, isLoaded, dateRange]);

  const totalSharePercentage = useMemo(() => businessPartners.reduce((sum, p) => sum + p.sharePercentage, 0), [businessPartners]);

  return (
    <div className="p-4 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
                <p className="text-sm text-muted-foreground">Home &gt; Partners</p>
            </div>
            <div className="flex items-center gap-2">
                <div className="relative w-full max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search..." className="pl-10" />
                </div>
                 <Avatar>
                    <AvatarImage src="https://github.com/shadcn.png" />
                    <AvatarFallback>CN</AvatarFallback>
                </Avatar>
            </div>
        </div>

        <Card className="max-w-xs">
            <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                    Total Company Shares <Clock className="w-4 h-4 text-muted-foreground"/>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-2xl font-bold">{totalSharePercentage.toFixed(2)}%</p>
                <p className="text-xs text-muted-foreground">Total percentage allocated to partners</p>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <CardTitle>Partner Percentages</CardTitle>
                        <CardDescription>Management of partner shares, profits, and losses in the mining venture.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Select defaultValue="january">
                            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="january">January</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select defaultValue="2026">
                            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="2026">2026</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline"><Banknote className="mr-2"/>Calculate P&L</Button>
                        <Button variant="outline"><Upload className="mr-2"/>Sell Share</Button>
                        <Button onClick={() => setPartnerToEdit({} as BusinessPartner)}><PlusCircle className="mr-2"/>Add Partner</Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {isLoaded && partnerSummary.map(p => (
                    <Card key={p.id} className="flex flex-col">
                        <CardHeader>
                            <div className="flex items-start gap-4">
                                <Avatar className="w-16 h-16 border">
                                    <AvatarImage src={`https://i.pravatar.cc/150?u=${p.id}`} />
                                    <AvatarFallback>{p.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                    <CardTitle className="text-lg">{p.name}</CardTitle>
                                    <CardDescription>{(p as any).area || 'Mianwali'}</CardDescription>
                                    <p className="text-xs text-muted-foreground">Ownership: {p.sharePercentage.toFixed(2)}%</p>
                                </div>
                                <div className="flex">
                                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(p)}><Edit className="w-4 h-4"/></Button>
                                    <Button variant="ghost" size="icon" onClick={() => setPartnerToDelete(p)}><Trash2 className="w-4 h-4 text-destructive"/></Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-grow space-y-4">
                            <div>
                                <Label className="text-xs">Ownership Percentage</Label>
                                <div className="flex items-center gap-2">
                                    <Progress value={p.sharePercentage} className="h-2"/>
                                    <span className="font-semibold text-sm">{p.sharePercentage.toFixed(2)}%</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <Card className="p-3 bg-blue-50 dark:bg-blue-900/20">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-blue-100 rounded-md"><Banknote className="w-4 h-4 text-blue-600"/></div>
                                        <div>
                                            <p className="text-xs text-blue-800 dark:text-blue-300">Investment</p>
                                            <p className="font-bold text-blue-900 dark:text-blue-200">PKR {p.investment.toLocaleString()}</p>
                                        </div>
                                    </div>
                                </Card>
                                 <Card className="p-3 bg-purple-50 dark:bg-purple-900/20">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-purple-100 rounded-md"><Upload className="w-4 h-4 text-purple-600"/></div>
                                        <div>
                                            <p className="text-xs text-purple-800 dark:text-purple-300">Withdrawn</p>
                                            <p className="font-bold text-purple-900 dark:text-purple-200">PKR {p.withdrawal.toLocaleString()}</p>
                                        </div>
                                    </div>
                                </Card>
                                 <Card className="p-3 bg-green-50 dark:bg-green-900/20">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-green-100 rounded-md"><TrendingUp className="w-4 h-4 text-green-600"/></div>
                                        <div>
                                            <p className="text-xs text-green-800 dark:text-green-300">Profit</p>
                                            <p className="font-bold text-green-900 dark:text-green-200">PKR {p.profit.toLocaleString()}</p>
                                        </div>
                                    </div>
                                </Card>
                                 <Card className="p-3 bg-red-50 dark:bg-red-900/20">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-red-100 rounded-md"><TrendingDown className="w-4 h-4 text-red-600"/></div>
                                        <div>
                                            <p className="text-xs text-red-800 dark:text-red-300">Loss</p>
                                            <p className="font-bold text-red-900 dark:text-red-200">PKR {p.loss.toLocaleString()}</p>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        </CardContent>
                        <CardFooter className="grid grid-cols-2 gap-2">
                            <Button variant="outline" onClick={() => openTransactionDialog(p, 'Investment')}><Banknote className="mr-2"/>Invest</Button>
                            <Button variant="outline" onClick={() => openTransactionDialog(p, 'Withdrawal')}><Upload className="mr-2"/>Withdraw</Button>
                        </CardFooter>
                    </Card>
                ))}
                 {!isLoaded && Array.from({length:3}).map((_, i) => <Card key={i}><CardHeader><div className="h-16 w-full bg-muted animate-pulse rounded-md"/></CardHeader><CardContent><div className="h-32 w-full bg-muted animate-pulse rounded-md"/></CardContent></Card>)}
            </CardContent>
        </Card>
      
      {/* Dialog for Add/Edit Partner */}
      <Dialog open={!!partnerToEdit} onOpenChange={(isOpen) => { if (!isOpen) { setPartnerToEdit(null); resetPartner(); } }}>
        <DialogContent>
            <form onSubmit={handleSubmitPartner(onPartnerSubmit)}>
                <DialogHeader>
                    <DialogTitle>{partnerToEdit?.id ? 'Edit Partner' : 'Add New Partner'}</DialogTitle>
                    <DialogDescription>
                        {partnerToEdit?.id ? 'Update the details for this partner.' : 'Add a new permanent partner to manage their investments and shares.'}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Partner Name</Label>
                        <Input id="name" {...registerPartner('name')} />
                        {partnerErrors.name && <p className="text-sm text-destructive">{partnerErrors.name.message}</p>}
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="contact" className="flex items-center gap-2"><Phone className="w-4 h-4"/> Contact Number (Optional)</Label>
                        <Input id="contact" {...registerPartner('contact')} placeholder="e.g. 03001234567" />
                        {partnerErrors.contact && <p className="text-sm text-destructive">{partnerErrors.contact.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="area">Area (Optional)</Label>
                        <Input id="area" {...registerPartner('area')} placeholder="e.g., Chidro Khel, Mianwali" />
                        {partnerErrors.area && <p className="text-sm text-destructive">{partnerErrors.area.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="sharePercentage" className="flex items-center gap-2"><Percent className="w-4 h-4"/> Share Percentage</Label>
                        <Input id="sharePercentage" type="number" {...registerPartner('sharePercentage')} step="0.01" />
                        {partnerErrors.sharePercentage && <p className="text-sm text-destructive">{partnerErrors.sharePercentage.message}</p>}
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => { setPartnerToEdit(null); resetPartner(); }}>Cancel</Button>
                    <Button type="submit">{partnerToEdit?.id ? 'Save Changes' : 'Add Partner'}</Button>
                </DialogFooter>
            </form>
        </DialogContent>
      </Dialog>
      
      {/* Dialog for Invest/Withdraw */}
      <Dialog open={!!transactionPartner} onOpenChange={(isOpen) => { if (!isOpen) setTransactionPartner(null)}}>
        <DialogContent>
          <form onSubmit={handleSubmitInvestment(onInvestmentSubmit)}>
            <DialogHeader>
              <DialogTitle>New Capital Transaction for {transactionPartner?.name}</DialogTitle>
              <DialogDescription>Record a new investment or withdrawal.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Type</Label>
                 <Controller
                  name="type"
                  control={controlInvestment}
                  render={({ field }) => (
                     <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Investment">Investment</SelectItem>
                            <SelectItem value="Withdrawal">Withdrawal</SelectItem>
                        </SelectContent>
                    </Select>
                  )}
                />
                {investmentErrors.type && <p className="text-sm text-destructive">{investmentErrors.type.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount (PKR)</Label>
                <Input id="amount" type="number" {...registerInvestment('amount')} placeholder="e.g., 100000" step="0.01" />
                {investmentErrors.amount && <p className="text-sm text-destructive">{investmentErrors.amount.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                 <div className="relative">
                    <Textarea id="notes" {...registerInvestment('notes')} placeholder="e.g., Initial capital" className="pr-12"/>
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
                 </div>
              </div>
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
              
              <div className="space-y-2">
                <Label>Date</Label>
                <Controller
                  name="date"
                  control={controlInvestment}
                  render={({ field }) => (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? format(field.value, "dd-MMM-yyyy") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent>
                    </Popover>
                  )}
                />
                {investmentErrors.date && <p className="text-sm text-destructive">{investmentErrors.date.message}</p>}
              </div>

              <div className="space-y-2 border-t pt-4">
                  <Label htmlFor="pin" className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary"/> Security PIN</Label>
                  <Input id="pin" type="password" {...registerInvestment('pin')} placeholder="Enter 4-digit PIN" maxLength={4} />
                  {investmentErrors.pin && <p className="text-sm text-destructive">{investmentErrors.pin.message}</p>}
              </div>
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setTransactionPartner(null)}>Cancel</Button>
                <Button type="submit">Record Transaction</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Dialog for Delete Confirmation */}
      <AlertDialog open={!!partnerToDelete} onOpenChange={(isOpen) => { if (!isOpen) { setPartnerToDelete(null); setPassword(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the partner: <br />
              <strong className="font-medium text-foreground">{partnerToDelete?.name}</strong>.
              All associated investment transactions will remain but will no longer be linked to a permanent partner.
              <div className="mt-4 space-y-2">
                <Label htmlFor="delete-pin-partner">Enter PIN to confirm deletion:</Label>
                <Input
                  id="delete-pin-partner"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter 4-digit PIN"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setPartnerToDelete(null); setPassword(''); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePartner} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, delete partner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
