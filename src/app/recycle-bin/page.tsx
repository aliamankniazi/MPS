
'use client';

import React, { useState } from 'react';
import { useDatabase } from '@/hooks/use-database';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Trash2, History, AlertTriangle, RotateCw } from 'lucide-react';
import { format } from 'date-fns';
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
import type { RecycledItem } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export default function RecycleBinPage() {
    const { recycleBin, restoreFromRecycleBin, deletePermanently, isLoaded } = useDatabase();
    const [itemToDelete, setItemToDelete] = useState<RecycledItem | null>(null);
    const { toast } = useToast();

    const handleRestore = async (item: RecycledItem) => {
        try {
            await restoreFromRecycleBin(item);
            toast({
                title: 'Item Restored',
                description: 'The item has been successfully restored.',
            });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error Restoring',
                description: 'Could not restore the item. Please try again.',
            });
        }
    };
    
    const handlePermanentDelete = async () => {
        if (!itemToDelete) return;
        try {
            await deletePermanently(itemToDelete.id);
            toast({
                title: 'Item Deleted Permanently',
                description: 'The item has been removed forever.',
            });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error Deleting',
                description: 'Could not permanently delete the item. Please try again.',
            });
        } finally {
            setItemToDelete(null);
        }
    };

    const getItemDescription = (item: RecycledItem): string => {
        const data = item.data;
        if (!data) return 'No details';
        if (data.description) return data.description;
        if (data.name) return data.name;
        if (data.customerName) return `For ${data.customerName}`;
        if (data.supplierName) return `For ${data.supplierName}`;
        if (data.fuelType) return `${data.volume || ''}L of ${data.fuelType}`;
        return `Entry ID: ${item.id.slice(0,6)}`;
    }
    
    const getItemType = (item: RecycledItem): string => {
        const path = item.originalPath.split('/')[0];
        // Simple mapping from collection name to a user-friendly type
        const typeMap: Record<string, string> = {
            transactions: 'Sale',
            purchases: 'Purchase',
            expenses: 'Expense',
            customers: 'Customer',
            suppliers: 'Supplier',
            customerPayments: 'Customer Payment',
            // Add more mappings as needed
        };
        return typeMap[path] || path;
    }


    return (
        <>
        <div className="p-4 md:p-8">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Trash2 /> Recycle Bin
                    </CardTitle>
                    <CardDescription>
                        Deleted items are stored here. You can restore them or delete them permanently.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Deleted On</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-center">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoaded && recycleBin.length > 0 ? (
                                    recycleBin.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">
                                                {format(new Date(item.deletedAt), 'PPp')}
                                            </TableCell>
                                            <TableCell>{getItemType(item)}</TableCell>
                                            <TableCell>{getItemDescription(item)}</TableCell>
                                            <TableCell className="text-center">
                                                <Button variant="ghost" size="icon" title="Restore" onClick={() => handleRestore(item)}>
                                                    <RotateCw className="w-4 h-4 text-green-600" />
                                                </Button>
                                                <Button variant="ghost" size="icon" title="Delete Permanently" onClick={() => setItemToDelete(item)}>
                                                    <Trash2 className="w-4 h-4 text-destructive" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                            {isLoaded ? 'The recycle bin is empty.' : 'Loading...'}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>

        <AlertDialog open={!!itemToDelete} onOpenChange={(isOpen) => !isOpen && setItemToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle /> Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the item.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handlePermanentDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Yes, delete permanently
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}
