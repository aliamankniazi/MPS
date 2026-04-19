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
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { PERMISSIONS, type AuthFormValues, type RoleId, type Role, type Permission } from '@/lib/types';
import { collection, onSnapshot, doc, setDoc, updateDoc, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
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
  isPinVerified: () => boolean;
  confirmPin: (pin: string) => boolean;
  pinVerifiedAt: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, isUserLoading: authLoading, auth, firestore } = useFirebase();
  const [userRole, setUserRole] = useState<RoleId | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [pinVerifiedAt, setPinVerifiedAt] = useState<number>(0);

  useEffect(() => {
    if (auth) {
        setPersistence(auth, browserLocalPersistence).catch(console.error);
    }
  }, [auth]);

  useEffect(() => {
    const saved = sessionStorage.getItem('pumppal_pin_verified_at');
    if (saved) setPinVerifiedAt(parseInt(saved, 10));
  }, []);

  const isPinVerified = useCallback(() => {
    if (pinVerifiedAt === 0) return false;
    return (Date.now() - pinVerifiedAt) < 180000; // 3 minutes
  }, [pinVerifiedAt]);

  const confirmPin = useCallback((pin: string) => {
    if (pin === '0200') {
      const now = Date.now();
      setPinVerifiedAt(now);
      sessionStorage.setItem('pumppal_pin_verified_at', now.toString());
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (authLoading) return;
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
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            operation: 'list',
            path: ROLES_COLLECTION,
        }));
        setRolesLoading(false);
    });
    return () => unsubscribe();
  }, [user, authLoading, firestore]);

  useEffect(() => {
    if (user && firestore) {
      const userRoleDocRef = doc(firestore, USER_ROLES_COLLECTION, user.uid);
      const unsubscribe = onSnapshot(userRoleDocRef, (docSnap) => {
        setUserRole(docSnap.exists() ? (docSnap.data().roleId as RoleId) : null);
      }, (error) => {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
              operation: 'get',
              path: userRoleDocRef.path,
          }));
      });
      return () => unsubscribe();
    } else {
      setUserRole(null);
    }
  }, [user, firestore]);

  const hasPermission = useCallback((permission: Permission): boolean => {
      if (!userRole) return false;
      if (userRole === 'admin') return true;
      const role = roles.find(r => r.id === userRole);
      if (!role) return false;
      return role.permissions.includes(permission);
  }, [userRole, roles]);

  const addRole = useCallback((role: Omit<Role, 'id'>) => {
    if (!firestore) return;
    const newRoleRef = doc(collection(firestore, ROLES_COLLECTION));
    setDoc(newRoleRef, role).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: newRoleRef.path,
            operation: 'create',
            requestResourceData: role,
        }));
    });
  }, [firestore]);

  const updateRole = useCallback((id: RoleId, updatedRole: Omit<Role, 'id'>) => {
    if (!firestore) return;
    const roleRef = doc(firestore, ROLES_COLLECTION, id);
    updateDoc(roleRef, updatedRole).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: roleRef.path,
            operation: 'update',
            requestResourceData: updatedRole,
        }));
    });
  }, [firestore]);

  const deleteRole = useCallback((id: RoleId) => {
    if (!firestore || id === 'admin') return;
    const roleRef = doc(firestore, ROLES_COLLECTION, id);
    deleteDoc(roleRef).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: roleRef.path,
            operation: 'delete',
        }));
    });
  }, [firestore]);

  const assignRoleToUser = useCallback((userId: string, roleId: RoleId, email: string) => {
    if (!firestore) return;
    const userRoleRef = doc(firestore, USER_ROLES_COLLECTION, userId);
    setDoc(userRoleRef, { roleId, email }).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: userRoleRef.path,
            operation: 'create',
            requestResourceData: { roleId, email },
        }));
    });
  }, [firestore]);

  const updateUserRole = useCallback((userId: string, roleId: RoleId) => {
    if (!firestore) return;
    const userRoleRef = doc(firestore, USER_ROLES_COLLECTION, userId);
    updateDoc(userRoleRef, { roleId }).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: userRoleRef.path,
            operation: 'update',
            requestResourceData: { roleId },
        }));
    });
  }, [firestore]);

  const resetPassword = useCallback((email: string) => {
    if (!auth) return Promise.reject(new Error("Firebase Auth is not configured."));
    return sendPasswordResetEmail(auth, email);
  }, [auth]);

  const signIn = useCallback((data: AuthFormValues) => {
    if (!auth) return Promise.reject(new Error("Firebase is not configured."));
    return signInWithEmailAndPassword(auth, data.email, data.password);
  }, [auth]);

  const signUp = useCallback(async (data: AuthFormValues) => {
    if (!auth || !firestore) throw new Error("Firebase is not configured.");
    const userRolesCollectionRef = collection(firestore, USER_ROLES_COLLECTION);
    const snapshot = await getDocs(userRolesCollectionRef);
    const hasUsers = !snapshot.empty;
    const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
    assignRoleToUser(userCredential.user.uid, hasUsers ? 'attendant' : 'admin', data.email);
    return userCredential;
  }, [auth, firestore, assignRoleToUser]);

  const signOut = useCallback(async () => {
    if (auth) {
      await firebaseSignOut(auth);
      setPinVerifiedAt(0);
      sessionStorage.removeItem('pumppal_pin_verified_at');
      localStorage.removeItem('pumppal_2fa_verified');
    }
  }, [auth]);
  
  const value = {
    user,
    loading: authLoading || rolesLoading,
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
    isPinVerified,
    confirmPin,
    pinVerifiedAt,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
