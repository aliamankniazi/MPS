
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarCheck } from 'lucide-react';

export default function AttendancePage() {
  return (
    <div className="p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck /> Attendance
          </CardTitle>
          <CardDescription>Employee attendance records.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
            <h3 className="text-xl font-semibold">Feature Not Implemented</h3>
            <p>This page is a placeholder for employee attendance.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
