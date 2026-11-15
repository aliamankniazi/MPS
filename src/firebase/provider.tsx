'use client';

/**
 * Gives every screen the signed-in person and the data connection.
 *
 * The folder is still called `firebase` so the rest of the app did not have to
 * change, but nothing here talks to Firebase any more: sign-in goes to the
 * app's own server (src/data/auth.ts) and records to its own database
 * (src/data/firestore.ts).
 */
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getAuth, onAuthStateChanged, type Auth, type User } from '@/data/auth';
import { getFirestore, type Firestore } from '@/data/firestore';
import { toast } from '@/hooks/use-toast';

export interface FirebaseServicesAndUser {
  firestore: Firestore;
  auth: Auth;
  user: User | null;
  /** True until the first "who is signed in?" answer arrives. */
  isUserLoading: boolean;
  userError: Error | null;
}

const FirebaseContext = createContext<FirebaseServicesAndUser | undefined>(undefined);

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const [userState, setUserState] = useState<{ user: User | null; isUserLoading: boolean }>({ user: null, isUserLoading: true });

  useEffect(() => {
    const store = getFirestore().store;
    return onAuthStateChanged(getAuth(), (user) => {
      // The local copy of the records runs only while someone is signed in.
      if (user) void store.start(user.uid);
      else store.stop();
      setUserState({ user, isUserLoading: false });
    });
  }, []);

  useEffect(() => {
    // A change the server would not take is never dropped quietly: say so.
    return getFirestore().store.onProblem((problem) => toast({ variant: 'destructive', title: problem.title, description: problem.detail, duration: 15000 }));
  }, []);

  const value = useMemo<FirebaseServicesAndUser>(
    () => ({ firestore: getFirestore(), auth: getAuth(), user: userState.user, isUserLoading: userState.isUserLoading, userError: null }),
    [userState],
  );

  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
}

export const useFirebase = (): FirebaseServicesAndUser => {
  const context = useContext(FirebaseContext);
  if (context === undefined) throw new Error('useFirebase must be used within FirebaseClientProvider.');
  return context;
};
