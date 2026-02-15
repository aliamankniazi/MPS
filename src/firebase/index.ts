'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

// IMPORTANT: DO NOT MODIFY THIS FUNCTION
export function initializeFirebase() {
  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  const firestore = getFirestore(app);

  // Enable offline persistence.
  // It's safe to call this after getFirestore, as long as it's before any other
  // Firestore operations (like getDoc, onSnapshot, etc.). The app's structure
  // ensures this runs once at startup before any data is fetched.
  enableIndexedDbPersistence(firestore)
    .catch((err) => {
      if (err.code == 'failed-precondition') {
        // This is a normal occurrence when multiple tabs are open.
        // Persistence will be active in one of the other tabs.
        console.warn('Firestore persistence not enabled in this tab, likely due to multiple tabs being open.');
      } else if (err.code == 'unimplemented') {
        // The browser does not support IndexedDB.
        console.warn('Firestore persistence is not available in this browser.');
      }
    });

  return getSdks(app);
}

export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp) // Re-calling getFirestore() is safe, it returns the same instance for the app.
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
