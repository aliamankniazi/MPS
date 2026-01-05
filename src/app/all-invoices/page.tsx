
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';

export default function AllInvoicesPage() {
  return (
    <div className="p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText /> All Invoices
          </CardTitle>
          <CardDescription>A list of all generated invoices.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
            <h3 className="text-xl font-semibold">No Invoices Yet</h3>
            <p>Generated invoices for sales and purchases will appear here.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
