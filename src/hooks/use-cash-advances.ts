
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CashAdvance } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, push, remove, set } from 'firebase/database';

const DB_PATH = 'cashAdvances';

export function useCashAdvances() {
  const [cashAdvances, setCashAdvances] = useState<CashAdvance[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
        setIsLoaded(true);
        return;
    }
    const advancesRef = ref(db, DB_PATH);
    const unsubscribe = onValue(advancesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const advancesList: CashAdvance[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setCashAdvances(advancesList);
        } else {
            setCashAdvances([]);
        }
        setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  const addCashAdvance = useCallback((advance: Omit<CashAdvance, 'id'>) => {
    if (!db) return;
    const newAdvanceRef = push(ref(db, DB_PATH));
    set(newAdvanceRef, advance);
  }, []);
  
  const deleteCashAdvance = useCallback((id: string) => {
    if (!db) return;
    const advanceRef = ref(db, `${DB_PATH}/${id}`);
    remove(advanceRef);
  }, []);

  const clearCashAdvances = useCallback(() => {
    if (!db) return;
    const advancesRef = ref(db, DB_PATH);
    remove(advancesRef);
  }, []);

  return { cashAdvances, addCashAdvance, deleteCashAdvance, clearCashAdvances, isLoaded };
}
