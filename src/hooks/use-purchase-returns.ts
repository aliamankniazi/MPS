
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PurchaseReturn } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, push, remove, set } from 'firebase/database';

const DB_PATH = 'purchaseReturns';

export function usePurchaseReturns() {
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
        setIsLoaded(true);
        return;
    }
    const returnsRef = ref(db, DB_PATH);
    const unsubscribe = onValue(returnsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const returnsList: PurchaseReturn[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setPurchaseReturns(returnsList);
        } else {
            setPurchaseReturns([]);
        }
        setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []);


  const addPurchaseReturn = useCallback((purchaseReturn: Omit<PurchaseReturn, 'id'>) => {
    if (!db) return;
    const newReturnRef = push(ref(db, DB_PATH));
    set(newReturnRef, purchaseReturn);
  }, []);

  const deletePurchaseReturn = useCallback((id: string) => {
    if (!db) return;
    const returnRef = ref(db, `${DB_PATH}/${id}`);
    remove(returnRef);
  }, []);

  const clearPurchaseReturns = useCallback(() => {
    if (!db) return;
    const returnsRef = ref(db, DB_PATH);
    remove(returnsRef);
  }, []);

  return { purchaseReturns, addPurchaseReturn, deletePurchaseReturn, clearPurchaseReturns, isLoaded };
}
