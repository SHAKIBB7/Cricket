import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

/**
 * Performance fix programme 2026-11-15 (Fix 1): the env-only
 * configuration helpers (isPlaceholderOrEmpty, getFirebaseConfig,
 * getFirebaseConfigDiagnostics, checkFirebaseConfigured,
 * isFirebaseConfigured) now live in the SDK-free
 * ./firebase-config module. They are re-exported here so every
 * existing import from this module keeps working unchanged.
 */
import {
  isPlaceholderOrEmpty,
  getFirebaseConfig,
  getFirebaseConfigDiagnostics,
  checkFirebaseConfigured,
  isFirebaseConfigured,
} from './firebase-config';

export {
  isPlaceholderOrEmpty,
  getFirebaseConfig,
  getFirebaseConfigDiagnostics,
  checkFirebaseConfigured,
  isFirebaseConfigured,
};

if (!isFirebaseConfigured && typeof window !== 'undefined') {
  // P3-C2: deliberately LOUD (console.error, once at module init).
  // When unconfigured, the instances below are still constructed
  // against a dummy project so the app's offline-first local mode
  // can boot and every module's import shape stays stable — but
  // no call site may use them without gating on
  // checkFirebaseConfigured() first (all current call sites do).
  // Anything that slips through will fire requests at a
  // nonexistent project; this error is the signpost for why.
  console.error(
    `[Firebase] NOT CONFIGURED — cloud auth/sync is DISABLED and Firebase instances point at a dummy project. ` +
    `${getFirebaseConfigDiagnostics().diagnosticMessage} ` +
    'Provide valid NEXT_PUBLIC_FIREBASE_* variables in your hosting provider (e.g. Vercel Project Settings) or .env.local to enable live cloud authentication and profile sync.'
  );
}

/**
 * Centralized, singleton Firebase App instance preventing duplicate initialization.
 * NOTE (P3-C2): when Firebase is unconfigured this app — and the
 * auth/firestore instances below — are built from dummy values.
 * They exist only so imports resolve in local/offline mode; gate
 * every use behind checkFirebaseConfigured().
 */
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(getFirebaseConfig());

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
 * Optional Firebase Analytics instance (browser-only, when supported and configured).
 */
export let analytics: any = null;
if (typeof window !== 'undefined' && checkFirebaseConfigured()) {
  import('firebase/analytics')
    .then(({ getAnalytics, isSupported }) => {
      isSupported().then((supported) => {
        if (supported && checkFirebaseConfigured()) {
          analytics = getAnalytics(app);
        }
      }).catch(() => {});
    })
    .catch(() => {});
}
