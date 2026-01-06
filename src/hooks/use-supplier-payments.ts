
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SupplierPayment } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, push, remove, set } from 'firebase/database';

const DB_PATH = 'supplierPayments';

export function useSupplierPayments() {
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
        setIsLoaded(true);
        return;
    }
    const paymentsRef = ref(db, DB_PATH);
    const unsubscribe = onValue(paymentsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const paymentsList: SupplierPayment[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setSupplierPayments(paymentsList);
        } else {
            setSupplierPayments([]);
        }
        setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  const addSupplierPayment = useCallback((payment: Omit<SupplierPayment, 'id'>) => {
    if (!db) return;
    const newPaymentRef = push(ref(db, DB_PATH));
    set(newPaymentRef, payment);
  }, []);

  const deleteSupplierPayment = useCallback((id: string) => {
    if (!db) return;
    const paymentRef = ref(db, `${DB_PATH}/${id}`);
    remove(paymentRef);
  }, []);

  const clearSupplierPayments = useCallback(() => {
    if (!db) return;
    const paymentsRef = ref(db, DB_PATH);
    remove(paymentsRef);
  }, []);

  return { supplierPayments, addSupplierPayment, deleteSupplierPayment, clearSupplierPayments, isLoaded };
}
