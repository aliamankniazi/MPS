
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';

export default function FinancialsPage() {
  return (
    <div className="p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign /> Financials
          </CardTitle>
          <CardDescription>Comprehensive financial overview and tools.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
            <h3 className="text-xl font-semibold">Feature Not Implemented</h3>
            <p>This page is a placeholder for financial summaries and tools.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
