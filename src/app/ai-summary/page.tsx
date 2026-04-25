'use client';

import { useState, useTransition, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDatabase } from '@/hooks/use-database';
import { generateSalesSummary, type GenerateSalesSummaryOutput } from '@/ai/flows/generate-sales-summary';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileText, Sparkles, AlertTriangle, TrendingUp, Wallet, Receipt, ClipboardCheck, RefreshCw, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { startOfDay, endOfDay, isValid } from 'date-fns';

export default function AiSummaryPage() {
  const { transactions, purchases, expenses, customerPayments, cashAdvances, isLoaded, dateRange } = useDatabase();
  const [reports, setReports] = useState<GenerateSalesSummaryOutput | null>(null);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const dataForSummary = useMemo(() => {
    if (!isLoaded || !dateRange?.from) return [];

    const combinedData = [
      ...transactions.map(t => ({...t, type: 'Sale'})),
      ...purchases.map(p => ({...p, type: 'Purchase'})),
      ...expenses.map(e => ({...e, type: 'Expense'})),
      ...customerPayments.map(p => ({...p, type: 'Customer Payment'})),
      ...cashAdvances.map(ca => ({...ca, type: 'Cash Advance'}))
    ];

    const from = startOfDay(dateRange.from);
    const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);
    
    return combinedData.filter(item => {
        const itemDate = new Date(item.timestamp);
        return isValid(itemDate) && itemDate >= from && itemDate <= to;
    });

  }, [isLoaded, transactions, purchases, expenses, customerPayments, cashAdvances, dateRange]);


  const handleGenerateSummary = () => {
    if (dataForSummary.length === 0) return;
    
    setError('');
    startTransition(async () => {
      try {
        const result = await generateSalesSummary({
          activityData: JSON.stringify(dataForSummary),
        });
        setReports(result);
      } catch (e: any) {
        console.error(e);
        if (e.message && (e.message.toLowerCase().includes('rate limit') || e.message.toLowerCase().includes('rate exceeded'))) {
          setError('AI rate limit exceeded. Please wait a moment before trying again.');
        } else {
          setError('Failed to generate business reports. Please try again later.');
        }
      }
    });
  };
  
  // Auto-generate when data is ready and no reports exist
  useEffect(() => {
    if (isLoaded && dataForSummary.length > 0 && !reports && !isPending && !error) {
        handleGenerateSummary();
    }
  }, [isLoaded, dataForSummary, reports, isPending, error]);

  const hasData = isLoaded && dataForSummary.length > 0;

  return (
    <div className="p-4 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <Sparkles className="text-primary" /> AI Business Intelligence
                </h1>
                <p className="text-muted-foreground">
                    Automated specialized reports for the period: <span className="font-semibold text-foreground">
                        {dateRange?.from ? (dateRange.to ? `${dataForSummary.length > 0 ? 'Data loaded' : 'Checking dates...'}` : '') : 'Select range on Dashboard'}
                    </span>
                </p>
            </div>
            <Button 
                onClick={handleGenerateSummary} 
                disabled={isPending || !hasData}
                variant="outline"
                className="gap-2"
            >
                <RefreshCw className={cn("w-4 h-4", isPending && "animate-spin")} />
                {isPending ? 'Regenerating Reports...' : 'Refresh AI Analysis'}
            </Button>
        </div>

        {error && (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Analysis Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}

        {!isLoaded ? (
            <div className="grid gap-6 md:grid-cols-2">
                {[1,2,3,4].map(i => (
                    <Card key={i}><CardContent className="p-6 space-y-4"><Skeleton className="h-6 w-1/3"/><Skeleton className="h-20 w-full"/></CardContent></Card>
                ))}
            </div>
        ) : !hasData ? (
            <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground p-12 border-2 border-dashed rounded-lg bg-background">
                <BarChart3 className="w-16 h-16 opacity-20" />
                <h3 className="text-xl font-semibold">No Data to Analyze</h3>
                <p>There are no transactions recorded for the selected date range. Please adjust the filters on the Dashboard.</p>
            </div>
        ) : isPending && !reports ? (
            <div className="grid gap-6 md:grid-cols-2">
                {[1,2,3,4].map(i => (
                    <Card key={i}><CardContent className="p-6 space-y-4"><Skeleton className="h-6 w-1/3"/><Skeleton className="h-32 w-full"/></CardContent></Card>
                ))}
            </div>
        ) : reports ? (
            <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-l-4 border-l-primary">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-primary">
                            <ClipboardCheck className="w-5 h-5" /> Executive Summary
                        </CardTitle>
                        <CardDescription>Overall business health and key takeaways.</CardDescription>
                    </CardHeader>
                    <CardContent className="prose prose-sm dark:prose-invert">
                        <p className="whitespace-pre-line">{reports.executiveSummary}</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-green-600">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-green-600">
                            <TrendingUp className="w-5 h-5" /> Sales & Profit Analysis
                        </CardTitle>
                        <CardDescription>Performance of fuel types and estimated margins.</CardDescription>
                    </CardHeader>
                    <CardContent className="prose prose-sm dark:prose-invert">
                        <p className="whitespace-pre-line">{reports.salesAnalysis}</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-destructive">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-destructive">
                            <Receipt className="w-5 h-5" /> Expense & Cost Control
                        </CardTitle>
                        <CardDescription>Breakdown of operational spending and leaks.</CardDescription>
                    </CardHeader>
                    <CardContent className="prose prose-sm dark:prose-invert">
                        <p className="whitespace-pre-line">{reports.expenseAnalysis}</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-blue-600">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-blue-600">
                            <Wallet className="w-5 h-5" /> Credit & Recovery Assessment
                        </CardTitle>
                        <CardDescription>Analysis of Udhar (receivables) and cash flow.</CardDescription>
                    </CardHeader>
                    <CardContent className="prose prose-sm dark:prose-invert">
                        <p className="whitespace-pre-line">{reports.creditRecoveryStatus}</p>
                    </CardContent>
                </Card>
            </div>
        ) : null}
    </div>
  );
}
