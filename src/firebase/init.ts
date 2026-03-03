'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore, enableIndexedDbPersistence } from 'firebase/firestore';

/**
 * Core Firebase initialization logic separated to prevent circular dependencies.
 */

let persistencePromise: Promise<void> | null = null;

export function initializeFirebase() {
  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  const firestore = getFirestore(app);

  // Enable offline persistence only once on the client side.
  if (typeof window !== 'undefined' && !persistencePromise) {
    persistencePromise = enableIndexedDbPersistence(firestore)
      .catch((err) => {
        if (err.code === 'failed-precondition') {
          console.warn('Firestore persistence not enabled in this tab.');
        } else if (err.code === 'unimplemented') {
          console.warn('Firestore persistence is not available in this browser.');
        }
      });
  }

  return {
    firebaseApp: app,
    auth: getAuth(app),
    firestore: firestore
  };
}
