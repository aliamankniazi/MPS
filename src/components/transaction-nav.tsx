
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
    Receipt
} from 'lucide-react';

const navItems = [
  { href: '/sales', label: 'Sale', icon: ShoppingCart },
  { href: '/purchases', label: 'Purchase', icon: Truck },
  { href: '/customer-payments', label: 'Customer Payment', icon: Wallet },
  { href: '/supplier-payments', label: 'Supplier Payment', icon: Redo },
  { href: '/expenses', label: 'Add Expense', icon: Receipt },
  { href: '/cash-advances', label: 'Cash Advance', icon: DollarSign },
  { href: '/employees', label: 'Salary Payment', icon: User },
  { href: '/sale-returns', label: 'Sale Return', icon: Undo },
  { href: '/purchase-returns', label: 'Purchase Return', icon: Undo2 },
];

export function TransactionNav() {
    const pathname = usePathname();
    return (
        <nav className="bg-background shadow-sm">
            <div className="container mx-auto px-4 flex items-center space-x-1 overflow-x-auto">
                {navItems.map(item => (
                    <Button
                        asChild
                        key={item.href}
                        variant="ghost"
                        className={cn(
                            "border-b-2 rounded-none flex-shrink-0",
                            pathname === item.href ? "border-primary text-primary" : "border-transparent"
                        )}
                    >
                        <Link href={item.href}><item.icon className="mr-2"/> {item.label}</Link>
                    </Button>
                ))}
            </div>
        </nav>
    );
}
