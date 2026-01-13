

'use client';

import {
  createContext,
  useState,
  useEffect,
  useContext,
  type ReactNode,
  useCallback,
} from 'react';
import {
  onAuthStateChanged,
  type User,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import type { AuthFormValues, RoleId, Role, Permission } from '@/lib/types';
import { usePathname, useRouter } from 'next/navigation';
import { ref, onValue, set, get, update, push } from 'firebase/database';
import { AppLayout } from '@/components/app-layout';
import { useDatabase } from './use-database';

const PERMISSIONS = [
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


const DB_ROLES_PATH = 'roles';

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


interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (data: AuthFormValues) => Promise<any>;
  signUp: (data: AuthFormValues) => Promise<any>;
  signOut: () => Promise<void>;
  userRole: RoleId | null;
  roles: Role[];
  addRole: (role: Omit<Role, 'id'>) => void;
  updateRole: (id: RoleId, updatedRole: Omit<Role, 'id'>) => void;
  deleteRole: (id: RoleId) => void;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userRole, setUserRole] = useState<RoleId | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const { isLoaded: isDatabaseLoaded } = useDatabase();

  const router = useRouter();
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/signup';

  // Effect for fetching roles from DB
  useEffect(() => {
    if (!db) {
        setRoles(DEFAULT_ROLES);
        setRolesLoading(false);
        return;
    }
    const rolesRef = ref(db, DB_ROLES_PATH);
    const unsubscribe = onValue(rolesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const rolesList: Role[] = Object.keys(data).map(key => ({ id: key, ...data[key] }));
            setRoles(rolesList);
        } else {
            // If no roles in DB, set default roles
            const updates: Record<string, Omit<Role, 'id'>> = {};
            DEFAULT_ROLES.forEach(r => {
                updates[`${DB_ROLES_PATH}/${r.id}`] = { name: r.name, permissions: r.permissions };
            });
            update(ref(db), updates);
            setRoles(DEFAULT_ROLES);
        }
        setRolesLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Effect for tracking user auth state
  useEffect(() => {
    if (!auth) {
        setAuthLoading(false);
        return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Effect for tracking user role from DB
  useEffect(() => {
    if (user && db) {
      const userRoleRef = ref(db, `userRoles/${user.uid}`);
      const unsubscribe = onValue(userRoleRef, (snapshot) => {
        setUserRole(snapshot.val() || null);
      });
      return () => unsubscribe();
    } else {
      setUserRole(null);
    }
  }, [user]);

  const hasPermission = useCallback((permission: Permission): boolean => {
      if (!userRole) return false;
      if (userRole === 'admin') return true; // Admin has all permissions
      const role = roles.find(r => r.id === userRole);
      if (!role) return false;
      return role.permissions.includes(permission);
  }, [userRole, roles]);

  const addRole = useCallback((role: Omit<Role, 'id'>) => {
      if (!db) return;
      push(ref(db, DB_ROLES_PATH), role);
  }, []);

  const updateRole = useCallback((id: RoleId, updatedRole: Omit<Role, 'id'>) => {
      if (!db) return;
      set(ref(db, `${DB_ROLES_PATH}/${id}`), updatedRole);
  }, []);

  const deleteRole = useCallback((id: RoleId) => {
      if (!db || id === 'admin') return;
      set(ref(db, `${DB_ROLES_PATH}/${id}`), null);
  }, []);

  const assignRoleToUser = (userId: string, roleId: RoleId) => {
    if (!db) return;
    set(ref(db, `userRoles/${userId}`), roleId);
  };

  const signIn = (data: AuthFormValues) => {
    if (!auth) return Promise.reject(new Error("Firebase is not configured."));
    return signInWithEmailAndPassword(auth, data.email, data.password);
  };

  const signUp = async (data: AuthFormValues) => {
    if (!auth || !db) throw new Error("Firebase is not configured.");

    const userRolesRef = ref(db, 'userRoles');
    const snapshot = await get(userRolesRef);
    const hasUsers = snapshot.exists();
    
    const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
    
    // First user to sign up becomes an admin
    if (!hasUsers) {
      assignRoleToUser(userCredential.user.uid, 'admin');
    } else {
      assignRoleToUser(userCredential.user.uid, 'attendant'); // Default role for subsequent users
    }
    
    return userCredential;
  };

  const signOut = async () => {
    if (auth) {
      await firebaseSignOut(auth);
    }
  };
  
  const isLoading = authLoading || rolesLoading;

  useEffect(() => {
    if (isLoading) return; // Wait until auth state is resolved

    if (!user && !isAuthPage) {
        router.push('/login');
    }
    if (user && isAuthPage) {
        router.push('/');
    }
  }, [user, isLoading, isAuthPage, router]);


  const value = {
    user,
    loading: isLoading,
    signIn,
    signUp,
    signOut,
    userRole,
    roles,
    addRole,
    updateRole,
    deleteRole,
    hasPermission
  };
  
  if (isLoading && !isAuthPage) {
     return (
        <div className="flex h-screen w-full items-center justify-center">
            <p>Loading user permissions...</p>
        </div>
    );
  }
  
  return (
      <AuthContext.Provider value={value}>
        {user && !isAuthPage && isDatabaseLoaded ? <AppLayout hasPermission={hasPermission}>{children}</AppLayout> : children}
        {user && !isAuthPage && !isDatabaseLoaded && (
            <div className="flex h-screen w-full items-center justify-center">
                <p>Loading database...</p>
            </div>
        )}
      </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
