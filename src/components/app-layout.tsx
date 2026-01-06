

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
} from '@/components/ui/sidebar';
import { FileText, Settings, LayoutDashboard, ShoppingCart, BookOpen, Users, Package, DollarSign, ArrowRightLeft, LogOut, Fuel } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from './ui/button';
import { useRoles } from '@/hooks/use-roles';
import type { Permission } from '@/hooks/use-roles';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'view_dashboard' as Permission },
  { href: '/', label: 'New Transaction', icon: ArrowRightLeft, permission: 'view_dashboard' as Permission },
  { href: '/all-transactions', label: 'Transactions', icon: BookOpen, permission: 'view_all_transactions' as Permission },
  { href: '/purchases', label: 'Purchases & Suppliers', icon: ShoppingCart, permission: 'view_purchases' as Permission },
  { href: '/customers', label: 'People & Partners', icon: Users, permission: 'view_customers' as Permission },
  { href: '/inventory', label: 'Inventory', icon: Package, permission: 'view_inventory' as Permission },
  { href: '/ledger', label: 'Financials', icon: DollarSign, permission: 'view_ledger' as Permission },
  { href: '/summary', label: 'Reports', icon: FileText, permission: 'view_summary' as Permission },
  { href: '/settings', label: 'Settings', icon: Settings, permission: 'view_settings' as Permission },
];


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


export function AppLayout({ children, hasPermission }: { children: React.ReactNode, hasPermission: (permission: Permission) => boolean }) {
  const { signOut, user } = useAuth();
  const pathname = usePathname();
  const [currentTime, setCurrentTime] = React.useState('');

  React.useEffect(() => {
    const timer = setInterval(() => {
        setCurrentTime(new Date().toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  
  const getPageTitle = () => {
    for (const item of navItems) {
      if ('href' in item && (pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)))) {
        return item.label;
      }
    }
    // Fallback titles for dynamic routes
    if (pathname.includes('/customers/') && pathname.includes('/ledger')) return 'Partner Ledger';
    if (pathname.includes('/invoice/')) return 'Invoice';
    if (pathname.includes('/all-transactions')) return 'Transactions';
    if (pathname.includes('/credit-recovery')) return 'Credit Recovery';
    if (pathname.includes('/partner-ledger')) return 'Unified Ledger';


    return 'New Transaction';
  }

  const pageTitle = getPageTitle();

  const renderNavItem = (item: any) => {
    if (hasPermission(item.permission)) {
        const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
            <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                    <Link href={item.href} legacyBehavior={false}>
                        <item.icon />
                        <span>{item.label}</span>
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
        );
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
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/80 p-4 backdrop-blur-sm md:justify-end">
          <SidebarTrigger className="md:hidden" />
          <h2 className="text-xl font-semibold md:hidden">{pageTitle}</h2>
          <div className="hidden md:flex items-center gap-4">
              <p className="text-sm">{currentTime}</p>
              <span className="text-sm">{user?.email}</span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
