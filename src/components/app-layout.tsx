

'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar';
import { History, FileText, Settings, LayoutDashboard, ShoppingCart, Receipt, Undo2, Users, Landmark, Briefcase, Package, BookOpen, HandCoins, ArrowRightLeft, LogOut, Fuel, DollarSign, Beaker, Handshake, PiggyBank, Archive, BarChartHorizontal, Shield, FileBarChart, CalendarCheck, SlidersHorizontal, Gauge } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from './ui/button';
import { useRoles } from '@/hooks/use-roles';
import type { Permission } from '@/hooks/use-roles';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'view_dashboard' as Permission },
  { href: '/', label: 'New Transaction', icon: ArrowRightLeft, permission: 'view_dashboard' as Permission },
  { 
    group: 'Transactions',
    icon: BookOpen,
    items: [
      { href: '/all-transactions', label: 'All Transactions', icon: Archive, permission: 'view_all_transactions' as Permission },
      { href: '/all-invoices', label: 'All Invoices', icon: FileText, permission: 'view_all_transactions' as Permission },
      { href: '/ledger', label: 'General Journal', icon: BookOpen, permission: 'view_ledger' as Permission },
      { href: '/credit-recovery', label: 'Customer Recovery', icon: BarChartHorizontal, permission: 'view_credit_recovery' as Permission },
    ]
  },
  {
    group: 'Purchases & Suppliers',
    icon: ShoppingCart,
    items: [
        { href: '/purchase-returns', label: 'Purchase Returns', icon: Undo2, permission: 'view_purchase_returns' as Permission },
        { href: '/suppliers', label: 'Suppliers', icon: Users, permission: 'view_settings' as Permission },
        { href: '/partner-ledger', label: 'Unified Ledger', icon: HandCoins, permission: 'view_partner_ledger' as Permission },
    ]
  },
  {
    group: 'People & Partners',
    icon: Users,
    items: [
        { href: '/customers', label: 'Customers & Partners', icon: Users, permission: 'view_customers' as Permission },
        { href: '/employees', label: 'Employees', icon: Briefcase, permission: 'manage_employees' as Permission },
        { href: '/attendance', label: 'Attendance', icon: CalendarCheck, permission: 'manage_employees' as Permission },
        { href: '/investments', label: 'Partner Investments', icon: PiggyBank, permission: 'view_investments' as Permission },
    ]
  },
  {
    group: 'Inventory',
    icon: Package,
    items: [
        { href: '/inventory', label: 'Stock Levels', icon: Package, permission: 'view_inventory' as Permission },
        { href: '/stock-adjustment', label: 'Stock Adjustment', icon: SlidersHorizontal, permission: 'view_settings' as Permission },
        { href: '/tanks', label: 'Machine Reading', icon: Gauge, permission: 'view_tank_readings' as Permission },
    ]
  },
  {
    group: 'Financials',
    icon: DollarSign,
    items: [
        { href: '/expenses', label: 'Expenses', icon: Receipt, permission: 'view_expenses' as Permission },
        { href: '/other-incomes', label: 'Other Incomes', icon: DollarSign, permission: 'view_other_incomes' as Permission },
        { href: '/bank-management', label: 'Bank Management', icon: Landmark, permission: 'manage_banks' as Permission },
    ]
  },
  { href: '/reports', label: 'Reports', icon: FileBarChart, permission: 'view_summary' as Permission },
  { href: '/settings', label: 'Settings', icon: Settings, permission: 'view_settings' as Permission },
];


const AppLogo = () => (
    <div className="flex items-center gap-2.5">
      <div className="bg-primary rounded-lg p-2 text-primary-foreground">
        <Fuel className="w-6 h-6" />
      </div>
      <div className="flex flex-col">
        <h2 className="text-lg font-bold tracking-tighter text-primary">Mianwali</h2>
        <p className="text-xs text-muted-foreground -mt-1">Petroleum Service</p>
      </div>
    </div>
);


export function AppLayout({ children, hasPermission }: { children: React.ReactNode, hasPermission: (permission: Permission) => boolean }) {
  const { signOut } = useAuth();
  const pathname = usePathname();
  
  const getPageTitle = () => {
    for (const item of navItems) {
      if ('href' in item && (pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)))) {
        return item.label;
      }
      if ('group' in item) {
        for (const subItem of item.items) {
          if (pathname.startsWith(subItem.href)) {
            return subItem.label;
          }
        }
      }
    }
    return 'New Transaction';
  }

  const pageTitle = getPageTitle();

  const renderNavItem = (item: any) => {
    if ('href' in item && hasPermission(item.permission)) {
        return (
            <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.label}>
                    <Link href={item.href} legacyBehavior={false}>
                        <item.icon />
                        <span>{item.label}</span>
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
        );
    }
    if ('group' in item) {
        const visibleItems = item.items.filter((sub: any) => hasPermission(sub.permission));
        if (visibleItems.length === 0) return null;

        const isGroupActive = visibleItems.some((sub: any) => pathname.startsWith(sub.href));

        return (
            <Collapsible key={item.group} defaultOpen={isGroupActive}>
                <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                         <SidebarMenuButton className="!justify-start" tooltip={item.group}>
                            <item.icon />
                            <span>{item.group}</span>
                        </SidebarMenuButton>
                    </CollapsibleTrigger>
                </SidebarMenuItem>
                <CollapsibleContent>
                    <SidebarMenuSub>
                        {visibleItems.map((sub: any) => (
                             <SidebarMenuSubItem key={sub.href}>
                                <SidebarMenuSubButton asChild isActive={pathname.startsWith(sub.href)}>
                                    <Link href={sub.href} legacyBehavior={false}>
                                        <sub.icon />
                                        {sub.label}
                                    </Link>
                                </SidebarMenuSubButton>
                             </SidebarMenuSubItem>
                        ))}
                    </SidebarMenuSub>
                </CollapsibleContent>
            </Collapsible>
        )
    }
    return null;
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className='p-4 border-b border-sidebar-border'>
            <AppLogo />
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map(item => renderNavItem(item))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <Button variant="ghost" className="w-full justify-start gap-2" onClick={signOut}>
                <LogOut />
                Sign Out
              </Button>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="fixed inset-0 flex items-center justify-center -z-10 pointer-events-none">
          <div className="flex flex-col items-center text-center -rotate-12 opacity-5 dark:opacity-[0.02]">
            <h1 className="text-8xl font-black text-foreground/50 tracking-widest leading-none">
              Mianwali
            </h1>
            <h2 className="text-6xl font-bold text-foreground/50 tracking-wider">
              Petroleum Service
            </h2>
          </div>
        </div>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/80 p-4 backdrop-blur-sm md:justify-end">
          <SidebarTrigger className="md:hidden" />
          <h2 className="text-xl font-semibold md:hidden">{pageTitle}</h2>
        </header>
        <main className="flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
