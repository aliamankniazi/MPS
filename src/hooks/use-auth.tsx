
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
import type { AuthFormValues, RoleId } from '@/lib/types';
import { usePathname, useRouter } from 'next/navigation';
import { ref, onValue, set, get } from 'firebase/database';


interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (data: AuthFormValues) => Promise<any>;
  signUp: (data: AuthFormValues) => Promise<any>;
  signOut: () => Promise<void>;
  userRole: RoleId | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<RoleId | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const isAuthPage = pathname === '/login' || pathname === '/signup';

  useEffect(() => {
    if (user && db) {
      const userRoleRef = ref(db, `userRoles/${user.uid}`);
      const unsubscribe = onValue(userRoleRef, (snapshot) => {
        const role = snapshot.val();
        setUserRole(role || 'admin'); // Default to admin if no role is set
      });
      return () => unsubscribe();
    } else {
      setUserRole(null);
    }
  }, [user]);

  useEffect(() => {
    if (!auth) {
        setLoading(false);
        return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);
  
  useEffect(() => {
    if (loading) return;
    if (!user && !isAuthPage) {
        router.push('/login');
    }
    if (user && isAuthPage) {
        router.push('/');
    }
  }, [user, loading, pathname, router, isAuthPage]);

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
    setUser(null);
    router.push('/login');
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    userRole,
  };
  
  if (loading) {
     return (
        <div className="flex h-screen w-full items-center justify-center">
            <p>Loading...</p>
        </div>
    );
  }
  
  return (
      <AuthContext.Provider value={value}>
        {children}
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
