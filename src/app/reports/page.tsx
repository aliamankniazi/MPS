
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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ReportCardProps {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  permission?: string; // Placeholder for future RBAC
}

const reportList: ReportCardProps[] = [
  {
    title: 'Date Wise Sale And Recovery Report',
    description: 'Track customer payments and balances.',
    href: '/credit-recovery',
    icon: CreditCard,
  },
  {
    title: 'Customer Defaulter Report',
    description: 'View customers with outstanding balances.',
    href: '/credit-recovery',
    icon: UserX,
  },
    {
    title: 'Supplier Report',
    description: 'View purchases, payments, and balances for suppliers.',
    href: '/supplier-report',
    icon: Truck,
  },
  {
    title: 'Date Wise Business Report',
    description: "A high-level business overview without individual journal entries.",
    href: '/ledger',
    icon: Briefcase,
  },
  {
    title: 'Product Wise Sale Report',
    description: 'Show Product Wise Sale Reports',
    href: '/ledger',
    icon: Package,
  },
  {
    title: 'Product Profit Margin Report',
    description: 'Analyze profit margins for each product.',
    href: '/summary',
    icon: Percent,
  },
  {
    title: 'Product Profit/Loss by Invoice',
    description: 'Show Loss And Profit By Invoice in that report',
    href: '/ledger',
    icon: TrendingUp,
  },
  {
    title: 'Total Investment Report',
    description: 'Summary of total capital invested by partners.',
    href: '/investments',
    icon: PiggyBank,
  },
  {
    title: 'Stock Sale & Purchase Report',
    description: 'Detailed report of stock ins and outs.',
    href: '/all-transactions',
    icon: History,
  },
  {
    title: 'Sale & Return Report',
    description: 'Unified view of all sales and returns.',
    href: '/all-transactions',
    icon: ShoppingCart,
  },
  {
    title: 'Product Stock Report',
    description: 'Current inventory levels for all products.',
    href: '/inventory',
    icon: Boxes,
  },
  {
    title: 'Customer Recovery & Sale',
    description: 'Individual customer transaction history.',
    href: '/partner-ledger',
    icon: HandCoins,
  },
   {
    title: 'General Journal / Ledger',
    description: 'View all financial transactions chronologically.',
    href: '/ledger',
    icon: BookOpen,
  },
  {
    title: 'Cash Flow Report',
    description: 'Track cash in, cash out, and balance over time.',
    href: '/ledger',
    icon: Wallet,
  },
];

const ReportCard = ({ title, description, href, icon: Icon }: ReportCardProps) => (
  <Card className="flex flex-col hover:shadow-lg transition-shadow">
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
        <Link href={href}>
          View Report <ArrowRight className="ml-2 w-4 h-4" />
        </Link>
      </Button>
    </CardContent>
  </Card>
);

export default function ReportsPage() {
  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileBarChart className="w-8 h-8" /> Reports Hub
          </h1>
          <p className="text-muted-foreground">Select a report to view detailed analytics about your business operations.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard"><LayoutDashboard className="mr-2"/>Go to Dashboard</Link>
        </Button>
      </div>
      
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {reportList.map(report => (
          <ReportCard key={report.title} {...report} />
        ))}
      </div>
    </div>
  );
}
