
'use client';

import { Button } from "@/components/ui/button";
import { DollarSign, Redo, ShoppingCart, User, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function TransactionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname();
  
  const navItems = [
    { href: '/', label: 'Sale', icon: ShoppingCart },
    { href: '/customer-payments', label: 'Customer Payment', icon: Wallet },
    { href: '/supplier-payments', label: 'Supplier Payment', icon: Redo },
    { href: '/cash-advances', label: 'Cash Advance', icon: DollarSign },
    { href: '/employees', label: 'Salary Payment', icon: User },
  ];

  return (
    <div className="bg-muted/30 min-h-screen">
      <header className="bg-background shadow-sm sticky top-0 z-20">
        <div className="container mx-auto px-4">
          <nav className="flex items-center space-x-1 overflow-x-auto">
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
          </nav>
        </div>
      </header>
      {children}
    </div>
  )
}
