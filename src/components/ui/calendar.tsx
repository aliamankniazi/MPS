"use client"

import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react"
import { DayPicker, type DropdownProps } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"
import { ScrollArea } from "./scroll-area"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

/**
 * The date picker, written for react-day-picker 9 (the version installed). It was still written for
 * version 8, whose class names and icon slots version 9 ignores, so the calendar drew unstyled.
 * Month and year are chosen from two lists; the arrows step a month.
 */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const thisYear = new Date().getFullYear()
  return (
    <DayPicker
      captionLayout="dropdown"
      startMonth={new Date(thisYear - 80, 0)}
      endMonth={new Date(thisYear + 10, 11)}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "relative flex flex-col sm:flex-row gap-4",
        month: "space-y-4",
        month_caption: "flex h-8 items-center justify-center px-9",
        caption_label: "hidden",
        dropdowns: "flex justify-center gap-2",
        nav: "pointer-events-none absolute inset-x-0 top-0 z-10 flex h-8 items-center justify-between",
        button_previous: cn(buttonVariants({ variant: "outline" }), "pointer-events-auto h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"),
        button_next: cn(buttonVariants({ variant: "outline" }), "pointer-events-auto h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 rounded-md text-[0.8rem] font-normal text-muted-foreground",
        week: "mt-2 flex w-full",
        day: "relative h-9 w-9 p-0 text-center text-sm focus-within:z-20",
        day_button: cn(buttonVariants({ variant: "outline" }), "h-9 w-9 p-0 font-normal"),
        selected: "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
        today: "[&:not([aria-selected=true])>button]:bg-accent [&:not([aria-selected=true])>button]:text-accent-foreground",
        outside: "[&>button]:text-muted-foreground [&>button]:opacity-50",
        disabled: "[&>button]:text-muted-foreground [&>button]:opacity-50",
        range_middle: "[&>button]:!bg-accent [&>button]:!text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className }) => {
          const Icon = orientation === "left" ? ChevronLeft : orientation === "up" ? ChevronUp : orientation === "down" ? ChevronDown : ChevronRight
          return <Icon className={cn("h-4 w-4", className)} />
        },
        Dropdown: ({ value, onChange, options }: DropdownProps) => {
          const selected = options?.find((option) => option.value === Number(value))
          return (
            <Select
              value={value?.toString()}
              onValueChange={(next) => onChange?.({ target: { value: next } } as React.ChangeEvent<HTMLSelectElement>)}
            >
              <SelectTrigger className="h-8 w-auto min-w-[6rem] px-2.5">
                <SelectValue>{selected?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <ScrollArea className="h-80">
                  {options?.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()} disabled={option.disabled}>
                      {option.label}
                    </SelectItem>
                  ))}
                </ScrollArea>
              </SelectContent>
            </Select>
          )
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
