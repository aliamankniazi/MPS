
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
  type User,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { PERMISSIONS, type AuthFormValues, type RoleId, type Role, type Permission } from '@/lib/types';
import { usePathname, useRouter } from 'next/navigation';
import { AppLayout } from '@/components/app-layout';
import { useDatabase } from './use-database';
import { collection, onSnapshot, doc, setDoc, getDoc, updateDoc, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useFirebase } from '@/firebase';


const ROLES_COLLECTION = 'roles';
const USER_ROLES_COLLECTION = 'userRoles';

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
  updateUserRole: (userId: string, roleId: RoleId) => void;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: (user: User | null, isAuthPage: boolean, isLoading: boolean) => ReactNode }) {
  const { user, isUserLoading: authLoading, auth, firestore } = useFirebase();
  const [userRole, setUserRole] = useState<RoleId | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);

  const router = useRouter();
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/signup';

  // Effect for fetching roles from Firestore
  useEffect(() => {
    // Wait until auth state is confirmed before fetching roles.
    if (authLoading) {
        return;
    }
    // No user, no roles to fetch.
    if (!user) {
        setRoles([]);
        setRolesLoading(false);
        return;
    }
    if (!firestore) {
        setRoles(DEFAULT_ROLES);
        setRolesLoading(false);
        return;
    }
    const rolesCollectionRef = collection(firestore, ROLES_COLLECTION);
    const unsubscribe = onSnapshot(rolesCollectionRef, async (snapshot) => {
        if (snapshot.empty) {
            // If no roles in DB, set default roles
            const batch = writeBatch(firestore);
            DEFAULT_ROLES.forEach(r => {
                const roleRef = doc(firestore, ROLES_COLLECTION, r.id);
                batch.set(roleRef, { name: r.name, permissions: r.permissions });
            });
            await batch.commit();
            setRoles(DEFAULT_ROLES);
        } else {
            const rolesList: Role[] = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<Role, 'id'>) }));
            setRoles(rolesList);
        }
        setRolesLoading(false);
    }, (error) => {
        console.error("Error fetching roles:", error);
        const contextualError = new FirestorePermissionError({
            operation: 'list',
            path: ROLES_COLLECTION,
        });
        errorEmitter.emit('permission-error', contextualError);
        setRolesLoading(false);
    });
    return () => unsubscribe();
  }, [user, authLoading, firestore]); // Depend on user and authLoading

  // Effect for tracking user role from Firestore
  useEffect(() => {
    if (user && firestore) {
      const userRoleDocRef = doc(firestore, USER_ROLES_COLLECTION, user.uid);
      const unsubscribe = onSnapshot(userRoleDocRef, (docSnap) => {
        setUserRole(docSnap.exists() ? (docSnap.data().roleId as RoleId) : null);
      }, (error) => {
          console.error("Error fetching user role:", error);
          const contextualError = new FirestorePermissionError({
              operation: 'get',
              path: userRoleDocRef.path,
          });
          errorEmitter.emit('permission-error', contextualError);
      });
      return () => unsubscribe();
    } else {
      setUserRole(null);
    }
  }, [user, firestore]);

  const hasPermission = useCallback((permission: Permission): boolean => {
      if (!userRole) return false;
      if (userRole === 'admin') return true; // Admin has all permissions
      const role = roles.find(r => r.id === userRole);
      if (!role) return false;
      return role.permissions.includes(permission);
  }, [userRole, roles]);

  const addRole = (role: Omit<Role, 'id'>) => {
    if (!firestore) return;
    const newRoleRef = doc(collection(firestore, ROLES_COLLECTION));
    setDoc(newRoleRef, role).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: newRoleRef.path,
            operation: 'create',
            requestResourceData: role,
        }));
    });
  };

  const updateRole = (id: RoleId, updatedRole: Omit<Role, 'id'>) => {
    if (!firestore) return;
    const roleRef = doc(firestore, ROLES_COLLECTION, id);
    updateDoc(roleRef, updatedRole).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: roleRef.path,
            operation: 'update',
            requestResourceData: updatedRole,
        }));
    });
  };

  const deleteRole = (id: RoleId) => {
    if (!firestore || id === 'admin') return;
    const roleRef = doc(firestore, ROLES_COLLECTION, id);
    deleteDoc(roleRef).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: roleRef.path,
            operation: 'delete',
        }));
    });
  };

  const assignRoleToUser = (userId: string, roleId: RoleId, email: string) => {
    if (!firestore) return;
    const userRoleRef = doc(firestore, USER_ROLES_COLLECTION, userId);
    const roleData = { roleId, email };
    setDoc(userRoleRef, roleData).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: userRoleRef.path,
            operation: 'create',
            requestResourceData: roleData,
        }));
    });
  };

  const updateUserRole = (userId: string, roleId: RoleId) => {
    if (!firestore) return;
    const userRoleRef = doc(firestore, USER_ROLES_COLLECTION, userId);
    updateDoc(userRoleRef, { roleId }).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: userRoleRef.path,
            operation: 'update',
            requestResourceData: { roleId },
        }));
    });
  };

  const resetPassword = (email: string) => {
    if (!auth) return Promise.reject(new Error("Firebase Auth is not configured."));
    return sendPasswordResetEmail(auth, email);
  };

  const signIn = (data: AuthFormValues) => {
    if (!auth) return Promise.reject(new Error("Firebase is not configured."));
    return signInWithEmailAndPassword(auth, data.email, data.password);
  };

  const signUp = async (data: AuthFormValues) => {
    if (!auth || !firestore) throw new Error("Firebase is not configured.");

    const userRolesCollectionRef = collection(firestore, USER_ROLES_COLLECTION);
    
    let hasUsers = false;
    try {
        const snapshot = await getDocs(userRolesCollectionRef);
        hasUsers = !snapshot.empty;
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: userRolesCollectionRef.path,
            operation: 'list',
        }));
        // Re-throw to prevent further execution and let the caller handle it.
        throw error;
    }
    
    const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
    
    // First user to sign up becomes an admin
    if (!hasUsers) {
      assignRoleToUser(userCredential.user.uid, 'admin', data.email);
    } else {
      assignRoleToUser(userCredential.user.uid, 'attendant', data.email); // Default role for subsequent users
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
    if (isLoading) return; // Don't redirect while loading

    if (!user && !isAuthPage) {
        router.push('/login');
    }
    if (user && isAuthPage) {
        router.push('/');
    }
  }, [user, isLoading, isAuthPage, router, authLoading, rolesLoading]);


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
    hasPermission,
    updateUserRole,
    resetPassword,
  };

  return (
      <AuthContext.Provider value={value}>
        {children(user, isAuthPage, isLoading)}
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
