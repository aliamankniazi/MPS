
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
import { auth, firestore } from '@/lib/firebase';
import { PERMISSIONS, type AuthFormValues, type RoleId, type Role, type Permission } from '@/lib/types';
import { usePathname, useRouter } from 'next/navigation';
import { AppLayout } from '@/components/app-layout';
import { useDatabase } from './use-database';
import { collection, onSnapshot, doc, setDoc, getDoc, updateDoc, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';


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
  addRole: (role: Omit<Role, 'id'>) => Promise<void>;
  updateRole: (id: RoleId, updatedRole: Omit<Role, 'id'>) => Promise<void>;
  deleteRole: (id: RoleId) => Promise<void>;
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

  // Effect for fetching roles from Firestore
  useEffect(() => {
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
  }, [user]);

  const hasPermission = useCallback((permission: Permission): boolean => {
      if (!userRole) return false;
      if (userRole === 'admin') return true; // Admin has all permissions
      const role = roles.find(r => r.id === userRole);
      if (!role) return false;
      return role.permissions.includes(permission);
  }, [userRole, roles]);

  const addRole = async (role: Omit<Role, 'id'>) => {
      if (!firestore) return;
      const newRoleRef = doc(collection(firestore, ROLES_COLLECTION));
      await setDoc(newRoleRef, role);
  };

  const updateRole = async (id: RoleId, updatedRole: Omit<Role, 'id'>) => {
      if (!firestore) return;
      const roleRef = doc(firestore, ROLES_COLLECTION, id);
      await updateDoc(roleRef, updatedRole);
  };

  const deleteRole = async (id: RoleId) => {
      if (!firestore || id === 'admin') return;
      const roleRef = doc(firestore, ROLES_COLLECTION, id);
      await deleteDoc(roleRef);
  };

  const assignRoleToUser = async (userId: string, roleId: RoleId) => {
    if (!firestore) return;
    const userRoleRef = doc(firestore, USER_ROLES_COLLECTION, userId);
    await setDoc(userRoleRef, { roleId });
  };

  const signIn = (data: AuthFormValues) => {
    if (!auth) return Promise.reject(new Error("Firebase is not configured."));
    return signInWithEmailAndPassword(auth, data.email, data.password);
  };

  const signUp = async (data: AuthFormValues) => {
    if (!auth || !firestore) throw new Error("Firebase is not configured.");

    const userRolesCollectionRef = collection(firestore, USER_ROLES_COLLECTION);
    const snapshot = await getDocs(userRolesCollectionRef);
    const hasUsers = !snapshot.empty;
    
    const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
    
    // First user to sign up becomes an admin
    if (!hasUsers) {
      await assignRoleToUser(userCredential.user.uid, 'admin');
    } else {
      await assignRoleToUser(userCredential.user.uid, 'attendant'); // Default role for subsequent users
    }
    
    return userCredential;
  };

  const signOut = async () => {
    if (auth) {
      await firebaseSignOut(auth);
    }
  };
  
  const isLoading = authLoading || rolesLoading || (user && !isAuthPage && !isDatabaseLoaded);

  useEffect(() => {
    if (authLoading || rolesLoading) return; // Wait until auth state is resolved

    if (!user && !isAuthPage) {
        router.push('/login');
    }
    if (user && isAuthPage) {
        router.push('/');
    }
  }, [user, authLoading, rolesLoading, isAuthPage, router]);


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
        {user && !isAuthPage ? <AppLayout>{children}</AppLayout> : children}
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
