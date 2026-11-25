'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, enableIndexedDbPersistence, connectFirestoreEmulator } from 'firebase/firestore';

/**
 * Core Firebase initialization logic separated to prevent circular dependencies.
 */

let persistencePromise: Promise<void> | null = null;

/**
 * TESTING ONLY. With NEXT_PUBLIC_FIREBASE_EMULATOR=1 the app talks to the Firebase emulators on this
 * machine (auth :9099, Firestore :8080) under a "demo-" project id, which the Firebase SDK can never
 * route to a real project. Nothing sets this variable in the hosted build, so the live books are
 * untouched by any test run. See README, "Testing the balances".
 */
const USE_EMULATOR = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === '1';
let emulatorsConnected = false;

export function initializeFirebase() {
  const config = USE_EMULATOR ? { ...firebaseConfig, projectId: 'demo-mps' } : firebaseConfig;
  const app = !getApps().length ? initializeApp(config) : getApp();
  const firestore = getFirestore(app);

  if (USE_EMULATOR && !emulatorsConnected) {
    emulatorsConnected = true;
    connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  }

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
