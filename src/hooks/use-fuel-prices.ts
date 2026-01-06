
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FuelType } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, update } from 'firebase/database';

const DB_PATH = 'fuelPrices';

const DEFAULT_FUEL_PRICES: Record<FuelType, number> = {
  'Unleaded': 275.98,
  'Premium': 285.50,
  'Diesel': 282.44,
};

export function useFuelPrices() {
  const [fuelPrices, setFuelPrices] = useState<Record<FuelType, number>>({...DEFAULT_FUEL_PRICES});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
      setIsLoaded(true);
      return;
    }
    const pricesRef = ref(db, DB_PATH);
    const unsubscribe = onValue(pricesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            setFuelPrices(data);
        } else {
            setFuelPrices(DEFAULT_FUEL_PRICES);
        }
        setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []);
  
  const updateFuelPrice = useCallback((fuelType: FuelType, newPrice: number) => {
    if (!db || isNaN(newPrice) || newPrice < 0) return;
    const updates: Record<string, number> = {};
    updates[`${DB_PATH}/${fuelType}`] = newPrice;
    update(ref(db), updates);
  }, []);

  const clearFuelPrices = useCallback(() => {
    if (!db) return;
    const updates: Record<string, null> = {};
    Object.keys(DEFAULT_FUEL_PRICES).forEach(fuelType => {
      updates[`${DB_PATH}/${fuelType}`] = null;
    });
    update(ref(db), updates);
    setFuelPrices({...DEFAULT_FUEL_PRICES});
  }, []);

  return { fuelPrices, updateFuelPrice, clearFuelPrices, isLoaded };
}
