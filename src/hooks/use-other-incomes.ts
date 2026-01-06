
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { OtherIncome } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, push, remove, set } from 'firebase/database';

const DB_PATH = 'otherIncomes';

export function useOtherIncomes() {
  const [otherIncomes, setOtherIncomes] = useState<OtherIncome[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
        setIsLoaded(true);
        return;
    }

    const incomesRef = ref(db, DB_PATH);
    const unsubscribe = onValue(incomesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const incomesList: OtherIncome[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setOtherIncomes(incomesList);
        } else {
            setOtherIncomes([]);
        }
        setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  const addOtherIncome = useCallback((income: Omit<OtherIncome, 'id'>) => {
    if (!db) return;
    const newIncomeRef = push(ref(db, DB_PATH));
    set(newIncomeRef, income);
  }, []);

  const deleteOtherIncome = useCallback((id: string) => {
    if (!db) return;
    const incomeRef = ref(db, `${DB_PATH}/${id}`);
    remove(incomeRef);
  }, []);
  
  const clearOtherIncomes = useCallback(() => {
    if (!db) return;
    const incomesRef = ref(db, DB_PATH);
    remove(incomesRef);
  }, []);

  return { otherIncomes, addOtherIncome, deleteOtherIncome, clearOtherIncomes, isLoaded };
}
