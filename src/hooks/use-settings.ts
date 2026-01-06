
'use client';

import { useDatabase } from '@/hooks/use-database';
import { db } from '@/lib/firebase';
import { ref, remove } from 'firebase/database';

export function useSettings() {
  const { clearAllLocalData } = useDatabase();

  const clearAllData = () => {
    // This will clear all local state via the database hook.
    clearAllLocalData();

    // Additionally, wipe the entire RTDB database.
    if (db) {
        remove(ref(db));
    }
  };

  return {
    clearAllData,
  };
}
