

'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DeprecatedDashboard() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the new dashboard page at the root
    router.replace('/');
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
        <p>Redirecting to Dashboard...</p>
    </div>
  );
}

