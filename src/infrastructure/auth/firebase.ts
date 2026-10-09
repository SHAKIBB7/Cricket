import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

/**
 * Client-safe Firebase Web Configuration read from environment variables.
 * Private server credentials or service-account keys are strictly NEVER exposed here.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'dummy-api-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'dummy-project.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'dummy-project',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'dummy-project.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:1234567890:web:dummyappid',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/**
 * Checks if real Firebase environment credentials have been supplied.
 */
export const isFirebaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY !== 'your-api-key' &&
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY !== '[SENSITIVE]' &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== 'your-project-id'
);

if (!isFirebaseConfigured && typeof window !== 'undefined') {
  console.warn(
    'Firebase environment variables are not configured or are placeholders. ' +
    'Provide valid NEXT_PUBLIC_FIREBASE_* variables in .env.local to enable live cloud authentication and profile sync.'
  );
}

/**
 * Centralized, singleton Firebase App instance preventing duplicate initialization.
 */
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/**
 * Centralized Firebase Auth instance with standard browserLocalPersistence.
 */
export const auth: Auth = getAuth(app);

/**
 * Centralized Cloud Firestore instance for user profile documents.
 */
export const firestore: Firestore = getFirestore(app);

/**
 * Pre-configured Google Auth Provider for Firebase Authentication.
 * NOTE: Least-privilege principle is enforced.
 * Google Drive scopes (e.g. drive.file) are NOT requested during ordinary sign-in.
 */
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({
  prompt: 'select_account',
});

/**
 * Optional Firebase Analytics instance (browser-only, when supported).
 */
export let analytics: any = null;
if (typeof window !== 'undefined') {
  import('firebase/analytics')
    .then(({ getAnalytics, isSupported }) => {
      isSupported().then((supported) => {
        if (supported) {
          analytics = getAnalytics(app);
        }
      }).catch(() => {});
    })
    .catch(() => {});
}
