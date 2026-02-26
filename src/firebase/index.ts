'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

// Track persistence initialization to prevent multiple attempts on the same Firestore instance.
let persistencePromise: Promise<void> | null = null;

/**
 * Initializes the Firebase app and its core services.
 * Ensures that persistence is enabled only once.
 */
export function initializeFirebase() {
  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  const firestore = getFirestore(app);

  // Enable offline persistence only once on the client side.
  if (typeof window !== 'undefined' && !persistencePromise) {
    persistencePromise = enableIndexedDbPersistence(firestore)
      .catch((err) => {
        if (err.code === 'failed-precondition') {
          // This happens when multiple tabs are open.
          console.warn('Firestore persistence not enabled in this tab, likely due to multiple tabs being open.');
        } else if (err.code === 'unimplemented') {
          // The browser does not support IndexedDB.
          console.warn('Firestore persistence is not available in this browser.');
        } else if (err.code === 'already-exists') {
          // Persistence already enabled, we can ignore this.
          console.log('Firestore persistence already enabled.');
        } else {
          // For other errors, we log them. 
          console.error('Firestore persistence error:', err);
        }
      });
  }

  return getSdks(app);
}

/**
 * Returns the Firebase services for a given app.
 */
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
