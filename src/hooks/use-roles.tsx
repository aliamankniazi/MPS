
'use client';

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import type { Role, RoleId, Permission } from '@/lib/types';
import { useAuth } from './use-auth';
import { AppLayout } from '@/components/app-layout';
import { usePathname } from 'next/navigation';
import { db } from '@/lib/firebase';
import { ref, onValue, set, push, update } from 'firebase/database';

const DB_PATH = 'roles';

export const PERMISSIONS = [
    'view_dashboard', 'view_all_transactions', 'delete_transaction',
    'view_customers', 'add_customer', 'edit_customer', 'delete_customer',
    'view_partner_ledger', 'view_credit_recovery',
    'view_cash_advances', 'add_cash_advance', 'delete_cash_advance',
    'view_inventory', 'view_purchases', 'add_purchase', 'delete_purchase',
    'view_purchase_returns', 'add_purchase_return', 'delete_purchase_return',
    'view_tank_readings', 'add_tank_reading',
    'view_supplier_payments', 'add_supplier_payment', 'delete_supplier_payment',
    'view_investments', 'add_investment', 'delete_investment',
    'view_expenses', 'add_expense', 'delete_expense',
    'view_other_incomes', 'add_other_income', 'delete_other_income',
    'view_ledger', 'view_summary', 'generate_ai_summary',
    'manage_employees', 'manage_banks',
    'view_settings', 'manage_roles', 'manage_users'
] as const;

export type { Permission };

const DEFAULT_ROLES: Role[] = [
    {
        id: 'admin',
        name: 'Admin',
        permissions: [...PERMISSIONS],
    },
    {
        id: 'attendant',
        name: 'Attendant',
        permissions: ['view_dashboard'],
    }
];

interface RolesContextType {
    roles: Role[];
    addRole: (role: Omit<Role, 'id'>) => void;
    updateRole: (id: RoleId, updatedRole: Omit<Role, 'id'>) => void;
    deleteRole: (id: RoleId) => void;
    hasPermission: (permission: Permission) => boolean;
}

const RolesContext = createContext<RolesContextType | undefined>(undefined);

export function RolesProvider({ children }: { children: ReactNode }) {
    const [roles, setRoles] = useState<Role[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const { user, userRole, loading: authLoading } = useAuth();
    const pathname = usePathname();
    const isAuthPage = pathname === '/login' || pathname === '/signup';

    useEffect(() => {
        if (!db) {
            setRoles(DEFAULT_ROLES);
            setIsLoaded(true);
            return;
        }
        const rolesRef = ref(db, DB_PATH);
        const unsubscribe = onValue(rolesRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const rolesList: Role[] = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                }));
                setRoles(rolesList);
            } else {
                // If no roles in DB, set the default ones
                const updates: Record<string, Omit<Role, 'id'>> = {};
                DEFAULT_ROLES.forEach(r => {
                    updates[`${DB_PATH}/${r.id}`] = { name: r.name, permissions: r.permissions };
                });
                update(ref(db), updates);
                setRoles(DEFAULT_ROLES);
            }
            setIsLoaded(true);
        });

        return () => unsubscribe();
    }, []);

    const addRole = useCallback((role: Omit<Role, 'id'>) => {
        if (!db) return;
        const newRoleRef = push(ref(db, DB_PATH));
        set(newRoleRef, role);
    }, []);

    const updateRole = useCallback((id: RoleId, updatedRole: Omit<Role, 'id'>) => {
        if (!db) return;
        const roleRef = ref(db, `${DB_PATH}/${id}`);
        set(roleRef, updatedRole);
    }, []);

    const deleteRole = useCallback((id: RoleId) => {
        if (!db || id === 'admin') return;
        const roleRef = ref(db, `${DB_PATH}/${id}`);
        set(roleRef, null);
    }, []);

    const hasPermission = useCallback((permission: Permission): boolean => {
        if (!userRole) return false;
        // The admin role ALWAYS has all permissions.
        if (userRole === 'admin') return true;
        const role = roles.find(r => r.id === userRole);
        if (!role) return false;
        return role.permissions.includes(permission);
    }, [userRole, roles]);

    const value = {
        roles,
        addRole,
        updateRole,
        deleteRole,
        hasPermission,
    };
    
    if (authLoading || !isLoaded) {
      return (
        <div className="flex h-screen w-full items-center justify-center">
            <p>Loading user permissions...</p>
        </div>
      );
    }
    
    return (
        <RolesContext.Provider value={value}>
            {user && !isAuthPage ? <AppLayout hasPermission={hasPermission}>{children}</AppLayout> : children}
        </RolesContext.Provider>
    );
}

export const useRoles = () => {
    const context = useContext(RolesContext);
    if (context === undefined) {
        throw new Error('useRoles must be used within a RolesProvider');
    }
    return context;
};
