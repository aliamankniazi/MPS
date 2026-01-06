
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Purchase } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, push, remove, set } from 'firebase/database';

const DB_PATH = 'purchases';

export function usePurchases() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
        setIsLoaded(true);
        return;
    }

    const purchasesRef = ref(db, DB_PATH);
    const unsubscribe = onValue(purchasesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const purchasesList: Purchase[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setPurchases(purchasesList);
        } else {
            setPurchases([]);
        }
        setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  const addPurchase = useCallback((purchase: Omit<Purchase, 'id'>) => {
    if (!db) return;
    const newPurchaseRef = push(ref(db, DB_PATH));
    set(newPurchaseRef, purchase);
  }, []);

  const deletePurchase = useCallback((id: string) => {
    if (!db) return;
    const purchaseRef = ref(db, `${DB_PATH}/${id}`);
    remove(purchaseRef);
  }, []);
  
  const clearPurchases = useCallback(() => {
    if (!db) return;
    const purchasesRef = ref(db, DB_PATH);
    remove(purchasesRef);
  }, []);

  return { purchases, addPurchase, deletePurchase, clearPurchases, isLoaded };
}
