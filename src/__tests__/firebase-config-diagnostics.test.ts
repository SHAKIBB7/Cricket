import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isPlaceholderOrEmpty,
  getFirebaseConfigDiagnostics,
  checkFirebaseConfigured,
  getFirebaseConfig,
} from '../infrastructure/auth/firebase';
import { FirebaseAuthService } from '../infrastructure/auth/FirebaseAuthService';
import { UserProfileService } from '../infrastructure/auth/UserProfileService';
import { FeatureHubRepository } from '../infrastructure/storage/FeatureHubRepository';
import { GoogleDriveService } from '../infrastructure/storage/GoogleDriveService';
import { db } from '../infrastructure/database/dexie-db';

describe('Firebase & Google Drive Configuration Diagnostics Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.user_profile.clear();
    await db.app_metadata.clear();
    await db.matches.clear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('1. Placeholder & Empty Value Detection', () => {
    it('detects empty, undefined, and null values as unconfigured', () => {
      expect(isPlaceholderOrEmpty(undefined)).toBe(true);
      expect(isPlaceholderOrEmpty('')).toBe(true);
      expect(isPlaceholderOrEmpty('   ')).toBe(true);
      expect(isPlaceholderOrEmpty('undefined')).toBe(true);
      expect(isPlaceholderOrEmpty('null')).toBe(true);
    });

    it('detects standard template placeholders from .env.example', () => {
      expect(isPlaceholderOrEmpty('your-firebase-api-key')).toBe(true);
      expect(isPlaceholderOrEmpty('your-api-key')).toBe(true);
      expect(isPlaceholderOrEmpty('your-project-id')).toBe(true);
      expect(isPlaceholderOrEmpty('your-messaging-sender-id')).toBe(true);
      expect(isPlaceholderOrEmpty('your-anon-public-api-key')).toBe(true);
      expect(isPlaceholderOrEmpty('[SENSITIVE]')).toBe(true);
      expect(isPlaceholderOrEmpty('dummy-api-key')).toBe(true);
      expect(isPlaceholderOrEmpty('dummy-project')).toBe(true);
      expect(isPlaceholderOrEmpty('1:1234567890:web:dummyappid')).toBe(true);
      expect(isPlaceholderOrEmpty('1:123456789012:web:abcdef1234567890abcdef')).toBe(true);
      expect(isPlaceholderOrEmpty('G-XXXXXXXXXX')).toBe(true);
      expect(isPlaceholderOrEmpty('687129620648-xxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com')).toBe(true);
      expect(isPlaceholderOrEmpty('changeme')).toBe(true);
      expect(isPlaceholderOrEmpty('placeholder_key')).toBe(true);
    });

    it('accepts legitimate production credentials as valid', () => {
      expect(isPlaceholderOrEmpty('AIzaSyBrSMNsVh9hfYM-ZnH-bNbngiOG1avdUEw')).toBe(false);
      expect(isPlaceholderOrEmpty('cricket-proo')).toBe(false);
      expect(isPlaceholderOrEmpty('cricket-proo.firebaseapp.com')).toBe(false);
      expect(isPlaceholderOrEmpty('1:687129620648:web:327181d332b421b629529d')).toBe(false);
      expect(isPlaceholderOrEmpty('687129620648')).toBe(false);
      expect(isPlaceholderOrEmpty('G-FXGXSHDB7K')).toBe(false);
    });
  });

  describe('2. Safe Diagnostic Reporting without Exposing Secrets', () => {
    it('accurately lists missing variable names when environment is unconfigured', () => {
      delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
      delete process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

      const diagnostics = getFirebaseConfigDiagnostics();
      expect(diagnostics.isConfigured).toBe(false);
      expect(diagnostics.missingVariables).toContain('NEXT_PUBLIC_FIREBASE_API_KEY');
      expect(diagnostics.missingVariables).toContain('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
      expect(diagnostics.missingVariables).toContain('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
      expect(diagnostics.missingVariables).toContain('NEXT_PUBLIC_FIREBASE_APP_ID');

      // Check diagnostic message format
      expect(diagnostics.diagnosticMessage).toContain('Firebase is not configured');
      expect(diagnostics.diagnosticMessage).toContain('NEXT_PUBLIC_FIREBASE_*');
      expect(diagnostics.diagnosticMessage).toContain('Missing or placeholder variables:');

      // Ensure no raw secret or token values are leaked
      expect(diagnostics.diagnosticMessage).not.toContain('AIzaSy');
      expect(checkFirebaseConfigured()).toBe(false);
    });

    it('reports configured status when valid variables are present', () => {
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'AIzaSyBrSMNsVh9hfYM-ZnH-bNbngiOG1avdUEw';
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'cricket-proo';
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'cricket-proo.firebaseapp.com';
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '1:687129620648:web:327181d332b421b629529d';

      const diagnostics = getFirebaseConfigDiagnostics();
      expect(diagnostics.isConfigured).toBe(true);
      expect(diagnostics.missingVariables.length).toBe(0);
      expect(diagnostics.diagnosticMessage).toContain('Firebase is configured correctly');
      expect(checkFirebaseConfigured()).toBe(true);
    });

    it('getFirebaseConfig correctly falls back without throwing when unconfigured', () => {
      delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

      const config = getFirebaseConfig();
      expect(config.apiKey).toBe('dummy-api-key');
      expect(config.projectId).toBe('dummy-project');
      expect(config.authDomain).toContain('firebaseapp.com');
    });
  });

  describe('3. Independent Authentication Failure Isolation', () => {
    beforeEach(() => {
      // Simulate unconfigured production environment
      delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
      delete process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
    });

    it('signInWithGoogle gracefully returns diagnostic error without attempting popup', async () => {
      const result = await FirebaseAuthService.signInWithGoogle();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Firebase is not configured');
      expect(result.error).toContain('NEXT_PUBLIC_FIREBASE_*');
    });

    it('signInWithEmail gracefully returns diagnostic error without attempting network call', async () => {
      const result = await FirebaseAuthService.signInWithEmail('test@example.com', 'password123');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Firebase is not configured');
    });

    it('signUpWithEmail gracefully returns diagnostic error without attempting network call', async () => {
      const result = await FirebaseAuthService.signUpWithEmail('test@example.com', 'password123', 'Scorer');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Firebase is not configured');
    });

    it('sendPasswordReset gracefully returns diagnostic error without attempting network call', async () => {
      const result = await FirebaseAuthService.sendPasswordReset('test@example.com');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Firebase is not configured');
    });

    it('onAuthStateChanged returns a safe no-op unsubscribe function and immediately notifies null user', () => {
      const observer = vi.fn();
      const unsubscribe = FirebaseAuthService.onAuthStateChanged(observer);

      expect(typeof unsubscribe).toBe('function');
      expect(observer).toHaveBeenCalledWith(null);
      expect(() => unsubscribe()).not.toThrow();
    });

    it('getCurrentUser returns null when unconfigured', () => {
      expect(FirebaseAuthService.getCurrentUser()).toBeNull();
    });

    it('signOutUser clears local profile session without errors', async () => {
      await FeatureHubRepository.saveProfile({
        uid: 'guest_user_1',
        name: 'Guest Scorer',
        email: 'guest@cricket.org',
        isLoggedIn: true,
        lastSyncedAt: new Date().toISOString(),
      });

      const res = await FirebaseAuthService.signOutUser();
      expect(res.success).toBe(true);

      const local = await FeatureHubRepository.loadProfile();
      expect(local).toBeUndefined();
    });
  });

  describe('4. Firestore Fallback to IndexedDB (Dexie) when Unconfigured', () => {
    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    });

    it('syncOrCreateUserProfile stores profile locally in Dexie when Firebase is unconfigured', async () => {
      const profile = await UserProfileService.syncOrCreateUserProfile({
        uid: 'offline_user_999',
        displayName: 'Offline Legend',
        email: 'legend@offline.org',
      });

      expect(profile.uid).toBe('offline_user_999');
      expect(profile.displayName).toBe('Offline Legend');

      const saved = await FeatureHubRepository.loadProfile();
      expect(saved?.uid).toBe('offline_user_999');
      expect(saved?.name).toBe('Offline Legend');
    });

    it('updateDisplayName updates local Dexie profile without attempting Firestore call', async () => {
      await UserProfileService.syncOrCreateUserProfile({
        uid: 'offline_user_888',
        displayName: 'Original Name',
        email: 'orig@offline.org',
      });

      const updated = await UserProfileService.updateDisplayName('offline_user_888', 'Renamed Hero');
      expect(updated.displayName).toBe('Renamed Hero');

      const saved = await FeatureHubRepository.loadProfile();
      expect(saved?.name).toBe('Renamed Hero');
    });

    it('recordDriveBackup records backup timestamp in Dexie app_metadata for guest users', async () => {
      const timestamp = new Date().toISOString();
      await UserProfileService.recordDriveBackup('guest', timestamp);

      const meta = await db.app_metadata.get('last_drive_backup_at_guest');
      expect(meta?.value).toBe(timestamp);
    });
  });

  describe('5. Independent Google Drive Service Operation', () => {
    it('detects unconfigured Google OAuth Client ID', () => {
      delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      expect(GoogleDriveService.isDriveConfigured()).toBe(false);

      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = '687129620648-xxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com';
      expect(GoogleDriveService.isDriveConfigured()).toBe(false);

      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = '[SENSITIVE]';
      expect(GoogleDriveService.isDriveConfigured()).toBe(false);
    });

    it('validates authentic production Google OAuth Client ID', () => {
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = '687129620648-p9fg9svcpddnsu378qdlan1d75j89osd.apps.googleusercontent.com';
      expect(GoogleDriveService.isDriveConfigured()).toBe(true);
    });

    it('creates full backup payload from IndexedDB independently of Firebase state', async () => {
      // Clear Firebase environment completely
      delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

      const payload = await GoogleDriveService.createBackupPayload('guest');
      expect(payload.app).toBe('Cric Scorer Pro');
      expect(payload.schemaVersion).toBe(2);
      expect(payload.userUid).toBe('guest');
      expect(Array.isArray(payload.matches)).toBe(true);
      expect(Array.isArray(payload.teams)).toBe(true);
    });

    it('throws clear diagnostic error if requesting token with unconfigured Client ID', async () => {
      delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      (global as any).window = { google: {} };
      (GoogleDriveService as any).loadGisScript = vi.fn().mockResolvedValue(undefined);

      await expect(GoogleDriveService.requestAccessToken()).rejects.toThrow(
        'Google OAuth Client ID is not configured. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your environment variables'
      );
    });
  });
});
