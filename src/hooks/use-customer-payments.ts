
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CustomerPayment } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, push, remove, set } from 'firebase/database';

const DB_PATH = 'customerPayments';

export function useCustomerPayments() {
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
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
            const paymentsList: CustomerPayment[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setCustomerPayments(paymentsList);
        } else {
            setCustomerPayments([]);
        }
        setIsLoaded(true);
    });
    return () => unsubscribe();
  }, []);


  const addCustomerPayment = useCallback((payment: Omit<CustomerPayment, 'id'>) => {
    if (!db) return;
    const newPaymentRef = push(ref(db, DB_PATH));
    set(newPaymentRef, payment);
  }, []);
  
  const deleteCustomerPayment = useCallback((id: string) => {
    if (!db) return;
    const paymentRef = ref(db, `${DB_PATH}/${id}`);
    remove(paymentRef);
  }, []);

  const clearCustomerPayments = useCallback(() => {
    if (!db) return;
    const paymentsRef = ref(db, DB_PATH);
    remove(paymentsRef);
  }, []);

  return { customerPayments, addCustomerPayment, deleteCustomerPayment, clearCustomerPayments, isLoaded };
}
