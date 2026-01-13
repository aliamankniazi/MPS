
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BrainCircuit } from 'lucide-react';

const TaskList = ({ title, tasks }: { title: string, tasks: string[] }) => (
    <div className="mb-6">
        <h3 className="text-xl font-semibold mb-3">{title}</h3>
        <ul className="space-y-2 list-disc pl-5 text-muted-foreground">
            {tasks.map((task, index) => (
                <li key={index}>{task}</li>
            ))}
        </ul>
    </div>
);

export default function TasksPage() {
    const dailyTasks = ['Backup database', 'Generate daily report', 'Sync stock'];
    const weeklyTasks = ['Profit analysis', 'Defaulter reminders', 'Expense review'];
    const monthlyTasks = ['P&L statement', 'Tax report', 'Partner investment report'];

    return (
        <div className="p-4 md:p-8">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BrainCircuit />
                        Task & Automation System
                    </CardTitle>
                    <CardDescription>
                        An overview of automated and scheduled tasks for the system.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                   <div className="grid md:grid-cols-3 gap-8">
                        <TaskList title="Daily Tasks" tasks={dailyTasks} />
                        <TaskList title="Weekly Tasks" tasks={weeklyTasks} />
                        <TaskList title="Monthly Tasks" tasks={monthlyTasks} />
                   </div>
                </CardContent>
            </Card>
        </div>
    );
}
