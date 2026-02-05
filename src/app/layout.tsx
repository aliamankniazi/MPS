import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/hooks/use-auth';
import { DatabaseProvider } from '@/hooks/use-database';
import { FirebaseClientProvider } from '@/firebase';
import { AuthGuard } from '@/components/auth-guard';

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
      <body>
        <FirebaseClientProvider>
          <DatabaseProvider>
            <AuthProvider>
              <AuthGuard>{children}</AuthGuard>
            </AuthProvider>
          </DatabaseProvider>
        </FirebaseClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
