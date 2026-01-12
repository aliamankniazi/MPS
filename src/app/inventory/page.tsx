
'use client';

import * as React from 'react';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Droplets, PlusCircle, Edit, Trash2, AlertTriangle } from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import type { FuelType, Product } from '@/lib/types';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';


const FUEL_TYPES: FuelType[] = ['Unleaded', 'Premium', 'Diesel'];

const MAX_CAPACITY: Record<FuelType, number> = {
  'Unleaded': 20000,
  'Premium': 10000,
  'Diesel': 25000,
};

const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  price: z.coerce.number().min(0, 'Price must be non-negative'),
  unit: z.string().min(1, 'Unit is required'),
  category: z.enum(['Main Product', 'Supplementary Product'], { required_error: 'Category is required' }),
});
type ProductFormValues = z.infer<typeof productSchema>;

export default function InventoryPage() {
  const {
    fuelStock,
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    isLoaded
  } = useDatabase();
  const { toast } = useToast();
  const [productToEdit, setProductToEdit] = React.useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = React.useState<Product | null>(null);

  const {
      register: registerProduct,
      handleSubmit: handleSubmitProduct,
      reset: resetProduct,
      control: controlProduct,
      setValue: setProductValue,
      formState: { errors: productErrors }
  } = useForm<ProductFormValues>({
      resolver: zodResolver(productSchema)
  });
  
  React.useEffect(() => {
      if (productToEdit) {
          setProductValue('name', productToEdit.name);
          setProductValue('price', productToEdit.price);
          setProductValue('unit', productToEdit.unit);
          setProductValue('category', productToEdit.category);
      }
  }, [productToEdit, setProductValue]);

  const onProductSubmit: SubmitHandler<ProductFormValues> = (data) => {
    if (productToEdit) {
        updateProduct(productToEdit.id, data);
        toast({ title: "Product Updated", description: "The product has been saved."});
    } else {
        addProduct(data);
        toast({ title: "Product Added", description: `${data.name} has been added.`});
    }
    setProductToEdit(null);
    resetProduct({name: '', price: 0, unit: '', category: undefined});
  };
  
  const handleDeleteProduct = () => {
      if (!productToDelete) return;
      deleteProduct(productToDelete.id);
      toast({ title: 'Product Deleted', description: `${productToDelete.name} has been removed.`});
      setProductToDelete(null);
  }

  const getProgressColor = (value: number) => {
    if (value < 15) return 'bg-red-500';
    if (value < 40) return 'bg-yellow-500';
    return 'bg-primary';
  };

  return (
    <>
    <div className="p-4 md:p-8 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package /> Fuel Inventory
          </CardTitle>
          <CardDescription>
            Current stock levels for all fuel types.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isLoaded ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))
          ) : FUEL_TYPES.length > 0 ? (
            <div className="grid gap-8 sm:grid-cols-1 lg:grid-cols-3">
              {FUEL_TYPES.map(fuel => {
                const currentStock = fuelStock[fuel] || 0;
                const maxStock = MAX_CAPACITY[fuel];
                const percentage = Math.min((currentStock / maxStock) * 100, 100);
                
                return (
                   <Card key={fuel} className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                           <Droplets className="w-6 h-6 text-primary" /> {fuel}
                        </CardTitle>
                    </CardHeader>
                     <CardContent className="flex-grow space-y-4">
                        <div className="text-center">
                            <p className="text-3xl font-bold tracking-tighter">
                                {currentStock.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-muted-foreground">Litres in Stock</p>
                        </div>
                        <div className="space-y-2">
                           <Progress value={percentage} className="h-3 [&>div]:bg-primary" />
                           <div className="flex justify-between text-xs text-muted-foreground">
                               <span>0 L</span>
                               <span>{percentage.toFixed(0)}%</span>
                               <span>{maxStock.toLocaleString()} L</span>
                           </div>
                        </div>
                     </CardContent>
                   </Card>
                );
              })}
            </div>
          ) : (
             <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
                <Package className="w-16 h-16" />
                <h3 className="text-xl font-semibold">No Inventory Data</h3>
                <p>Fuel stock levels are not available.</p>
             </div>
          )}
          <div className="mt-6 text-center text-sm text-muted-foreground">
             <p>Need to correct the stock levels? <Button variant="link" asChild className="p-0 h-auto"><Link href="/stock-adjustment">Adjust inventory manually</Link></Button>.</p>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2"><PlusCircle /> Add New Product</CardTitle>
            <CardDescription>Add a new main or supplementary product to your catalog.</CardDescription>
        </CardHeader>
         <CardContent>
             <form onSubmit={handleSubmitProduct(onProductSubmit)} className="space-y-4">
                 <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div className="space-y-2">
                        <Label htmlFor="productName">Product Name</Label>
                        <Input id="productName" {...registerProduct('name')} placeholder="e.g., Engine Oil" />
                        {productErrors.name && <p className="text-sm text-destructive">{productErrors.name.message}</p>}
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="productPrice">Price</Label>
                        <Input id="productPrice" type="number" step="0.01" {...registerProduct('price')} placeholder="e.g., 1200" />
                        {productErrors.price && <p className="text-sm text-destructive">{productErrors.price.message}</p>}
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="productUnit">Unit</Label>
                        <Input id="productUnit" {...registerProduct('unit')} placeholder="e.g., Pcs, Ltr, Kg" />
                        {productErrors.unit && <p className="text-sm text-destructive">{productErrors.unit.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label>Category</Label>
                        <Controller
                            name="category"
                            control={controlProduct}
                            render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Main Product">Main Product</SelectItem>
                                        <SelectItem value="Supplementary Product">Supplementary Product</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        />
                        {productErrors.category && <p className="text-sm text-destructive">{productErrors.category.message}</p>}
                    </div>
                 </div>
                 <Button type="submit">Add Product</Button>
             </form>
             <Separator className="my-6" />
             <h4 className="text-md font-medium mb-4">Product Catalog</h4>
             <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Product Name</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Price</TableHead>
                            <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoaded && products && products.length > 0 ? products.map(p => (
                            <TableRow key={p.id}>
                                <TableCell className="font-medium">{p.name}</TableCell>
                                <TableCell>{p.category}</TableCell>
                                <TableCell className="text-right font-mono">
                                    {typeof p.price === 'number' ? `PKR ${p.price.toFixed(2)} / ${p.unit}` : 'N/A'}
                                </TableCell>
                                <TableCell className="text-center">
                                    <Button variant="ghost" size="icon" title="Edit Product" onClick={() => setProductToEdit(p)}><Edit className="w-4 h-4" /></Button>
                                    <Button variant="ghost" size="icon" title="Delete Product" className="text-destructive" onClick={() => setProductToDelete(p)}><Trash2 className="w-4 h-4" /></Button>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    {isLoaded ? 'No products added yet.' : 'Loading products...'}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
             </div>
         </CardContent>
     </Card>
    </div>

    <Dialog open={!!productToEdit} onOpenChange={(isOpen) => {if(!isOpen) setProductToEdit(null)}}>
        <DialogContent>
            <form onSubmit={handleSubmitProduct(onProductSubmit)}>
                <DialogHeader>
                    <DialogTitle>Edit Product</DialogTitle>
                    <DialogDescription>Update the details for this product.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                     <div className="space-y-2">
                        <Label htmlFor="editProductName">Product Name</Label>
                        <Input id="editProductName" {...registerProduct('name')} />
                        {productErrors.name && <p className="text-sm text-destructive">{productErrors.name.message}</p>}
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="editProductPrice">Price</Label>
                        <Input id="editProductPrice" type="number" step="0.01" {...registerProduct('price')} />
                        {productErrors.price && <p className="text-sm text-destructive">{productErrors.price.message}</p>}
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="editProductUnit">Unit</Label>
                        <Input id="editProductUnit" {...registerProduct('unit')} />
                        {productErrors.unit && <p className="text-sm text-destructive">{productErrors.unit.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label>Category</Label>
                        <Controller
                            name="category"
                            control={controlProduct}
                            render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Main Product">Main Product</SelectItem>
                                        <SelectItem value="Supplementary Product">Supplementary Product</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        />
                         {productErrors.category && <p className="text-sm text-destructive">{productErrors.category.message}</p>}
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setProductToEdit(null)}>Cancel</Button>
                    <Button type="submit">Save Changes</Button>
                </DialogFooter>
            </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!productToDelete} onOpenChange={(isOpen) => !isOpen && setProductToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the product: <br />
              <strong className="font-medium text-foreground">{productToDelete?.name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProduct} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, delete product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
