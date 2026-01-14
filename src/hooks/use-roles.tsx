

'use client';

import { useAuth } from './use-auth';
import type { Role, RoleId, Permission } from '@/lib/types';


export const useRoles = () => {
    // This hook now delegates directly to useAuth, which contains all role logic.
    const { 
        roles, 
        addRole, 
        updateRole, 
        deleteRole, 
        hasPermission 
    } = useAuth();
    
    return {
        roles,
        addRole,
        updateRole,
        deleteRole,
        hasPermission,
    };
};

export type { Permission, Role, RoleId };

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
