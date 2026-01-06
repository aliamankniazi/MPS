
'use client';

import { useDatabase } from '@/hooks/use-database';

export function useSettings() {
  const { clearAllData } = useDatabase();

  return {
    clearAllData,
  };
}

    