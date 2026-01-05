
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileBarChart } from 'lucide-react';

export default function ReportsPage() {
  return (
    <div className="p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileBarChart /> Reports
          </CardTitle>
          <CardDescription>Generate and view business reports.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
            <h3 className="text-xl font-semibold">Feature Not Implemented</h3>
            <p>This page is a placeholder for generating reports.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
