import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isPlaceholderOrEmpty, getFirebaseConfigDiagnostics } from '../infrastructure/auth/firebase';
import { FirebaseAuthService } from '../infrastructure/auth/FirebaseAuthService';
import { GoogleDriveService } from '../infrastructure/storage/GoogleDriveService';

describe('Firebase & Google Drive Configuration Diagnostics Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
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
      expect(isPlaceholderOrEmpty('[SENSITIVE]')).toBe(true);
      expect(isPlaceholderOrEmpty('dummy-api-key')).toBe(true);
      expect(isPlaceholderOrEmpty('dummy-project')).toBe(true);
      expect(isPlaceholderOrEmpty('G-XXXXXXXXXX')).toBe(true);
      expect(isPlaceholderOrEmpty('687129620648-xxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com')).toBe(true);
    });

    it('accepts legitimate production credentials as valid', () => {
      expect(isPlaceholderOrEmpty('AIzaSyBrSMNsVh9hfYM-ZnH-bNbngiOG1avdUEw')).toBe(false);
      expect(isPlaceholderOrEmpty('cricket-proo')).toBe(false);
      expect(isPlaceholderOrEmpty('cricket-proo.firebaseapp.com')).toBe(false);
      expect(isPlaceholderOrEmpty('1:687129620648:web:327181d332b421b629529d')).toBe(false);
    });
  });

  describe('2. Safe Diagnostic Reporting without Exposing Secrets', () => {
    it('accurately lists missing variable names when environment is unconfigured', () => {
      // Temporarily clear Firebase env vars
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
    });
  });

  describe('3. Google Drive Client ID Diagnostics', () => {
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

    it('throws clear diagnostic error if requesting token with unconfigured Client ID', async () => {
      delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      // In Node environment, requestAccessToken first checks window; we can mock window
      (global as any).window = { google: {} };
      (GoogleDriveService as any).loadGisScript = vi.fn().mockResolvedValue(undefined);

      await expect(GoogleDriveService.requestAccessToken()).rejects.toThrow(
        'Google OAuth Client ID is not configured. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your environment variables'
      );
    });
  });
});
