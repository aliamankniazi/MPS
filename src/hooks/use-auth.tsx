
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
import { auth, db, isFirebaseConfigValid, firebaseConfig } from '@/lib/firebase';
import type { AuthFormValues, RoleId } from '@/lib/types';
import { usePathname, useRouter } from 'next/navigation';
import { ref, onValue, set } from 'firebase/database';


interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (data: AuthFormValues) => Promise<any>;
  signUp: (data: AuthFormValues) => Promise<any>;
  signOut: () => Promise<void>;
  userRole: RoleId | null;
  assignRoleToUser: (userId: string, roleId: RoleId) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const FAKE_USER = { uid: 'offline-user', email: 'demo@example.com' } as User;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<RoleId | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const isConfigValid = isFirebaseConfigValid(firebaseConfig);
  const isAuthPage = pathname === '/login' || pathname === '/signup';

  // Effect to load user role from RTDB
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

  const assignRoleToUser = useCallback((userId: string, roleId: RoleId) => {
    if (!db) return;
    try {
      const userRoleRef = ref(db, `userRoles/${userId}`);
      set(userRoleRef, roleId);
      if (user && user.uid === userId) {
        setUserRole(roleId);
      }
    } catch (error) {
      console.error("Failed to save user role to RTDB", error);
    }
  }, [user]);

  useEffect(() => {
    if (!isConfigValid) {
      // If Firebase isn't configured, use a mock user for offline demo purposes.
      setUser(FAKE_USER);
      setLoading(false);
      return;
    }
    
    if (!auth) {
        // Handle case where auth is not initialized
        setLoading(false);
        return;
    }

    // This listener handles the auth state changes from Firebase.
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser && db) {
        // Check if any roles exist. If not, this is the first user.
        const rolesRef = ref(db, 'userRoles');
        onValue(rolesRef, (snapshot) => {
            if (!snapshot.exists()) {
                assignRoleToUser(currentUser.uid, 'admin');
            }
        }, { onlyOnce: true });
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [isConfigValid, assignRoleToUser]);
  
  // This effect handles route protection.
  useEffect(() => {
    if (loading) return; // Wait until auth state is determined

    // If there is no user and the current page is not a public auth page, redirect to login.
    if (!user && !isAuthPage) {
        router.push('/login');
    }
    // If there is a user and they are on an auth page, redirect to the dashboard.
    if (user && isAuthPage) {
        router.push('/');
    }
  }, [user, loading, pathname, router, isAuthPage]);

  const signIn = (data: AuthFormValues) => {
    if (!isConfigValid || !auth) return Promise.reject(new Error("Firebase is not configured."));
    return signInWithEmailAndPassword(auth, data.email, data.password);
  };

  const signUp = (data: AuthFormValues) => {
    if (!isConfigValid || !auth) return Promise.reject(new Error("Firebase is not configured."));
    return createUserWithEmailAndPassword(auth, data.email, data.password);
  };

  const signOut = async () => {
    if (isConfigValid && auth) {
      await firebaseSignOut(auth);
    }
    setUser(null); // Explicitly set user to null on sign out
    router.push('/login'); // Redirect to login page after sign out
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    userRole,
    assignRoleToUser,
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
