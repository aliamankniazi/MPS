
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SaleReturn } from '@/lib/types';

const STORAGE_KEY = 'pumppal-sale-returns';

export function useSaleReturns() {
  const [saleReturns, setSaleReturns] = useState<SaleReturn[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const loadData = useCallback(() => {
    try {
      const storedItems = localStorage.getItem(STORAGE_KEY);
      if (storedItems) {
        setSaleReturns(JSON.parse(storedItems));
      }
    } catch (error) {
      console.error("Failed to parse sale returns from localStorage", error);
      setSaleReturns([]);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadData();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        loadData();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [loadData]);


  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saleReturns));
      } catch (error) {
        console.error("Failed to save sale returns to localStorage", error);
      }
    }
  }, [saleReturns, isLoaded]);

  const addSaleReturn = useCallback((saleReturn: Omit<SaleReturn, 'id'>) => {
    setSaleReturns(prev => [
      { ...saleReturn, id: crypto.randomUUID() },
      ...prev,
    ]);
  }, []);

  const deleteSaleReturn = useCallback((id: string) => {
    setSaleReturns(prev => prev.filter(sr => sr.id !== id));
  }, []);

  const clearSaleReturns = useCallback(() => {
    setSaleReturns([]);
  }, []);

  return { saleReturns, addSaleReturn, deleteSaleReturn, clearSaleReturns, isLoaded };
}
