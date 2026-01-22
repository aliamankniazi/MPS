'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  FileBarChart,
  ArrowRight,
  CreditCard,
  UserX,
  Briefcase,
  Package,
  Percent,
  TrendingUp,
  PiggyBank,
  History,
  ShoppingCart,
  Boxes,
  HandCoins,
  LayoutDashboard,
  BookOpen,
  Truck,
  Wallet,
  Users,
  Receipt,
  Calendar as CalendarIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Permission } from '@/hooks/use-roles';
import { useDatabase } from '@/hooks/use-database';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ReportCardProps {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
}

const reportList: ReportCardProps[] = [
  {
    title: 'Top Customers Report',
    description: 'Identify and rank top customers based on sales.',
    href: '/top-customers',
    icon: Users,
    permission: 'view_dashboard',
  },
  {
    title: 'Date Wise Sale And Recovery Report',
    description: 'Track customer payments and balances.',
    href: '/credit-recovery',
    icon: CreditCard,
    permission: 'view_credit_recovery',
  },
  {
    title: 'Customer Defaulter Report',
    description: 'View customers with outstanding balances.',
    href: '/credit-recovery',
    icon: UserX,
    permission: 'view_credit_recovery',
  },
    {
    title: 'Supplier Report',
    description: 'View purchases, payments, and balances for suppliers.',
    href: '/supplier-report',
    icon: Truck,
    permission: 'view_purchases',
  },
  {
    title: 'Date Wise Business Report',
    description: "A high-level business overview without individual journal entries.",
    href: '/ledger',
    icon: Briefcase,
    permission: 'view_ledger',
  },
  {
    title: 'Product Wise Sale Report',
    description: 'Show Product Wise Sale Reports',
    href: '/ledger',
    icon: Package,
    permission: 'view_ledger',
  },
  {
    title: 'Product Profit Margin Report',
    description: 'Analyze profit margins for each product.',
    href: '/summary',
    icon: Percent,
    permission: 'view_summary',
  },
  {
    title: 'Product Profit/Loss by Invoice',
    description: 'Show Loss And Profit By Invoice in that report',
    href: '/ledger',
    icon: TrendingUp,
    permission: 'view_ledger',
  },
  {
    title: 'Total Investment Report',
    description: 'Summary of total capital invested by partners.',
    href: '/investments',
    icon: PiggyBank,
    permission: 'view_investments',
  },
  {
    title: 'Stock Sale & Purchase Report',
    description: 'Detailed report of stock ins and outs.',
    href: '/all-transactions',
    icon: History,
    permission: 'view_all_transactions',
  },
  {
    title: 'Sale & Return Report',
    description: 'Unified view of all sales and returns.',
    href: '/all-transactions',
    icon: ShoppingCart,
    permission: 'view_all_transactions',
  },
  {
    title: 'Product Stock Report',
    description: 'Current inventory levels for all products.',
    href: '/inventory',
    icon: Boxes,
    permission: 'view_inventory',
  },
  {
    title: 'Customer Recovery & Sale',
    description: 'Individual customer transaction history.',
    href: '/partner-ledger',
    icon: HandCoins,
    permission: 'view_partner_ledger',
  },
   {
    title: 'General Journal / Ledger',
    description: 'View all financial transactions chronologically.',
    href: '/ledger',
    icon: BookOpen,
    permission: 'view_ledger',
  },
  {
    title: 'Cash Flow Report',
    description: 'Track cash in, cash out, and balance over time.',
    href: '/ledger',
    icon: Wallet,
    permission: 'view_ledger',
  },
  {
    title: 'Expense Report',
    description: 'View a detailed breakdown of all business expenses.',
    href: '/expenses',
    icon: Receipt,
    permission: 'view_expenses',
  },
  {
    title: 'Payments & Advances Report',
    description: 'View all customer payments and cash advances.',
    href: '/cash-customer-payments',
    icon: Wallet,
    permission: 'view_cash_advances',
  },
];

const ReportCard = ({ title, description, href, icon: Icon }: ReportCardProps) => (
  <Card className="flex flex-col hover:shadow-lg transition-shadow rounded-2xl">
    <CardHeader className="flex-row items-center gap-4 space-y-0">
      <div className="p-3 bg-muted rounded-full">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <div>
        <CardTitle>{title}</CardTitle>
      </div>
    </CardHeader>
    <CardContent className="flex-grow">
      <p className="text-sm text-muted-foreground">{description}</p>
    </CardContent>
    <CardContent>
      <Button asChild variant="link" className="p-0 h-auto">
        <Link href={href} target="_blank" rel="noopener noreferrer">
          View Report <ArrowRight className="ml-2 w-4 h-4" />
        </Link>
      </Button>
    </CardContent>
  </Card>
);

export default function ReportsPage() {
  const { dateRange, setDateRange } = useDatabase();
  const availableReports = reportList;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileBarChart className="w-8 h-8" /> Reports Hub
          </h1>
          <p className="text-muted-foreground">Select a report to view detailed analytics about your business operations.</p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="date"
                variant={"outline"}
                className={cn(
                  "w-[300px] justify-start text-left font-normal",
                  !dateRange && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "dd-MMM-yyyy")} -{" "}
                      {format(dateRange.to, "dd-MMM-yyyy")}
                    </>
                  ) : (
                    format(dateRange.from, "dd-MMM-yyyy")
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
          <Button asChild variant="outline">
            <Link href="/"><LayoutDashboard className="mr-2" />Go to Dashboard</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {availableReports.map(report => (
          <ReportCard key={report.title} {...report} />
        ))}
      </div>
    </div>
  );
}
