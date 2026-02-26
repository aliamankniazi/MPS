'use client';

import { usePathname } from 'next/navigation';

export function PrintStyles() {
    const pathname = usePathname();
    if (pathname.startsWith('/invoice/') || pathname.includes('/ledger')) {
        return <link rel="stylesheet" href="/print-globals.css" media="print" />;
    }
    return null;
}
