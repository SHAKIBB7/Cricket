import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

/**
 * Known template placeholders that indicate unconfigured environment variables.
 */
const PLACEHOLDER_PREFIXES = ['your-', '[sensitive]', 'dummy-', 'g-xxxx'];

export function isPlaceholderOrEmpty(val: string | undefined): boolean {
  if (!val || typeof val !== 'string') return true;
  const trimmed = val.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') return true;
  return (
    PLACEHOLDER_PREFIXES.some((prefix) => trimmed.startsWith(prefix)) ||
    trimmed === 'your-api-key' ||
    trimmed === 'your-firebase-api-key' ||
    trimmed === 'your-project-id' ||
    trimmed.includes('xxxxxxxx')
  );
}

/**
 * Client-safe Firebase Web Configuration read from environment variables.
 * Private server credentials or service-account keys are strictly NEVER exposed here.
 */
const rawProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const hasValidProject = rawProjectId && !isPlaceholderOrEmpty(rawProjectId);

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'dummy-api-key',
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    (hasValidProject ? `${rawProjectId}.firebaseapp.com` : 'dummy-project.firebaseapp.com'),
  projectId: rawProjectId || 'dummy-project',
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    (hasValidProject ? `${rawProjectId}.firebasestorage.app` : 'dummy-project.appspot.com'),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:1234567890:web:dummyappid',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/**
 * Validates which Firebase variables are present vs missing/placeholder.
 * Strictly NEVER reveals or logs secret values.
 */
export function getFirebaseConfigDiagnostics(): {
  isConfigured: boolean;
  missingVariables: string[];
  diagnosticMessage: string;
} {
  const missing: string[] = [];

  if (isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_FIREBASE_API_KEY)) {
    missing.push('NEXT_PUBLIC_FIREBASE_API_KEY');
  }
  if (isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)) {
    missing.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  }
  if (
    isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) &&
    isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
  ) {
    missing.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
  }
  if (isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_FIREBASE_APP_ID)) {
    missing.push('NEXT_PUBLIC_FIREBASE_APP_ID');
  }

  const isConfigured = missing.length === 0;
  const diagnosticMessage = isConfigured
    ? 'Firebase is configured correctly.'
    : `Firebase is not configured. Please set NEXT_PUBLIC_FIREBASE_* in your environment. Missing or placeholder variables: ${missing.join(', ')}.`;

  return {
    isConfigured,
    missingVariables: missing,
    diagnosticMessage,
  };
}

/**
 * Checks if real Firebase environment credentials have been supplied.
 */
export const isFirebaseConfigured = Boolean(
  !isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_FIREBASE_API_KEY) &&
  !isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
);

if (!isFirebaseConfigured && typeof window !== 'undefined') {
  console.warn(
    `[Firebase] ${getFirebaseConfigDiagnostics().diagnosticMessage} ` +
    'Provide valid NEXT_PUBLIC_FIREBASE_* variables in your hosting provider (e.g. Vercel Project Settings) or .env.local to enable live cloud authentication and profile sync.'
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
