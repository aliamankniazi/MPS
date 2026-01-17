
'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDatabase } from '@/hooks/use-database';
import Link from 'next/link';
import { Award, BookText, Search } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { startOfDay, endOfDay, isValid } from 'date-fns';


interface CustomerRanking {
    id: string;
    name: string;
    totalSales: number;
    transactionCount: number;
}

export default function TopCustomersPage() {
    const { transactions, isLoaded, dateRange } = useDatabase();
    const [searchTerm, setSearchTerm] = useState('');

    const customerRankings = useMemo(() => {
        if (!isLoaded) return [];

        let filteredTransactions = transactions;
        if (dateRange?.from) {
            const from = startOfDay(dateRange.from);
            const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
            filteredTransactions = transactions.filter(tx => {
                const txDate = new Date(tx.timestamp);
                return isValid(txDate) && txDate >= from && txDate <= to;
            });
        }

        const customerData = filteredTransactions.reduce((acc, tx) => {
            if (tx.customerId && tx.customerName && tx.customerName !== 'Walk-in Customer') {
                if (!acc[tx.customerId]) {
                    acc[tx.customerId] = {
                        id: tx.customerId,
                        name: tx.customerName,
                        totalSales: 0,
                        transactionCount: 0,
                    };
                }
                acc[tx.customerId].totalSales += tx.totalAmount;
                acc[tx.customerId].transactionCount++;
            }
            return acc;
        }, {} as Record<string, CustomerRanking>);

        return Object.values(customerData).sort((a, b) => b.totalSales - a.totalSales);

    }, [isLoaded, transactions, dateRange]);
    
    const filteredRankings = useMemo(() => {
        if (!searchTerm) return customerRankings;
        return customerRankings.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [customerRankings, searchTerm]);


    return (
        <div className="p-4 md:p-8">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                        <Award /> Top Customers Report
                    </CardTitle>
                    <CardDescription>
                        A ranked list of all customers by total sales value.
                    </CardDescription>
                     <div className="relative w-full max-w-sm pt-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by customer name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-16">Rank</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead className="text-right">Total Sales (PKR)</TableHead>
                                    <TableHead className="text-center">No. of Transactions</TableHead>
                                    <TableHead className="text-center">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoaded ? filteredRankings.map((customer, index) => (
                                    <TableRow key={customer.id}>
                                        <TableCell className="font-bold text-lg text-center">{index + 1}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar>
                                                    <AvatarFallback>{customer.name.charAt(0)}</AvatarFallback>
                                                </Avatar>
                                                <span className="font-medium">{customer.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-base font-semibold">
                                            {customer.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-center font-mono">{customer.transactionCount}</TableCell>
                                        <TableCell className="text-center">
                                            <Button asChild variant="ghost" size="icon" title="View Ledger">
                                                <Link href={`/customers/${customer.id}/ledger`}>
                                                    <BookText className="w-4 h-4" />
                                                </Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    Array.from({ length: 10 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell colSpan={5} className="p-4">
                                                <div className="h-6 bg-muted rounded animate-pulse"></div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                                {isLoaded && filteredRankings.length === 0 && (
                                     <TableRow>
                                        <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">
                                            {searchTerm ? 'No matching customers found.' : 'No customer sales have been recorded yet.'}
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
