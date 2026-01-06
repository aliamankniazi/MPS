
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Supplier } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, push, remove, set } from 'firebase/database';

const DB_PATH = 'suppliers';

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
        setIsLoaded(true);
        return;
    }
    const suppliersRef = ref(db, DB_PATH);
    const unsubscribe = onValue(suppliersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const suppliersList: Supplier[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a,b) => a.name.localeCompare(b.name));
            setSuppliers(suppliersList);
        } else {
            setSuppliers([]);
        }
        setIsLoaded(true);
    });
    return () => unsubscribe();
  }, []);


  const addSupplier = useCallback((supplier: Omit<Supplier, 'id' | 'timestamp'>) => {
    if (!db) return;
    const newSupplierRef = push(ref(db, DB_PATH));
    set(newSupplierRef, { ...supplier, timestamp: new Date().toISOString() });
  }, []);
  
  const deleteSupplier = useCallback((id: string) => {
    if (!db) return;
    const supplierRef = ref(db, `${DB_PATH}/${id}`);
    remove(supplierRef);
  }, []);

  const clearSuppliers = useCallback(() => {
    if (!db) return;
    const suppliersRef = ref(db, DB_PATH);
    remove(suppliersRef);
  }, []);

  return { suppliers, addSupplier, deleteSupplier, clearSuppliers, isLoaded };
}
