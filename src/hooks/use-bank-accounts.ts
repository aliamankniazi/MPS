
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BankAccount } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, push, remove, set, update } from 'firebase/database';

const DB_PATH = 'bankAccounts';

export function useBankAccounts() {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
        setIsLoaded(true);
        return;
    }

    const accountsRef = ref(db, DB_PATH);
    const unsubscribe = onValue(accountsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const accountsList: BankAccount[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setBankAccounts(accountsList);
        } else {
            setBankAccounts([]);
        }
        setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  const addBankAccount = useCallback((account: Omit<BankAccount, 'id' | 'timestamp'>) => {
    if (!db) return;
    const newAccountRef = push(ref(db, DB_PATH));
    set(newAccountRef, { ...account, timestamp: new Date().toISOString() });
  }, []);
  
  const updateBankAccount = useCallback((id: string, updatedDetails: Partial<Omit<BankAccount, 'id' | 'timestamp'>>) => {
    if (!db) return;
    const accountRef = ref(db, `${DB_PATH}/${id}`);
    update(accountRef, updatedDetails);
  }, []);

  const deleteBankAccount = useCallback((id: string) => {
    if (!db) return;
    const accountRef = ref(db, `${DB_PATH}/${id}`);
    remove(accountRef);
  }, []);

  const clearBankAccounts = useCallback(() => {
    if (!db) return;
    const accountsRef = ref(db, DB_PATH);
    remove(accountsRef);
  }, []);

  return { bankAccounts, addBankAccount, updateBankAccount, deleteBankAccount, clearBankAccounts, isLoaded };
}
