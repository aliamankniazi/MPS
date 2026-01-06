
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Customer } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, set, push, remove } from 'firebase/database';

const DB_PATH = 'customers';

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
        setIsLoaded(true);
        return;
    }

    const customersRef = ref(db, DB_PATH);
    const unsubscribe = onValue(customersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const customersList: Customer[] = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })).sort((a,b) => a.name.localeCompare(b.name));
        setCustomers(customersList);
      } else {
        setCustomers([]);
      }
      setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []);


  const addCustomer = useCallback((customer: Omit<Customer, 'timestamp' | 'id'>): Customer => {
    const newCustomerWithTimestamp = { 
        ...customer, 
        timestamp: new Date().toISOString() 
    };

    if (db) {
        const newCustomerRef = push(ref(db, DB_PATH));
        set(newCustomerRef, newCustomerWithTimestamp);
        return { ...newCustomerWithTimestamp, id: newCustomerRef.key! };
    }
    
    const offlineCustomer = { ...newCustomerWithTimestamp, id: crypto.randomUUID() };
    setCustomers(prev => [...prev, offlineCustomer].sort((a,b) => a.name.localeCompare(b.name)));
    return offlineCustomer;

  }, []);
  
  const updateCustomer = useCallback((id: string, updatedDetails: Partial<Omit<Customer, 'id' | 'timestamp'>>) => {
    if (!db) return;
    
    const customerRef = ref(db, `${DB_PATH}/${id}`);
    const existingCustomer = customers.find(c => c.id === id);
    if (existingCustomer) {
        const updatedCustomer = { ...existingCustomer, ...updatedDetails };
        // We need to remove the id before setting it in firebase to avoid duplication
        const { id: _, ...dataToSet } = updatedCustomer;
        set(customerRef, dataToSet);
    }
  }, [customers]);

  const deleteCustomer = useCallback((id: string) => {
    if (!db) return;
    const customerRef = ref(db, `${DB_PATH}/${id}`);
    remove(customerRef);
  }, []);

  const clearCustomers = useCallback(() => {
    if (!db) return;
    const customersRef = ref(db, DB_PATH);
    remove(customersRef);
  }, []);

  return { customers, setCustomers, addCustomer, updateCustomer, deleteCustomer, clearCustomers, isLoaded };
}
