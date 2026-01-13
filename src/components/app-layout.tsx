
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { FileText, Settings, LayoutDashboard, ShoppingCart, BookOpen, Users, Package, DollarSign, ArrowRightLeft, LogOut, Fuel, FileBarChart, HandCoins, History, Redo, Contact, CalendarCheck, PiggyBank, Box, Cog, Wrench, Receipt, Landmark, Sun, Truck } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from './ui/button';
import { useRoles } from '@/hooks/use-roles';
import type { Permission } from '@/hooks/use-roles';
import { cn } from '@/lib/utils';


const navGroups = [
    {
        title: 'Transactions',
        icon: History,
        permission: 'view_all_transactions' as Permission,
        links: [
            { href: '/all-transactions', label: 'All Transactions', icon: History, permission: 'view_all_transactions' as Permission },
            { href: '/all-invoices', label: 'All Invoices', icon: Receipt, permission: 'view_all_transactions' as Permission },
            { href: '/ledger', label: 'General Journal', icon: BookOpen, permission: 'view_ledger' as Permission },
            { href: '/credit-recovery', label: 'Credit Recovery', icon: HandCoins, permission: 'view_credit_recovery' as Permission },
        ]
    },
    {
        title: 'Purchases & Suppliers',
        icon: ShoppingCart,
        permission: 'view_purchases' as Permission,
        links: [
            { href: '/purchases', label: 'Purchases', icon: ShoppingCart, permission: 'view_purchases' as Permission },
            { href: '/purchase-returns', label: 'Purchase Returns', icon: Redo, permission: 'view_purchase_returns' as Permission },
            { href: '/suppliers', label: 'Suppliers', icon: Contact, permission: 'view_settings' as Permission },
            { href: '/partner-ledger', label: 'Unified Ledger', icon: BookOpen, permission: 'view_partner_ledger' as Permission },
            { href: '/supplier-report', label: 'Supplier Report', icon: Truck, permission: 'view_purchases' as Permission },
        ]
    },
    {
        title: 'People & Partners',
        icon: Users,
        permission: 'view_customers' as Permission,
        links: [
            { href: '/customers', label: 'Customers & Partners', icon: Users, permission: 'view_customers' as Permission },
            { href: '/attendance', label: 'Attendance', icon: CalendarCheck, permission: 'manage_employees' as Permission },
            { href: '/investments', label: 'Partner Investments', icon: PiggyBank, permission: 'view_investments' as Permission },
        ]
    },
    {
        title: 'Inventory',
        icon: Package,
        permission: 'view_inventory' as Permission,
        links: [
            { href: '/inventory', label: 'Stock Levels', icon: Box, permission: 'view_inventory' as Permission },
            { href: '/stock-adjustment', label: 'Stock Adjustment', icon: Wrench, permission: 'view_settings' as Permission },
            { href: '/machines', label: 'Machine Reading', icon: Fuel, permission: 'view_tank_readings' as Permission },
        ]
    },
    {
        title: 'Financials',
        icon: DollarSign,
        permission: 'view_ledger' as Permission,
        links: [
            { href: '/expenses', label: 'Expenses', icon: Receipt, permission: 'view_expenses' as Permission },
            { href: '/other-incomes', label: 'Other Incomes', icon: DollarSign, permission: 'view_other_incomes' as Permission },
            { href: '/bank-management', label: 'Bank Management', icon: Landmark, permission: 'manage_banks' as Permission },
        ]
    }
]

const AppLogo = () => (
    <div className="flex items-center gap-2.5">
      <div className="bg-primary rounded-lg p-2 text-primary-foreground">
        <Fuel className="w-6 h-6" />
      </div>
      <div className="flex flex-col">
        <h2 className="text-lg font-bold tracking-tighter text-primary">Mianwali Petroleum</h2>
      </div>
    </div>
);

const topNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'view_dashboard' as Permission },
  { href: '/sales', label: 'New Transaction', icon: ArrowRightLeft, permission: 'view_dashboard' as Permission },
];

const bottomNavItems = [
  { href: '/reports', label: 'Reports', icon: FileBarChart, permission: 'view_summary' as Permission },
  { href: '/settings', label: 'Settings', icon: Settings, permission: 'view_settings' as Permission },
]

export function AppLayout({ children, hasPermission }: { children: React.ReactNode, hasPermission: (permission: Permission) => boolean }) {
  const { signOut, user } = useAuth();
  const pathname = usePathname();

  const isLinkActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href) && href !== '/';
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className='p-4'>
            <AppLogo />
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {topNavItems.map(item => hasPermission(item.permission) && (
              <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isLinkActive(item.href)} tooltip={item.label}>
                      <Link href={item.href} legacyBehavior={false}>
                          <item.icon />
                          <span>{item.label}</span>
                      </Link>
                  </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            
            <SidebarMenuItem>
              <div className="w-full h-px bg-sidebar-border my-2" />
            </SidebarMenuItem>

            {navGroups.map((group) => hasPermission(group.permission) && (
                <SidebarGroup key={group.title}>
                    <SidebarGroupLabel className="flex items-center">
                        <group.icon className="mr-2"/>
                        {group.title}
                    </SidebarGroupLabel>
                    <SidebarMenuSub>
                        {group.links.map(link => hasPermission(link.permission) && (
                        <SidebarMenuSubItem key={link.href}>
                            <SidebarMenuSubButton asChild isActive={isLinkActive(link.href)}>
                                <Link href={link.href}>
                                    <link.icon/>
                                    <span>{link.label}</span>
                                </Link>
                            </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        ))}
                    </SidebarMenuSub>
                </SidebarGroup>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            {bottomNavItems.map(item => hasPermission(item.permission) && (
              <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isLinkActive(item.href)} tooltip={item.label}>
                      <Link href={item.href} legacyBehavior={false}>
                          <item.icon />
                          <span>{item.label}</span>
                      </Link>
                  </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
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
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background/80 p-4 backdrop-blur-sm md:hidden">
          <SidebarTrigger />
        </header>
        <main className="flex-1 bg-muted/30">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
