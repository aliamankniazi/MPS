
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/hooks/use-auth';
import { PrintStyles } from '@/components/print-styles';
import { DatabaseProvider } from '@/hooks/use-database';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

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
      <head>
      </head>
      <body className="font-body antialiased">
        <DatabaseProvider>
          <AuthProvider>
            <PrintStyles />
            <FirebaseErrorListener />
            {children}
          </AuthProvider>
        </DatabaseProvider>
        <Toaster />
      </body>
    </html>
  );
}
