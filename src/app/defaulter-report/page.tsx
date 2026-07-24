'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDatabase } from '@/hooks/use-database';
import Link from 'next/link';
import { UserX, BookText, Search, Printer } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { format, isValid, formatDistanceToNow } from 'date-fns';

interface DefaulterInfo {
    id: string;
    name: string;
    contact?: string;
    balance: number;
    lastActivityDate: Date | null;
}

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

export default function DefaulterReportPage() {
    const { customers, transactions, customerPayments, cashAdvances, isLoaded } = useDatabase();
    const [searchTerm, setSearchTerm] = useState('');

    const defaulterList = useMemo(() => {
        if (!isLoaded) return [];

        const defaulters: DefaulterInfo[] = [];

        customers.forEach(customer => {
            const openingBalance = customer.openingBalance || 0;
            const totalSales = transactions.filter(tx => tx.customerId === customer.id).reduce((sum, tx) => sum + tx.totalAmount, 0);
            const totalCashAdvances = cashAdvances.filter(ca => ca.customerId === customer.id).reduce((sum, ca) => sum + ca.amount, 0);
            const totalPayments = customerPayments.filter(p => p.customerId === customer.id).reduce((sum, p) => sum + p.amount, 0);
            
            const balance = openingBalance + totalSales + totalCashAdvances - totalPayments;

            if (balance > 0) {
                const allEntries = [
                    ...transactions.filter(tx => tx.customerId === customer.id),
                    ...customerPayments.filter(p => p.customerId === customer.id),
                    ...cashAdvances.filter(ca => ca.customerId === customer.id)
                ];

                const lastActivityDate = allEntries.length > 0
                    ? allEntries
                        .map(e => new Date(e.timestamp))
                        .filter(d => isValid(d))
                        .sort((a,b) => b.getTime() - a.getTime())[0] || null
                    : null;
                
                defaulters.push({
                    id: customer.id,
                    name: customer.name,
                    contact: customer.contact,
                    balance,
                    lastActivityDate
                });
            }
        });
        
        return defaulters.sort((a,b) => b.balance - a.balance);

    }, [isLoaded, customers, transactions, customerPayments, cashAdvances]);

    const filteredDefaulters = useMemo(() => {
        if (!searchTerm) return defaulterList;
        return defaulterList.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [defaulterList, searchTerm]);

    const formatPhoneNumberForWhatsApp = (phone: string) => {
        if (!phone) return '';
        return phone.replace(/[^0-9]/g, '');
    }

    const generateWhatsAppMessage = (defaulter: DefaulterInfo) => {
        const message = `Dear ${defaulter.name}, this is a friendly reminder that your outstanding balance is PKR ${defaulter.balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}. Please clear it at your earliest convenience. Thank you, Mianwali Petroleum Service.`;
        return encodeURIComponent(message);
    }

    return (
        <div className="p-4 md:p-8">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-2xl">
                                <UserX /> Customer Defaulter Report
                            </CardTitle>
                            <CardDescription>
                                Customers with outstanding balances.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative w-full max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by customer name..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                             <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-16">Rank</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Last Activity</TableHead>
                                    <TableHead className="text-right">Outstanding Balance (PKR)</TableHead>
                                    <TableHead className="text-center">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoaded ? filteredDefaulters.map((defaulter, index) => (
                                    <TableRow key={defaulter.id}>
                                        <TableCell className="font-bold text-lg text-center">{index + 1}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar>
                                                    <AvatarFallback>{defaulter.name.charAt(0)}</AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="font-medium text-destructive">{defaulter.name}</p>
                                                    <p className="text-xs text-muted-foreground">{defaulter.contact || 'No contact'}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {defaulter.lastActivityDate ? (
                                                <div>
                                                    <p>{format(defaulter.lastActivityDate, 'dd-MMM-yyyy')}</p>
                                                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(defaulter.lastActivityDate, { addSuffix: true })}</p>
                                                </div>
                                            ) : 'No activity'}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-base font-semibold text-destructive">
                                            {defaulter.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-center">
                                          <div className="flex items-center justify-center gap-1">
                                            <Button asChild variant="ghost" size="icon" title="View Ledger">
                                                <Link href={`/customers/${defaulter.id}/ledger`}>
                                                    <BookText className="w-4 h-4" />
                                                </Link>
                                            </Button>
                                            {defaulter.contact && String(defaulter.contact).split(/[,\n]/).map((phone, idx) => {
                                                const cleaned = formatPhoneNumberForWhatsApp(phone.trim());
                                                if (!cleaned) return null;
                                                return (
                                                  <Button 
                                                    key={idx}
                                                    asChild 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="text-green-500 hover:text-green-600" 
                                                    title={`Message ${defaulter.name} on WhatsApp: ${phone.trim()}`}
                                                  >
                                                      <a href={`https://wa.me/${cleaned}?text=${generateWhatsAppMessage(defaulter)}`} target="_blank" rel="noopener noreferrer">
                                                          <WhatsAppIcon className="w-5 h-5" />
                                                      </a>
                                                  </Button>
                                                )
                                            })}
                                          </div>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell colSpan={5} className="p-4">
                                                <div className="h-6 bg-muted rounded animate-pulse"></div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                                {isLoaded && filteredDefaulters.length === 0 && (
                                     <TableRow>
                                        <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">
                                            {searchTerm ? 'No matching defaulters found.' : 'No customers with outstanding balances.'}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
