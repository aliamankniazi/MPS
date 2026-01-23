
'use client';

import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { BookKey, List, PlusCircle, Edit, Trash2, AlertTriangle, Search } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useState, useEffect, useMemo } from 'react';
import type { DictionaryEntry } from '@/lib/types';
import { Textarea } from '@/components/ui/textarea';

const dictionarySchema = z.object({
  key: z.string().min(1, 'Key is required'),
  value: z.string().min(1, 'Value is required'),
  description: z.string().optional(),
});

type DictionaryFormValues = z.infer<typeof dictionarySchema>;

export default function DictionaryPage() {
  const { dictionary, addDictionaryEntry, updateDictionaryEntry, deleteDictionaryEntry } = useDatabase();
  const { toast } = useToast();
  
  const [entryToEdit, setEntryToEdit] = useState<DictionaryEntry | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<DictionaryEntry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<DictionaryFormValues>({
    resolver: zodResolver(dictionarySchema),
  });

  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEdit, setValue: setEditValue, formState: { errors: editErrors } } = useForm<DictionaryFormValues>({
    resolver: zodResolver(dictionarySchema),
  });

  const filteredDictionary = useMemo(() => {
    if (!searchTerm) return dictionary;
    return dictionary.filter(entry => 
        entry.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.value.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (entry.description && entry.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [dictionary, searchTerm]);

  const onAddSubmit: SubmitHandler<DictionaryFormValues> = (data) => {
    addDictionaryEntry(data);
    toast({
      title: 'Dictionary Entry Added',
      description: `Entry for "${data.key}" has been added successfully.`,
    });
    reset({ key: '', value: '', description: '' });
  };
  
  const onEditSubmit: SubmitHandler<DictionaryFormValues> = (data) => {
    if (!entryToEdit) return;
    updateDictionaryEntry(entryToEdit.id, data);
    toast({
        title: 'Entry Updated',
        description: "The dictionary entry has been saved."
    });
    setEntryToEdit(null);
  };

  const handleDeleteEntry = () => {
    if (!entryToDelete) return;
    deleteDictionaryEntry(entryToDelete.id);
    toast({
        title: 'Entry Deleted',
        description: `Entry for "${entryToDelete.key}" has been removed.`,
    });
    setEntryToDelete(null);
  };

  useEffect(() => {
    if (entryToEdit) {
      setEditValue('key', entryToEdit.key);
      setEditValue('value', entryToEdit.value);
      setEditValue('description', entryToEdit.description || '');
    } else {
      resetEdit();
    }
  }, [entryToEdit, setEditValue, resetEdit]);

  return (
    <>
    <div className="p-4 md:p-8 grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlusCircle /> New Dictionary Entry
            </CardTitle>
            <CardDescription>Add a new key-value pair to the dictionary.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onAddSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="key">Key</Label>
                <Input id="key" {...register('key')} placeholder="e.g., app_title" />
                {errors.key && <p className="text-sm text-destructive">{errors.key.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="value">Value</Label>
                <Input id="value" {...register('value')} placeholder="e.g., My Awesome App" />
                {errors.value && <p className="text-sm text-destructive">{errors.value.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea id="description" {...register('description')} placeholder="e.g., Used as the main title in the header" />
              </div>

              <Button type="submit" className="w-full">Add Entry</Button>
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
                    <List /> Dictionary
                    </CardTitle>
                    <CardDescription>
                    A record of all key-value pairs.
                    </CardDescription>
                </div>
                 <div className="relative w-full max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by key, value, or description..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredDictionary.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDictionary.map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono font-medium">{entry.key}</TableCell>
                        <TableCell>{entry.value}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.description}</TableCell>
                        <TableCell className="text-center space-x-0">
                           <Button variant="ghost" size="icon" title="Edit Entry" onClick={() => setEntryToEdit(entry)}>
                                <Edit className="w-4 h-4" />
                           </Button>
                           <Button variant="ghost" size="icon" title="Delete Entry" className="text-destructive hover:text-destructive" onClick={() => setEntryToDelete(entry)}>
                                <Trash2 className="w-4 h-4" />
                           </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
                <BookKey className="w-16 h-16" />
                <h3 className="text-xl font-semibold">
                    {searchTerm ? 'No Matching Entries' : 'Dictionary is Empty'}
                </h3>
                <p>
                    {searchTerm ? 'Try a different search term.' : 'Use the form to add your first dictionary entry.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    
    <Dialog open={!!entryToEdit} onOpenChange={(isOpen) => !isOpen && setEntryToEdit(null)}>
        <DialogContent>
            <form onSubmit={handleSubmitEdit(onEditSubmit)}>
                <DialogHeader>
                    <DialogTitle>Edit Dictionary Entry</DialogTitle>
                    <DialogDescription>
                        Update the details for this entry.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="edit-key">Key</Label>
                        <Input id="edit-key" {...registerEdit('key')} />
                        {editErrors.key && <p className="text-sm text-destructive">{editErrors.key.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit-value">Value</Label>
                        <Input id="edit-value" {...registerEdit('value')} />
                        {editErrors.value && <p className="text-sm text-destructive">{editErrors.value.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit-description">Description</Label>
                        <Textarea id="edit-description" {...registerEdit('description')} />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setEntryToEdit(null)}>Cancel</Button>
                    <Button type="submit">Save Changes</Button>
                </DialogFooter>
            </form>
        </DialogContent>
    </Dialog>

    <AlertDialog open={!!entryToDelete} onOpenChange={(isOpen) => !isOpen && setEntryToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the entry: <br />
            <strong className="font-medium text-foreground">{entryToDelete?.key}</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteEntry} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Yes, delete entry
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
