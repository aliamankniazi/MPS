
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/hooks/use-auth';
import { PrintStyles } from '@/components/print-styles';
import { DatabaseProvider } from '@/hooks/use-database';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

// Metadata can't be exported from a client component.
// We can set the document title dynamically within components if needed.

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
          <PrintStyles />
      </head>
      <body className="font-body antialiased">
        <DatabaseProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </DatabaseProvider>
        <Toaster />
      </body>
    </html>
  );
}
