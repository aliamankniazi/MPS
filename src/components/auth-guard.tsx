'use client';

import { useAuth } from '@/hooks/use-auth';
import { usePathname, useRouter } from 'next/navigation';
import { AppLayout } from '@/components/app-layout';
import { PrintStyles } from '@/components/print-styles';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { useEffect, useState } from 'react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/signup';
  
  const [is2faVerified, setIs2faVerified] = useState(false);

  useEffect(() => {
    const verified = localStorage.getItem('pumppal_2fa_verified') === 'true';
    setIs2faVerified(verified);
  }, [pathname]);

  useEffect(() => {
    if (loading) return; // Don't redirect while loading

    if (!user && !isAuthPage) {
        router.push('/login');
    }
    
    // Only redirect to dashboard if user exists AND 2FA is complete
    if (user && isAuthPage && is2faVerified) {
        router.push('/');
    }

    // Redirect to login if user exists but 2FA is not complete (and not on login page)
    if (user && !isAuthPage && !is2faVerified) {
        router.push('/login');
    }
  }, [user, loading, isAuthPage, is2faVerified, router]);

  if (loading && !isAuthPage) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p>Loading application...</p>
      </div>
    );
  }

  return (
    <>
      <PrintStyles />
      <FirebaseErrorListener />
      {user && !isAuthPage && is2faVerified ? (
        <AppLayout>{children}</AppLayout>
      ) : (
        children
      )}
    </>
  );
}
