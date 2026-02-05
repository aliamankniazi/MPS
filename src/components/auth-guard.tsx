'use client';

import { useAuth } from '@/hooks/use-auth';
import { usePathname, useRouter } from 'next/navigation';
import { AppLayout } from '@/components/app-layout';
import { PrintStyles } from '@/components/print-styles';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { useEffect } from 'react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/signup';

  useEffect(() => {
    if (loading) return; // Don't redirect while loading

    if (!user && !isAuthPage) {
        router.push('/login');
    }
    if (user && isAuthPage) {
        router.push('/');
    }
  }, [user, loading, isAuthPage, router]);

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
      {user && !isAuthPage ? (
        <AppLayout>{children}</AppLayout>
      ) : (
        children
      )}
    </>
  );
}
