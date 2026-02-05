import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/hooks/use-auth';
import { PrintStyles } from '@/components/print-styles';
import { DatabaseProvider } from '@/hooks/use-database';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { FirebaseClientProvider } from '@/firebase';
import { AppLayout } from '@/components/app-layout';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'PumpPal',
  description: 'PumpPal - Petrol Pump Management Software',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-body antialiased">
        <FirebaseClientProvider>
          <DatabaseProvider>
            <AuthProvider>
              {(user, isAuthPage, isLoading) => {
                if (isLoading && !isAuthPage) {
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
              }}
            </AuthProvider>
          </DatabaseProvider>
        </FirebaseClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
