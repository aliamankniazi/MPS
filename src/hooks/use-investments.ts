
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Investment } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, push, remove, set } from 'firebase/database';

const DB_PATH = 'investments';

export function useInvestments() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
        setIsLoaded(true);
        return;
    }
    const investmentsRef = ref(db, DB_PATH);
    const unsubscribe = onValue(investmentsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const investmentsList: Investment[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setInvestments(investmentsList);
        } else {
            setInvestments([]);
        }
        setIsLoaded(true);
    });
    return () => unsubscribe();
  }, []);

  const addInvestment = useCallback((investment: Omit<Investment, 'id'>) => {
    if (!db) return;
    const newInvestmentRef = push(ref(db, DB_PATH));
    set(newInvestmentRef, investment);
  }, []);
  
  const deleteInvestment = useCallback((id: string) => {
    if (!db) return;
    const investmentRef = ref(db, `${DB_PATH}/${id}`);
    remove(investmentRef);
  }, []);

  const clearInvestments = useCallback(() => {
    if (!db) return;
    const investmentsRef = ref(db, DB_PATH);
    remove(investmentsRef);
  }, []);

  return { investments, addInvestment, deleteInvestment, clearInvestments, isLoaded };
}
