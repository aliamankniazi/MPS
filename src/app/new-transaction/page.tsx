
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function NewTransactionRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
        <p>Redirecting to Sales Page...</p>
    </div>
  );
}
