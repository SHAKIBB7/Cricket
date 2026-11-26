/**
 * firebase-config.ts — LIGHT, SDK-FREE Firebase configuration checks.
 *
 * Performance fix programme 2026-11-15 (Fix 1): this module was
 * split out of firebase.ts so callers that only need to know
 * WHETHER Firebase is configured (AuthContext, supabase.ts) do
 * not pull the Firebase SDK (firebase/app + auth + firestore)
 * into their bundle chunk. Everything here reads process.env
 * only — no SDK imports, no side effects, safe on first render
 * (no localStorage/navigator/window reads).
 *
 * firebase.ts re-exports every symbol below, so existing
 * imports from './firebase' / '@/infrastructure/auth/firebase'
 * keep working unchanged.
 */

/**
 * Known template placeholder prefixes and patterns that indicate unconfigured environment variables.
 */
const PLACEHOLDER_PREFIXES = ['your-', '[sensitive]', 'dummy-', 'g-xxxx', 'example-'];

const KNOWN_PLACEHOLDER_SUBSTRINGS = [
  'your-api-key',
  'your-firebase-api-key',
  'your-project-id',
  'your-messaging-sender-id',
  'your-anon-public-api-key',
  'abcdef1234567890abcdef',
  '123456789012',
  'dummy',
  'placeholder',
  'changeme',
];

export function isPlaceholderOrEmpty(val: string | undefined): boolean {
  if (!val || typeof val !== 'string') return true;
  const trimmed = val.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') return true;
  if (PLACEHOLDER_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return true;
  if (trimmed.includes('xxxxxxxx')) return true;
  if (KNOWN_PLACEHOLDER_SUBSTRINGS.some((sub) => trimmed.includes(sub))) return true;
  return false;
}

/**
 * Generates client-safe Firebase Web Configuration read from environment variables.
 * Private server credentials or service-account keys are strictly NEVER exposed here.
 */
export function getFirebaseConfig() {
  const currentProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const hasValidProject = !isPlaceholderOrEmpty(currentProjectId);

  const currentApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const currentAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const currentStorageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const currentSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const currentAppId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  const currentMeasurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

  return {
    apiKey: !isPlaceholderOrEmpty(currentApiKey) ? currentApiKey! : 'dummy-api-key',
    authDomain: !isPlaceholderOrEmpty(currentAuthDomain)
      ? currentAuthDomain!
      : (hasValidProject ? `${currentProjectId}.firebaseapp.com` : 'dummy-project.firebaseapp.com'),
    projectId: hasValidProject ? currentProjectId! : 'dummy-project',
    storageBucket: !isPlaceholderOrEmpty(currentStorageBucket)
      ? currentStorageBucket!
      : (hasValidProject ? `${currentProjectId}.firebasestorage.app` : 'dummy-project.appspot.com'),
    messagingSenderId: !isPlaceholderOrEmpty(currentSenderId) ? currentSenderId! : '1234567890',
    appId: !isPlaceholderOrEmpty(currentAppId) ? currentAppId! : '1:1234567890:web:dummyappid',
    measurementId: !isPlaceholderOrEmpty(currentMeasurementId) ? currentMeasurementId : undefined,
  };
}

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

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (isPlaceholderOrEmpty(apiKey)) {
    missing.push('NEXT_PUBLIC_FIREBASE_API_KEY');
  }
  if (isPlaceholderOrEmpty(projectId)) {
    missing.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  }
  if (isPlaceholderOrEmpty(authDomain) && isPlaceholderOrEmpty(projectId)) {
    missing.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
  } else if (authDomain && isPlaceholderOrEmpty(authDomain)) {
    missing.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
  }
  if (isPlaceholderOrEmpty(appId)) {
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
 * Dynamically checks whether real Firebase environment credentials have been supplied.
 */
export function checkFirebaseConfigured(): boolean {
  return getFirebaseConfigDiagnostics().isConfigured;
}

/**
 * Checks if real Firebase environment credentials were supplied at module load.
 * For dynamic evaluation across runtime environments or tests, prefer checkFirebaseConfigured().
 */
export const isFirebaseConfigured: boolean = Boolean(
  !isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_FIREBASE_API_KEY) &&
  !isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) &&
  !isPlaceholderOrEmpty(process.env.NEXT_PUBLIC_FIREBASE_APP_ID)
);
