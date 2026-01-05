
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function StockAdjustmentRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the settings page where stock can be adjusted
    router.replace('/settings');
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
        <p>Redirecting to Settings...</p>
    </div>
  );
}
