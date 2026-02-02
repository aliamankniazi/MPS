'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
    ShoppingCart, 
    Wallet, 
    Undo, 
    Truck, 
    Redo, 
    Undo2, 
    DollarSign, 
    User,
    Wrench,
    ArrowRightLeft
} from 'lucide-react';
import { useDatabase } from '@/hooks/use-database';

const navItems = [
  { href: '/sales', label: 'New Transaction', icon: ArrowRightLeft, colorKey: 'Sale' },
  { href: '/sales', label: 'Sale', icon: ShoppingCart, colorKey: 'Sale' },
  { href: '/purchases', label: 'Purchase', icon: Truck, colorKey: 'Purchase' },
  { href: '/customer-payments', label: 'Customer Payment', icon: Wallet, colorKey: 'Customer Payment' },
  { href: '/supplier-payments', label: 'Supplier Payment', icon: Redo, colorKey: 'Supplier Payment' },
  { href: '/cash-advances', label: 'Cash Advance', icon: DollarSign, colorKey: 'Cash Advance' },
  { href: '/employees', label: 'Salary Payment', icon: User, colorKey: 'Salary' },
  { href: '/expenses', label: 'Expenses', icon: DollarSign, colorKey: 'Expense' },
  { href: '/sale-returns', label: 'Sale Return', icon: Undo, colorKey: 'Sale Return' },
  { href: '/purchase-returns', label: 'Purchase Return', icon: Undo2, colorKey: 'Purchase Return' },
  { href: '/stock-adjustment', label: 'Stock Adjustment', icon: Wrench, colorKey: 'Investment' },
];

export function TransactionNav() {
    const pathname = usePathname();
    const { colorSettings } = useDatabase();

    return (
        <nav className="bg-background shadow-sm">
            <div className="container mx-auto px-4 flex flex-wrap">
                {navItems.map(item => {
                    const color = colorSettings[item.colorKey || item.label] || '#6b7280';
                    const isActive = pathname === item.href;
                    return (
                        <Button
                            asChild
                            key={item.label}
                            variant="ghost"
                            className={cn(
                                "border-b-2 rounded-none flex-shrink-0 hover:bg-transparent",
                                isActive ? "font-semibold" : ""
                            )}
                            style={{
                                borderColor: isActive ? color : 'transparent'
                            }}
                        >
                            <Link href={item.href} style={{ color: color }} className="hover:opacity-80 transition-opacity">
                                <item.icon className="mr-2"/> {item.label}
                            </Link>
                        </Button>
                    );
                })}
            </div>
        </nav>
    );
}
