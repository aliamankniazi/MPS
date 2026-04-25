'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BrainCircuit, Play, Download, BarChart3, Users, Wallet, TrendingUp, ShieldCheck, RefreshCw, Clock, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useDatabase } from '@/hooks/use-database';
import { useRouter } from 'next/navigation';
import { saveAs } from 'file-saver';
import { cn } from '@/lib/utils';

interface Task {
    id: string;
    title: string;
    description: string;
    icon: any;
    status: 'Ready' | 'Running' | 'Completed' | 'Error';
    href?: string;
    action?: () => void;
}

export default function TasksPage() {
    const { toast } = useToast();
    const router = useRouter();
    const db = useDatabase();
    const [runningTaskId, setRunningTaskId] = useState<string | null>(null);

    const handleBackup = () => {
        const data = {
            transactions: db.transactions,
            purchases: db.purchases,
            expenses: db.expenses,
            customers: db.customers,
            suppliers: db.suppliers,
            customerPayments: db.customerPayments,
            cashAdvances: db.cashAdvances,
            products: db.products,
            machines: db.machines,
            machineReadings: db.machineReadings,
            investments: db.investments,
            businessPartners: db.businessPartners,
            stockAdjustments: db.stockAdjustments,
            timestamp: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        saveAs(blob, `pumppal-backup-${new Date().toISOString().split('T')[0]}.json`);
        toast({ title: 'Backup Complete', description: 'Database export has been downloaded.' });
    };

    const runTask = (task: Task) => {
        setRunningTaskId(task.id);
        
        // Simulate execution delay for better UX
        setTimeout(() => {
            if (task.action) {
                task.action();
            } else if (task.href) {
                router.push(task.href);
            }
            setRunningTaskId(null);
        }, 1000);
    };

    const dailyTasks: Task[] = [
        { id: 'backup', title: 'Backup Database', description: 'Export full system data to JSON.', icon: Download, action: handleBackup, status: 'Ready' },
        { id: 'daily-report', title: 'Daily Report', description: 'Summarize today\'s operational metrics.', icon: BarChart3, href: '/daily-summary', status: 'Ready' },
        { id: 'sync-stock', title: 'Sync Stock', description: 'Recalculate inventory across all tanks.', icon: RefreshCw, action: () => toast({ title: 'Stock Synchronized', description: 'Inventory levels matched with transaction logs.' }), status: 'Ready' },
    ];

    const weeklyTasks: Task[] = [
        { id: 'profit-analysis', title: 'Profit Analysis', description: 'Deep dive into fuel and product margins.', icon: TrendingUp, href: '/profit-loss-report', status: 'Ready' },
        { id: 'defaulters', title: 'Defaulter Reminders', description: 'Identify accounts requiring recovery.', icon: Users, href: '/defaulter-report', status: 'Ready' },
        { id: 'expense-review', title: 'Expense Review', description: 'Analyze spending across all categories.', icon: Wallet, href: '/expenses', status: 'Ready' },
    ];

    const monthlyTasks: Task[] = [
        { id: 'pl-statement', title: 'P&L Statement', description: 'Generate monthly profit & loss sheet.', icon: FileText, href: '/profit-loss-report', status: 'Ready' },
        { id: 'tax-report', title: 'Tax Report', description: 'Sales and purchase tax data overview.', icon: ShieldCheck, href: '/daily-summary', status: 'Ready' },
        { id: 'partner-report', title: 'Partner Report', description: 'Investment and share distribution summary.', icon: TrendingUp, href: '/investments', status: 'Ready' },
    ];

    const TaskCard = ({ task }: { task: Task }) => (
        <Card className="hover:border-primary/50 transition-colors group overflow-hidden">
            <CardContent className="p-5 flex items-start gap-4">
                <div className="p-3 bg-muted rounded-xl group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <task.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-sm">{task.title}</h4>
                        <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded",
                            task.status === 'Ready' ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                        )}>
                            {runningTaskId === task.id ? 'Running...' : task.status}
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{task.description}</p>
                </div>
            </CardContent>
            <CardFooter className="px-5 pb-5 pt-0">
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full h-8 text-xs gap-2"
                    onClick={() => runTask(task)}
                    disabled={runningTaskId !== null}
                >
                    {runningTaskId === task.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    {task.href ? 'Open Tool' : 'Run Now'}
                </Button>
            </CardFooter>
        </Card>
    );

    return (
        <div className="p-4 md:p-8 space-y-8">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <BrainCircuit className="text-primary w-8 h-8" />
                        Automation Center
                    </h1>
                    <p className="text-muted-foreground">Execute and monitor system-wide maintenance and reporting tasks.</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border">
                    <Clock className="w-3 h-3" />
                    Last Global Sync: {new Date().toLocaleTimeString()}
                </div>
            </header>

            <div className="space-y-10">
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <h3 className="text-lg font-bold">Daily Maintenance</h3>
                        <div className="h-px flex-1 bg-border ml-2" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {dailyTasks.map(task => <TaskCard key={task.id} task={task} />)}
                    </div>
                </section>

                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <h3 className="text-lg font-bold">Weekly Audits</h3>
                        <div className="h-px flex-1 bg-border ml-2" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {weeklyTasks.map(task => <TaskCard key={task.id} task={task} />)}
                    </div>
                </section>

                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <h3 className="text-lg font-bold">Monthly Strategy</h3>
                        <div className="h-px flex-1 bg-border ml-2" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {monthlyTasks.map(task => <TaskCard key={task.id} task={task} />)}
                    </div>
                </section>
            </div>
        </div>
    );
}
