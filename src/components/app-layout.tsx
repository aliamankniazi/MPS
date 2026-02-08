
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
import { FileText, Settings, LayoutDashboard, ShoppingCart, BookOpen, Users, Package, DollarSign, ArrowRightLeft, LogOut, Fuel, FileBarChart, HandCoins, History, Redo, Contact, CalendarCheck, PiggyBank, Box, Cog, Wrench, Receipt, Landmark, Sun, Truck, BrainCircuit, Sparkles, Shield, Trash2, BookKey, Droplets, Briefcase, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { SheetTitle } from './ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';


const navGroups = [
    {
        title: 'Transactions',
        icon: History,
        links: [
            { href: '/all-transactions', label: 'All Transactions', icon: History },
            { href: '/all-invoices', label: 'All Invoices', icon: Receipt },
            { href: '/ledger', label: 'General Journal', icon: BookOpen },
            { href: '/credit-recovery', label: 'Credit Recovery', icon: HandCoins },
            { href: '/cash-credit-sales', label: 'Sales By Type', icon: Droplets },
        ]
    },
    {
        title: 'Purchases & Suppliers',
        icon: ShoppingCart,
        links: [
            { href: '/purchases', label: 'Purchases', icon: ShoppingCart },
            { href: '/purchase-returns', label: 'Purchase Returns', icon: Redo },
            { href: '/suppliers', label: 'Suppliers', icon: Contact },
            { href: '/partner-ledger', label: 'Unified Ledger', icon: BookOpen },
            { href: '/supplier-report', label: 'Supplier Report', icon: Truck },
        ]
    },
    {
        title: 'Financials',
        icon: DollarSign,
        links: [
            { href: '/expenses', label: 'Expenses', icon: Receipt },
            { href: '/other-incomes', label: 'Other Incomes', icon: DollarSign },
            { href: '/bank-management', label: 'Bank Management', icon: Landmark },
        ]
    },
    {
        title: 'People & Partners',
        icon: Users,
        links: [
            { href: '/customers', label: 'Customers & Partners', icon: Users },
            { href: '/employees', label: 'Employees & Salary', icon: Briefcase },
            { href: '/investments', label: 'Partner Investments', icon: PiggyBank },
        ]
    },
    {
        title: 'Inventory',
        icon: Package,
        links: [
            { href: '/inventory', label: 'Stock Levels', icon: Box },
            { href: '/stock-adjustment', label: 'Stock Adjustment', icon: Wrench },
            { href: '/machines', label: 'Machine Reading', icon: Fuel },
        ]
    },
    {
        title: 'System',
        icon: Cog,
        links: [
            { href: '/tasks', label: 'Task Automation', icon: BrainCircuit },
            { href: '/ai-summary', label: 'AI Summary', icon: Sparkles },
            { href: '/roles', label: 'Role Management', icon: Shield },
            { href: '/dictionary', label: 'Dictionary', icon: BookKey },
            { href: '/recycle-bin', label: 'Recycle Bin', icon: Trash2 },
        ]
    }
]

const AppLogo = () => (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="bg-primary rounded-lg p-2 text-primary-foreground">
        <Fuel className="w-6 h-6" />
      </div>
      <div className="flex flex-col">
        <h2 className="text-lg font-bold tracking-tighter text-primary">Mianwali Petroleum Service</h2>
      </div>
    </Link>
);

const topNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/sales', label: 'New Transaction', icon: ArrowRightLeft },
];

const bottomNavItems = [
  { href: '/reports', label: 'Reports', icon: FileBarChart },
  { href: '/settings', label: 'Settings', icon: Settings },
]

const SESSION_DURATION_MINUTES = 120;
const SESSION_DURATION_SECONDS = SESSION_DURATION_MINUTES * 60;
const WARNING_TIME_SECONDS = 60;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuth();
  const pathname = usePathname();
  
  const [remainingTime, setRemainingTime] = React.useState(SESSION_DURATION_SECONDS);
  const [showWarning, setShowWarning] = React.useState(false);
  const intervalRef = React.useRef<NodeJS.Timeout>();

  const isLinkActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href) && href !== '/';
  }

  const resetTimer = React.useCallback(() => {
    setRemainingTime(SESSION_DURATION_SECONDS);
    setShowWarning(false);
  }, []);

  React.useEffect(() => {
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach(event => window.addEventListener(event, resetTimer));
    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [resetTimer]);

  React.useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemainingTime(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          signOut();
          return 0;
        }
        if (prev <= WARNING_TIME_SECONDS + 1) {
          setShowWarning(true);
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current!);
  }, [signOut]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader className='p-4'>
              <AppLogo />
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {topNavItems.map(item => (
                <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isLinkActive(item.href)} tooltip={item.label} className={cn(item.href === '/' && 'text-green-600 hover:text-green-700 data-[active=true]:text-green-700')}>
                        <Link href={item.href}>
                            <item.icon />
                            <span>{item.label}</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              
              <SidebarMenuItem>
                <div className="w-full h-px bg-sidebar-border my-2" />
              </SidebarMenuItem>

              {navGroups.map((group) => (
                <Collapsible asChild key={group.title} defaultOpen>
                  <SidebarGroup>
                      <CollapsibleTrigger asChild>
                           <SidebarGroupLabel className="flex items-center text-red-500 font-bold w-full cursor-pointer hover:bg-sidebar-accent/50">
                              <group.icon className="mr-2"/>
                              {group.title}
                          </SidebarGroupLabel>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                              {group.links.map(link => (
                              <SidebarMenuSubItem key={link.href}>
                                  <SidebarMenuSubButton
                                      asChild
                                      isActive={isLinkActive(link.href)}
                                      target={(link as any).target || '_self'}
                                      rel={(link as any).target === '_blank' ? 'noopener noreferrer' : undefined}
                                  >
                                      <Link href={link.href}>
                                          <link.icon/>
                                          <span>{link.label}</span>
                                      </Link>
                                  </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              ))}
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              {bottomNavItems.map(item => (
                <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isLinkActive(item.href)} tooltip={item.label}>
                        <Link href={item.href}>
                            <item.icon />
                            <span>{item.label}</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <div className="flex items-center justify-center gap-2 px-2 py-1.5 text-xs text-sidebar-foreground/70">
                  <Clock className="size-3" />
                  <span>Session expires in: {formatTime(remainingTime)}</span>
                </div>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Button variant="ghost" className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={signOut}>
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

      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Session Expiration Warning</AlertDialogTitle>
            <AlertDialogDescription>
              You will be logged out due to inactivity in about a minute. Do you want to stay logged in?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={signOut}>Logout</AlertDialogCancel>
            <AlertDialogAction onClick={resetTimer}>Stay Logged In</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

