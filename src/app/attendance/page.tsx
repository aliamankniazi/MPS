
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AttendanceRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the new unified employees page
    router.replace('/employees');
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
        <p>Redirecting to Employees & Salary...</p>
    </div>
  );
}
