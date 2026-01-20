
'use client';

import { useState, useTransition, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDatabase } from '@/hooks/use-database';
import { generateSalesSummary } from '@/ai/flows/generate-sales-summary';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileText, Sparkles, AlertTriangle, Calendar as CalendarIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format, isToday, startOfDay, endOfDay, isValid } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import type { DateRange } from '@/lib/types';

export default function AiSummaryPage() {
  const { transactions, customerPayments, cashAdvances, isLoaded, dateRange, setDateRange } = useDatabase();
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const dataForSummary = useMemo(() => {
    if (!isLoaded) return [];

    const combinedData = [
      ...transactions.map(t => ({...t, type: 'Sale'})),
      ...customerPayments.map(p => ({...p, type: 'Customer Payment'})),
      ...cashAdvances.map(ca => ({...ca, type: 'Cash Advance'}))
    ];

    if (dateRange?.from) {
        const from = startOfDay(dateRange.from);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);
        return combinedData.filter(item => {
            const itemDate = new Date(item.timestamp);
            return isValid(itemDate) && itemDate >= from && itemDate <= to;
        });
    }

    // Default to today if no range is selected
    return combinedData.filter(item => isValid(new Date(item.timestamp)) && isToday(new Date(item.timestamp)));

  }, [isLoaded, transactions, customerPayments, cashAdvances, dateRange]);


  const handleGenerateSummary = () => {
    setError('');
    setSummary('');
    startTransition(async () => {
      try {
        if (dataForSummary.length === 0) {
          setError("No activity recorded for the selected period to generate a summary.");
          return;
        }

        const result = await generateSalesSummary({
          activityData: JSON.stringify(dataForSummary),
        });
        setSummary(result.summary);
      } catch (e) {
        console.error(e);
        setError('Failed to generate summary. Please try again later.');
      }
    });
  };
  
  const hasData = isLoaded && dataForSummary.length > 0;

  return (
    <div className="p-4 md:p-8">
        <Card className="flex flex-col">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                      <FileText /> Financial Activity AI Summary
                  </CardTitle>
                  <CardDescription>
                      Use AI to generate a summary of sales, payments, and advances for a selected period. Defaults to today.
                  </CardDescription>
                </div>
                 <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            id="date"
                            variant={"outline"}
                            className={cn(
                                "w-[260px] justify-start text-left font-normal",
                                !dateRange && "text-muted-foreground"
                            )}
                            >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange?.from ? (
                                dateRange.to ? (
                                <>
                                    {format(dateRange.from, "LLL dd, y")} -{" "}
                                    {format(dateRange.to, "LLL dd, y")}
                                </>
                                ) : (
                                format(dateRange.from, "LLL dd, y")
                                )
                            ) : (
                                <span>Pick a date range</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                            key="ai-summary-calendar"
                            initialFocus
                            mode="range"
                            defaultMonth={dateRange?.from}
                            selected={dateRange}
                            onSelect={setDateRange}
                            numberOfMonths={2}
                        />
                    </PopoverContent>
                </Popover>
              </div>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col gap-4 min-h-[200px]">
            {error && (
                <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {isPending ? (
                <div className="space-y-4">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                </div>
            ) : summary ? (
                <div className="prose prose-sm sm:prose-base dark:prose-invert bg-muted/50 p-6 rounded-lg">
                <p>{summary}</p>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center gap-4 text-center text-muted-foreground flex-grow p-8 border-2 border-dashed rounded-lg">
                <Sparkles className="w-16 h-16" />
                <h3 className="text-xl font-semibold">Ready to Analyze</h3>
                <p>Click the button below to generate a summary of financial activity for the selected period.</p>
                </div>
            )}
            </CardContent>
            <CardFooter>
            <Button onClick={handleGenerateSummary} disabled={isPending || !hasData}>
                {isPending ? 'Generating...' : 'Generate Summary'}
            </Button>
            {!isLoaded && <p className="text-sm text-muted-foreground ml-4">Loading data...</p>}
            {isLoaded && !hasData && <p className="text-sm text-muted-foreground ml-4">No data for selected period.</p>}
            </CardFooter>
        </Card>
    </div>
  );
}
