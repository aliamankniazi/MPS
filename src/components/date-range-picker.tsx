
'use client';

import * as React from 'react';
import { format, startOfMonth, endOfMonth, subDays, startOfToday, endOfToday, subMonths, startOfWeek, endOfWeek, startOfYear, endOfYear } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import type { DateRange } from '@/lib/types';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface DateRangePickerProps extends React.HTMLAttributes<HTMLDivElement> {
  date: DateRange | undefined;
  onDateChange: (date: DateRange | undefined) => void;
}

export function DateRangePicker({
  date,
  onDateChange,
  className,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const handlePreset = (preset: 'today' | 'thisWeek' | 'thisMonth' | 'thisYear' | 'last7' | 'last30' | 'lastMonth') => {
    const now = new Date();
    let range: DateRange | undefined;

    switch (preset) {
      case 'today':
        range = { from: startOfToday(), to: endOfToday() };
        break;
      case 'thisWeek':
        range = { from: startOfWeek(now), to: endOfWeek(now) };
        break;
      case 'thisMonth':
        range = { from: startOfMonth(now), to: endOfMonth(now) };
        break;
      case 'thisYear':
        range = { from: startOfYear(now), to: endOfYear(now) };
        break;
      case 'last7':
        range = { from: subDays(now, 6), to: now };
        break;
      case 'last30':
        range = { from: subDays(now, 29), to: now };
        break;
      case 'lastMonth':
        const lastMonth = subMonths(now, 1);
        range = { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
        break;
      default:
        range = undefined;
    }
    onDateChange(range);
    setIsOpen(false);
  };

  return (
    <div className={cn('grid gap-2', className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={'outline'}
            className={cn(
              'w-[300px] justify-start text-left font-normal',
              !date && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, 'dd-MMM-yyyy')} -{' '}
                  {format(date.to, 'dd-MMM-yyyy')}
                </>
              ) : (
                format(date.from, 'dd-MMM-yyyy')
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-auto p-0" align="end">
          <div className="flex flex-col space-y-2 border-r p-4">
              <Button variant="ghost" className="justify-start" onClick={() => handlePreset('today')}>Today</Button>
              <Button variant="ghost" className="justify-start" onClick={() => handlePreset('thisWeek')}>This Week</Button>
              <Button variant="ghost" className="justify-start" onClick={() => handlePreset('thisMonth')}>This Month</Button>
              <Button variant="ghost" className="justify-start" onClick={() => handlePreset('thisYear')}>This Year</Button>
              <Button variant="ghost" className="justify-start" onClick={() => handlePreset('last7')}>Last 7 Days</Button>
              <Button variant="ghost" className="justify-start" onClick={() => handlePreset('last30')}>Last 30 Days</Button>
              <Button variant="ghost" className="justify-start" onClick={() => handlePreset('lastMonth')}>Last Month</Button>
              <Button variant="outline" className="mt-4" onClick={() => onDateChange(undefined)}>Clear</Button>
          </div>
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={(range) => {
              onDateChange(range ? { from: range.from, to: range.to } : undefined);
              if (range?.from && range.to) {
                if (range.from !== date?.from || range.to !== date?.to) {
                  setIsOpen(false);
                }
              }
            }}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
