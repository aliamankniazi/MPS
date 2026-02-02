
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
  Droplets,
  BarChart2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Permission } from '@/hooks/use-roles';
import { useDatabase } from '@/hooks/use-database';
import { DateRangePicker } from '@/components/date-range-picker';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface ReportCardProps {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
  isFrequentlyUsed?: boolean;
}

const reportList: ReportCardProps[] = [
  {
    title: 'Daily Business Summary',
    description: 'A day-by-day summary of sales, purchases, expenses, and profit.',
    href: '/daily-summary',
    icon: BarChart2,
    permission: 'view_summary',
    isFrequentlyUsed: true,
  },
  // New Report
  {
    title: 'Machine Reading Report',
    description: 'View machine readings, dispensed volume, and sales variance by unit and product.',
    href: '/machine-reading-report',
    icon: BarChart2,
    permission: 'view_tank_readings',
    isFrequentlyUsed: true,
  },
  {
    title: 'Cash & Credit Sales Report',
    description: 'Breaks down fuel sales by volume (in liters) for cash and credit transactions.',
    href: '/cash-credit-sales',
    icon: Droplets,
    permission: 'view_sales_by_type_report',
    isFrequentlyUsed: true,
  },
  {
    title: 'Real-Time Profit/Loss Report',
    description: 'Live profit/loss calculation based on sales, purchases, and expenses.',
    href: '/profit-loss-report',
    icon: TrendingUp,
    permission: 'view_summary',
    isFrequentlyUsed: true,
  },
  // Sales & Customer Reports
  {
    title: 'Date Wise Sale And Recovery Report',
    description: 'Track customer payments and balances.',
    href: '/credit-recovery',
    icon: CreditCard,
    permission: 'view_credit_recovery',
    isFrequentlyUsed: true,
  },
  {
    title: 'Top Customers Report',
    description: 'Identify and rank top customers based on sales.',
    href: '/top-customers',
    icon: Users,
    permission: 'view_dashboard',
  },
  {
    title: 'Customer Defaulter Report',
    description: 'View customers with outstanding balances and last transaction time.',
    href: '/defaulter-report',
    icon: UserX,
    permission: 'view_credit_recovery',
    isFrequentlyUsed: true,
  },
  {
    title: 'Customer Recovery & Sale',
    description: 'Individual customer transaction history.',
    href: '/partner-ledger',
    icon: HandCoins,
    permission: 'view_partner_ledger',
  },
  // Financial & General Reports
  {
    title: 'General Journal / Ledger',
    description: 'View all financial transactions chronologically.',
    href: '/ledger',
    icon: BookOpen,
    permission: 'view_ledger',
    isFrequentlyUsed: true,
  },
  {
    title: 'Salary Report',
    description: 'Calculate and view employee salaries based on attendance.',
    href: '/salary-report',
    icon: Briefcase,
    permission: 'manage_employees',
  },
  {
    title: 'Date Wise Business Report',
    description: "A high-level business overview without individual journal entries.",
    href: '/ledger',
    icon: Briefcase,
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
  // Product & Profitability Reports
  {
    title: 'Product Wise Sale Report',
    description: 'Show Product Wise Sale Reports',
    href: '/ledger',
    icon: Package,
    permission: 'view_ledger',
    isFrequentlyUsed: true,
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
  // Inventory & Supplier Reports
  {
    title: 'Stock Sale & Purchase Report',
    description: 'Detailed report of stock ins and outs.',
    href: '/all-transactions',
    icon: History,
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
    title: 'Supplier Report',
    description: 'View purchases, payments, and balances for suppliers.',
    href: '/supplier-report',
    icon: Truck,
    permission: 'view_purchases',
  },
  // Returns
  {
    title: 'Sale & Return Report',
    description: 'Unified view of all sales and returns.',
    href: '/all-transactions',
    icon: ShoppingCart,
    permission: 'view_all_transactions',
  },
  // Investments
  {
    title: 'Total Investment Report',
    description: 'Summary of total capital invested by partners.',
    href: '/investments',
    icon: PiggyBank,
    permission: 'view_investments',
  },
];


const ReportCard = ({ title, description, href, icon: Icon, isFrequentlyUsed }: ReportCardProps) => (
  <Card className={cn("flex flex-col hover:shadow-lg transition-shadow rounded-2xl", isFrequentlyUsed ? "border-red-500" : "border-blue-500")}>
    <CardHeader className="flex-row items-center gap-4 space-y-0">
      <div className="p-3 bg-muted rounded-full">
        <Icon className={cn("w-6 h-6", isFrequentlyUsed ? "text-red-500" : "text-blue-500")} />
      </div>
      <div>
        <CardTitle className={cn(isFrequentlyUsed ? "text-red-500" : "text-blue-500")}>{title}</CardTitle>
      </div>
    </CardHeader>
    <CardContent className="flex-grow">
      <p className="text-sm text-muted-foreground">{description}</p>
    </CardContent>
    <CardContent>
      <Button asChild variant="link" className={cn("p-0 h-auto", isFrequentlyUsed ? "text-red-500" : "text-blue-500")}>
        <Link href={href}>
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
          <DateRangePicker date={dateRange} onDateChange={setDateRange} />
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
