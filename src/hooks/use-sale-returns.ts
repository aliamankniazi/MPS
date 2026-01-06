
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SaleReturn } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, push, remove, set } from 'firebase/database';

const DB_PATH = 'saleReturns';

export function useSaleReturns() {
  const [saleReturns, setSaleReturns] = useState<SaleReturn[]>([]);
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
            const returnsList: SaleReturn[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setSaleReturns(returnsList);
        } else {
            setSaleReturns([]);
        }
        setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  const addSaleReturn = useCallback((saleReturn: Omit<SaleReturn, 'id'>) => {
    if (!db) return;
    const newReturnRef = push(ref(db, DB_PATH));
    set(newReturnRef, saleReturn);
  }, []);

  const deleteSaleReturn = useCallback((id: string) => {
    if (!db) return;
    const returnRef = ref(db, `${DB_PATH}/${id}`);
    remove(returnRef);
  }, []);

  const clearSaleReturns = useCallback(() => {
    if (!db) return;
    const returnsRef = ref(db, DB_PATH);
    remove(returnsRef);
  }, []);

  return { saleReturns, addSaleReturn, deleteSaleReturn, clearSaleReturns, isLoaded };
}
