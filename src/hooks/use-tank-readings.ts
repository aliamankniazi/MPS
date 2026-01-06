
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { TankReading } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, push, remove, set } from 'firebase/database';

const DB_PATH = 'tankReadings';

export function useTankReadings() {
  const [tankReadings, setTankReadings] = useState<TankReading[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
        setIsLoaded(true);
        return;
    }
    const readingsRef = ref(db, DB_PATH);
    const unsubscribe = onValue(readingsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const readingsList: TankReading[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setTankReadings(readingsList);
        } else {
            setTankReadings([]);
        }
        setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []);


  const addTankReading = useCallback((reading: Omit<TankReading, 'id'>) => {
    if (!db) return;
    const newReadingRef = push(ref(db, DB_PATH));
    set(newReadingRef, reading);
  }, []);

  const clearTankReadings = useCallback(() => {
    if (!db) return;
    const readingsRef = ref(db, DB_PATH);
    remove(readingsRef);
  }, []);

  return { tankReadings, addTankReading, clearTankReadings, isLoaded };
}
