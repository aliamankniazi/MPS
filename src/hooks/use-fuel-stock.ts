
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { FuelType } from '@/lib/types';
import { useTransactions } from './use-transactions';
import { usePurchases } from './use-purchases';
import { usePurchaseReturns } from './use-purchase-returns';
import { db } from '@/lib/firebase';
import { ref, onValue, set } from 'firebase/database';

const MANUAL_STOCK_PATH = 'manualFuelStock';
const INITIAL_STOCK_PATH = 'initialFuelStock';

const DEFAULT_INITIAL_STOCK: Record<FuelType, number> = {
  'Unleaded': 10000,
  'Premium': 5000,
  'Diesel': 15000,
};

export function useFuelStock() {
  const { transactions, isLoaded: transactionsLoaded } = useTransactions();
  const { purchases, isLoaded: purchasesLoaded } = usePurchases();
  const { purchaseReturns, isLoaded: purchaseReturnsLoaded } = usePurchaseReturns();
  
  const [manualStock, setManualStock] = useState<Partial<Record<FuelType, { value: number; timestamp: string }>>>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [initialStock, setInitialStock] = useState<Record<FuelType, number>>(DEFAULT_INITIAL_STOCK);

  useEffect(() => {
    if (!db) {
        setIsLoaded(true);
        return;
    }
    let manualUnsubscribe = () => {};
    let initialUnsubscribe = () => {};

    const manualRef = ref(db, MANUAL_STOCK_PATH);
    manualUnsubscribe = onValue(manualRef, (snapshot) => {
        setManualStock(snapshot.val() || {});
    });
    
    const initialRef = ref(db, INITIAL_STOCK_PATH);
    initialUnsubscribe = onValue(initialRef, (snapshot) => {
        setInitialStock(snapshot.val() || DEFAULT_INITIAL_STOCK);
        setIsLoaded(true);
    });

    return () => {
        manualUnsubscribe();
        initialUnsubscribe();
    }
  }, []);

  const fuelStock = useMemo(() => {
    if (!transactionsLoaded || !purchasesLoaded || !purchaseReturnsLoaded) {
      return initialStock;
    }

    const stock = { ...initialStock };

    for (const fuelType in stock) {
        const ft = fuelType as FuelType;
        const manualAdjustment = manualStock[ft];
        
        if (manualAdjustment) {
            stock[ft] = manualAdjustment.value;
        } else {
            const totalSold = transactions
                .filter(t => t.fuelType === ft)
                .reduce((sum, t) => sum + t.volume, 0);

            const totalPurchased = purchases
                .filter(p => p.fuelType === ft)
                .reduce((sum, p) => sum + p.volume, 0);

            const totalReturned = purchaseReturns
                .filter(pr => pr.fuelType === ft)
                .reduce((sum, pr) => sum + pr.volume, 0);
            
            stock[ft] = initialStock[ft] + totalPurchased - totalSold - totalReturned;
        }
    }
    
    return stock;
  }, [initialStock, manualStock, transactions, purchases, purchaseReturns, transactionsLoaded, purchasesLoaded, purchaseReturnsLoaded]);

  const setFuelStock = useCallback((fuelType: FuelType, newStock: number) => {
    if (!db || isNaN(newStock) || newStock < 0) return;
    
    const stockRef = ref(db, `${MANUAL_STOCK_PATH}/${fuelType}`);
    set(stockRef, { value: newStock, timestamp: new Date().toISOString() });
  }, []);

  const clearFuelStock = useCallback(() => {
    if (!db) return;
    const manualRef = ref(db, MANUAL_STOCK_PATH);
    remove(manualRef);
    const initialRef = ref(db, INITIAL_STOCK_PATH);
    remove(initialRef);
  }, []);

  return { fuelStock, setFuelStock, clearFuelStock, isLoaded: isLoaded && transactionsLoaded && purchasesLoaded && purchaseReturnsLoaded };
}
