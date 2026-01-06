
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Expense } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, push, remove, set } from 'firebase/database';

const DB_PATH = 'expenses';

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
        setIsLoaded(true);
        return;
    }

    const expensesRef = ref(db, DB_PATH);
    const unsubscribe = onValue(expensesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const expensesList: Expense[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setExpenses(expensesList);
        } else {
            setExpenses([]);
        }
        setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  const addExpense = useCallback((expense: Omit<Expense, 'id'>) => {
    if (!db) return;
    const newExpenseRef = push(ref(db, DB_PATH));
    set(newExpenseRef, expense);
  }, []);
  
  const deleteExpense = useCallback((id: string) => {
    if (!db) return;
    const expenseRef = ref(db, `${DB_PATH}/${id}`);
    remove(expenseRef);
  }, []);

  const clearExpenses = useCallback(() => {
    if (!db) return;
    const expensesRef = ref(db, DB_PATH);
    remove(expensesRef);
  }, []);

  return { expenses, addExpense, deleteExpense, clearExpenses, isLoaded };
}
