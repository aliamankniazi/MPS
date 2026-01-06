
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Transaction } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, push, remove, set } from 'firebase/database';

const DB_PATH = 'transactions';

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
        setIsLoaded(true);
        return;
    }

    const transactionsRef = ref(db, DB_PATH);
    const unsubscribe = onValue(transactionsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const transactionsList: Transaction[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setTransactions(transactionsList);
        } else {
            setTransactions([]);
        }
        setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []);


  const addTransaction = useCallback((transaction: Omit<Transaction, 'id'>) => {
    if (!db) return;
    const newTransactionRef = push(ref(db, DB_PATH));
    set(newTransactionRef, transaction);
  }, []);
  
  const deleteTransaction = useCallback((id: string) => {
    if (!db) return;
    const transactionRef = ref(db, `${DB_PATH}/${id}`);
    remove(transactionRef);
  }, []);

  const clearTransactions = useCallback(() => {
    if (!db) return;
    const transactionsRef = ref(db, DB_PATH);
    remove(transactionsRef);
  }, []);

  return { transactions, addTransaction, deleteTransaction, clearTransactions, isLoaded };
}
