
'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Settings, Trash2, AlertTriangle, Droplets, BookText, Car, User, Truck, UserPlus, Package, Edit, PlusCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import type { FuelType, Supplier, Product } from '@/lib/types';
import { useDatabase } from '@/hooks/use-database';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogHeader, DialogFooter, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


const FUEL_TYPES: FuelType[] = ['Unleaded', 'Premium', 'Diesel'];

const supplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required'),
  contact: z.string().optional(),
  vehicleNumber: z.string().optional(),
  driverName: z.string().optional(),
  helperName: z.string().optional(),
});
type SupplierFormValues = z.infer<typeof supplierSchema>;

const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  price: z.coerce.number().min(0, 'Price must be non-negative'),
  unit: z.string().min(1, 'Unit is required'),
  category: z.enum(['Main Product', 'Supplementary Product'], { required_error: 'Category is required' }),
});
type ProductFormValues = z.infer<typeof productSchema>;


export default function SettingsPage() {
  const { 
    clearAllData,
    fuelPrices, 
    updateFuelPrice, 
    suppliers, 
    addSupplier, 
    deleteSupplier,
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    isLoaded 
  } = useDatabase();
  const { toast } = useToast();
  const [supplierToDelete, setSupplierToDelete] = React.useState<Supplier | null>(null);
  const [productToEdit, setProductToEdit] = React.useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = React.useState<Product | null>(null);


  const { 
    register: registerSupplier, 
    handleSubmit: handleSubmitSupplier, 
    reset: resetSupplier, 
    formState: { errors: supplierErrors } 
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
  });
  
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

  const allUnits = React.useMemo(() => {
    const unitsFromProducts = products.map(p => p.unit).filter(Boolean);
    return [...new Set(['Ltr', 'Pcs', 'Kg', 'Box', 'Bottle', ...unitsFromProducts])];
  }, [products]);

  React.useEffect(() => {
      if (productToEdit) {
          setProductValue('name', productToEdit.name);
          setProductValue('price', productToEdit.price);
          setProductValue('unit', productToEdit.unit);
          setProductValue('category', productToEdit.category);
      }
  }, [productToEdit, setProductValue]);


  const handleClearData = () => {
    clearAllData();
    toast({
      title: "Data Cleared",
      description: "All application data has been removed.",
    });
  };

  const handlePriceChange = (fuelType: FuelType, value: string) => {
    const price = parseFloat(value);
    if (!isNaN(price)) {
      updateFuelPrice(fuelType, price);
    }
  };
  
  const onSupplierSubmit: SubmitHandler<SupplierFormValues> = (data) => {
    addSupplier(data);
    toast({
      title: 'Supplier Added',
      description: `${data.name} has been added to your supplier list.`,
    });
    resetSupplier();
  };
  
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

  const handleDeleteSupplier = () => {
    if (!supplierToDelete) return;
    deleteSupplier(supplierToDelete.id);
    toast({
        title: "Supplier Deleted",
        description: `${supplierToDelete.name} has been removed from your list.`,
    });
    setSupplierToDelete(null);
  }
  
  const handleDeleteProduct = () => {
      if (!productToDelete) return;
      deleteProduct(productToDelete.id);
      toast({ title: 'Product Deleted', description: `${productToDelete.name} has been removed.`});
      setProductToDelete(null);
  }

  return (
    <>
    <div className="p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings /> Settings
          </CardTitle>
          <CardDescription>Customize application settings, fuel prices, and suppliers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
        
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2"><Truck /> Supplier Management</h3>
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2"><UserPlus /> Add New Supplier</CardTitle>
                    <CardDescription>Add a new supplier to your permanent list.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmitSupplier(onSupplierSubmit)} className="space-y-4">
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="supplierName">Supplier Name</Label>
                                <Input id="supplierName" {...registerSupplier('name')} placeholder="e.g., PSO" />
                                {supplierErrors.name && <p className="text-sm text-destructive">{supplierErrors.name.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="supplierContact">Contact (Optional)</Label>
                                <Input id="supplierContact" {...registerSupplier('contact')} placeholder="e.g., 0300-1234567" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="vehicleNumber">Vehicle Number (Optional)</Label>
                                <Input id="vehicleNumber" {...registerSupplier('vehicleNumber')} placeholder="e.g., TKA-123" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="driverName">Driver's Name (Optional)</Label>
                                <Input id="driverName" {...registerSupplier('driverName')} placeholder="e.g., Ali Khan" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="helperName">Helper's Name (Optional)</Label>
                                <Input id="helperName" {...registerSupplier('helperName')} placeholder="e.g., Ahmed" />
                            </div>
                        </div>
                        <Button type="submit">Add Supplier</Button>
                    </form>
                    <Separator className="my-6" />
                    <h4 className="text-md font-medium mb-4">Existing Suppliers</h4>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Supplier</TableHead>
                                    <TableHead>Vehicle / Crew</TableHead>
                                    <TableHead className="text-center">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoaded && suppliers.length > 0 ? suppliers.map(s => (
                                    <TableRow key={s.id}>
                                        <TableCell>
                                            <div className="font-medium">{s.name}</div>
                                            <div className="text-sm text-muted-foreground">{s.contact || 'N/A'}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2 text-sm"><Car className="w-4 h-4"/> {s.vehicleNumber || 'N/A'}</div>
                                            <div className="flex items-center gap-2 text-sm"><User className="w-4 h-4"/> {s.driverName || 'N/A'} (Driver)</div>
                                            <div className="flex items-center gap-2 text-sm"><User className="w-4 h-4"/> {s.helperName || 'N/A'} (Helper)</div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Button asChild variant="ghost" size="icon" title="View Ledger">
                                               <Link href={`/customers/${s.id}/ledger`}>
                                                 <BookText className="w-5 h-5" />
                                               </Link>
                                            </Button>
                                            <Button variant="ghost" size="icon" title="Delete Supplier" onClick={() => setSupplierToDelete(s)}>
                                                <Trash2 className="w-5 h-5 text-destructive" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center">
                                            {isLoaded ? 'No suppliers added yet.' : 'Loading suppliers...'}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
          </div>
        
          <Separator />
        
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Fuel Prices</h3>
            <div className="space-y-4">
              {isLoaded && FUEL_TYPES.map(fuel => (
                <div key={fuel} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <Label htmlFor={`${fuel}-price`} className="flex items-center gap-2"><Droplets className="w-4 h-4" /> {fuel} Price (PKR/L)</Label>
                    <p className="text-sm text-muted-foreground">
                      Set the price per litre for {fuel}.
                    </p>
                  </div>
                  <Input 
                    id={`${fuel}-price`} 
                    type="number" 
                    value={fuelPrices[fuel] || ''} 
                    onChange={(e) => handlePriceChange(fuel, e.target.value)}
                    className="w-28" 
                    step="0.01"
                  />
                </div>
              ))}
              {!isLoaded && Array.from({length: 3}).map((_, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border p-4">
                  <div className='space-y-2'>
                    <div className="h-6 w-48 bg-muted rounded-md animate-pulse" />
                    <div className="h-4 w-64 bg-muted rounded-md animate-pulse" />
                  </div>
                  <div className="w-28 h-10 bg-muted rounded-md animate-pulse" />
                </div>
              ))}
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2"><Package/> Product Management</h3>
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
                                <Controller
                                    name="unit"
                                    control={controlProduct}
                                    render={({ field }) => (
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <SelectTrigger><SelectValue placeholder="Select unit..." /></SelectTrigger>
                                            <SelectContent>
                                                {allUnits.map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
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

          <Separator />

          <div className="space-y-4">
            <h3 className="text-lg font-medium">Appearance</h3>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label>Theme</Label>
                <p className="text-sm text-muted-foreground">
                  Switch between light and dark mode.
                </p>
              </div>
              <ThemeToggle />
            </div>
          </div>
          
          <Separator />

          <div className="space-y-4">
             <h3 className="text-lg font-medium text-destructive">Danger Zone</h3>
            <div className="flex items-center justify-between rounded-lg border border-destructive/50 p-4">
              <div>
                <Label htmlFor="clear-data" className="text-destructive">Clear All Data</Label>
                <p className="text-sm text-muted-foreground">
                  This will permanently delete all application data. This action cannot be undone.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" id="clear-data">
                    <Trash2 className="mr-2 h-4 w-4" /> Clear Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete all your application data from this device.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearData}>
                      Yes, delete all data
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <AlertDialog open={!!supplierToDelete} onOpenChange={(isOpen) => !isOpen && setSupplierToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the supplier: <br />
              <strong className="font-medium text-foreground">{supplierToDelete?.name}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSupplier} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, delete supplier
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
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
                        <Controller
                            name="unit"
                            control={controlProduct}
                            render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {allUnits.map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )}
                        />
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

    </div>
    </>
  );
}

    
