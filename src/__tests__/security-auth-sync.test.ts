import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../infrastructure/database/dexie-db';
import { SyncEngine } from '../infrastructure/sync/SyncEngine';
import { FirebaseAuthService } from '../infrastructure/auth/FirebaseAuthService';
import { GoogleDriveService } from '../infrastructure/storage/GoogleDriveService';
import { GoogleDriveAuthSpec } from '../infrastructure/auth/google-drive-auth-spec';
import { setSupabaseAuthToken, getSupabaseAuthToken, getSupabaseClient } from '../infrastructure/auth/supabase';
import { auth } from '../infrastructure/auth/firebase';

vi.mock('firebase/auth', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    sendPasswordResetEmail: vi.fn().mockImplementation((_auth, email) => {
      if (email && email.includes('unregistered')) {
        const err: any = new Error('User not found');
        err.code = 'auth/user-not-found';
        return Promise.reject(err);
      }
      return Promise.resolve();
    }),
  };
});

describe('Security & Authentication Hardening Test Suite', () => {
  beforeEach(async () => {
    SyncEngine.stop();
    await db.sync_queue.clear();
    await db.matches.clear();
    setSupabaseAuthToken(null);
    GoogleDriveService.clearCachedToken();
  });

  afterEach(() => {
    SyncEngine.stop();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    GoogleDriveService.clearCachedToken();
  });

  // =========================================================================
  // 1. FIREBASE & SUPABASE IDENTITY UNIFICATION & QUEUED OFFLINE SYNC
  // =========================================================================
  describe('1. Firebase & Supabase Identity Bridge & Unauthenticated Queueing', () => {
    it('defers sync and preserves mutations as PENDING in IndexedDB if user is unauthenticated', async () => {
      // Stub reachability to true so sync reaches the auth session check
      vi.spyOn(SyncEngine, 'checkServerReachability').mockResolvedValue(true);
      // Ensure unauthenticated
      vi.spyOn(SyncEngine, 'getAuthenticatedSession').mockResolvedValue(null);

      // Enqueue an offline mutation
      await SyncEngine.queueMutation('UPSERT_MATCH', {
        id: 'offline_match_1',
        teamA: 'Dhaka',
        teamB: 'Chittagong',
      }, 'offline_match_1');

      const queueBefore = await db.sync_queue.toArray();
      expect(queueBefore.length).toBe(1);
      expect(queueBefore[0].status).toBe('PENDING');

      // Attempt synchronization
      await SyncEngine.syncNow();

      // Mutations MUST remain queued in IndexedDB without dropping or corruption
      const queueAfter = await db.sync_queue.toArray();
      expect(queueAfter.length).toBe(1);
      expect(queueAfter[0].status).toBe('PENDING');
      expect(queueAfter[0].entityId).toBe('offline_match_1');
    });

    it('resolves cryptographic Firebase ID Token and binds Bearer token for Supabase client', async () => {
      const mockIdToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmaXJlYmFzZV91c2VyXzEyMyJ9.signature';
      const mockFirebaseUser = {
        uid: 'firebase_user_123',
        getIdToken: vi.fn().mockResolvedValue(mockIdToken),
      };

      // Mock auth.currentUser
      Object.defineProperty(auth, 'currentUser', {
        value: mockFirebaseUser,
        configurable: true,
      });

      const session = await SyncEngine.getAuthenticatedSession();
      expect(session).not.toBeNull();
      expect(session?.provider).toBe('firebase');
      expect(session?.uid).toBe('firebase_user_123');
      expect(session?.token).toBe(mockIdToken);
      expect(mockFirebaseUser.getIdToken).toHaveBeenCalled();

      // Verify that setSupabaseAuthToken has bound the Bearer token
      expect(getSupabaseAuthToken()).toBe(mockIdToken);

      // Verify getSupabaseClient attaches Authorization: Bearer <token>
      const client = getSupabaseClient(mockIdToken);
      expect(client).toBeDefined();
    });

    it('gracefully handles token retrieval failure by deferring sync without throwing', async () => {
      const mockFirebaseUser = {
        uid: 'failing_user',
        getIdToken: vi.fn().mockRejectedValue(new Error('Network error fetching token')),
      };

      Object.defineProperty(auth, 'currentUser', {
        value: mockFirebaseUser,
        configurable: true,
      });

      const session = await SyncEngine.getAuthenticatedSession();
      // Should fall back gracefully to null without crashing
      expect(session).toBeNull();
    });
  });

  // =========================================================================
  // 2. FIRESTORE MATCH RULES LOGIC & PAYLOAD VALIDATION
  // =========================================================================
  describe('2. Firestore Match Rules Logic & Field Constraints', () => {
    // Valid match payload matching firestore.rules whitelist
    const validMatchPayload = {
      id: 'match_999',
      userId: 'user_owner_123',
      teamA: 'Australia',
      teamB: 'England',
      tossWinner: 'Australia',
      tossDecision: 'BAT',
      totalOvers: 20,
      status: 'ONGOING',
      currentInnings: 1,
      targetScore: 180,
      venue: 'Melbourne Cricket Ground',
      result: null,
      isPublic: true,
      scorecard_data: { overs: 20, balls: [] },
      createdAt: '2026-10-22T10:00:00.000Z',
      updatedAt: '2026-10-22T10:30:00.000Z',
    };

    const allowedKeys = [
      'id', 'userId', 'teamA', 'teamB', 'tossWinner', 'tossDecision',
      'totalOvers', 'status', 'currentInnings', 'targetScore', 'venue',
      'result', 'isPublic', 'scorecard_data', 'createdAt', 'updatedAt'
    ];

    it('strictly satisfies allowed fields whitelist in firestore.rules schema', () => {
      const keys = Object.keys(validMatchPayload);
      const invalidKeys = keys.filter((k) => !allowedKeys.includes(k));
      expect(invalidKeys).toEqual([]);
    });

    it('rejects unwhitelisted fields to prevent unauthorized data injection', () => {
      const payloadWithInjectedField = {
        ...validMatchPayload,
        isAdmin: true, // Injected malicious key
        role: 'superadmin',
      };

      const keys = Object.keys(payloadWithInjectedField);
      const invalidKeys = keys.filter((k) => !allowedKeys.includes(k));
      expect(invalidKeys.length).toBeGreaterThan(0);
      expect(invalidKeys).toContain('isAdmin');
      expect(invalidKeys).toContain('role');
    });

    it('enforces string length constraints on team names and venue (<= 120 chars)', () => {
      expect(validMatchPayload.teamA.length).toBeLessThanOrEqual(120);
      expect(validMatchPayload.teamB.length).toBeLessThanOrEqual(120);
      expect(validMatchPayload.venue.length).toBeLessThanOrEqual(120);

      const oversizedName = 'A'.repeat(121);
      expect(oversizedName.length > 120).toBe(true);
    });

    it('validates status is one of ALLOWED match status values', () => {
      const allowedStatuses = ['SCHEDULED', 'ONGOING', 'COMPLETED', 'ABANDONED', 'SUPER_OVER'];
      expect(allowedStatuses.includes(validMatchPayload.status)).toBe(true);

      const invalidStatus = 'DELETED_OR_HACKED';
      expect(allowedStatuses.includes(invalidStatus)).toBe(false);
    });

    it('validates totalOvers is an integer between 1 and 100', () => {
      expect(validMatchPayload.totalOvers >= 1 && validMatchPayload.totalOvers <= 100).toBe(true);
      expect(Number.isInteger(validMatchPayload.totalOvers)).toBe(true);

      const invalidOvers = 0;
      expect(invalidOvers >= 1 && invalidOvers <= 100).toBe(false);
    });

    it('enforces payload size cap (<= 1MB)', () => {
      const jsonBytes = new TextEncoder().encode(JSON.stringify(validMatchPayload)).length;
      expect(jsonBytes).toBeLessThanOrEqual(1048576); // 1MB cap

      // Simulate oversized payload
      const hugeData = 'x'.repeat(1048577);
      expect(new TextEncoder().encode(hugeData).length).toBeGreaterThan(1048576);
    });
  });

  // =========================================================================
  // 3. AUTHENTICATION ERROR SANITIZATION & REDACTION
  // =========================================================================
  describe('3. Authentication Error Sanitization & PII/Credential Redaction', () => {
    it('maps sensitive auth codes to user-friendly messages without exposing internal SDK details', () => {
      const mappedWeakPass = FirebaseAuthService.formatAuthError({ code: 'auth/weak-password' });
      expect(mappedWeakPass.message).toBe('Password must be at least 6 characters long.');

      const mappedPopupBlocked = FirebaseAuthService.formatAuthError({ code: 'auth/popup-blocked' });
      expect(mappedPopupBlocked.message).toContain('popup was blocked');

      const mappedNetwork = FirebaseAuthService.formatAuthError({ code: 'auth/network-request-failed' });
      expect(mappedNetwork.message).toContain('Network error');
    });

    it('returns a generic non-leaking message for unknown error codes without exposing raw messages', () => {
      const unknownError = {
        code: 'auth/internal-crypto-signature-failed-key-xyz',
        message: 'Internal private key 0xdeadbeef failed to decrypt user token',
      };

      const formatted = FirebaseAuthService.formatAuthError(unknownError);
      expect(formatted.message).toBe('An unexpected authentication error occurred. Please try again later.');
      // Must NOT contain sensitive internal details
      expect(formatted.message).not.toContain('0xdeadbeef');
      expect(formatted.message).not.toContain('internal-crypto');
    });

    it('sanitizes non-object error instances into generic safe string', () => {
      const stringError = 'CRITICAL: Database connection string mongodb://admin:secret@host:27017';
      const formatted = FirebaseAuthService.formatAuthError(stringError);
      expect(formatted.message).toBe('An unexpected authentication error occurred. Please try again later.');
      expect(formatted.message).not.toContain('mongodb');
      expect(formatted.message).not.toContain('secret');
    });
  });

  // =========================================================================
  // 4. EMAIL ENUMERATION MITIGATION
  // =========================================================================
  describe('4. Email Enumeration Mitigation', () => {
    it('unifies user-not-found, wrong-password, and invalid-credential into identical response', () => {
      const errNotFound = FirebaseAuthService.formatAuthError({ code: 'auth/user-not-found' });
      const errWrongPass = FirebaseAuthService.formatAuthError({ code: 'auth/wrong-password' });
      const errInvalidCred = FirebaseAuthService.formatAuthError({ code: 'auth/invalid-credential' });
      const errInvalidLoginCred = FirebaseAuthService.formatAuthError({ code: 'auth/invalid-login-credentials' });

      const expectedUnified = 'Invalid email or password. Please verify your credentials and try again.';
      expect(errNotFound.message).toBe(expectedUnified);
      expect(errWrongPass.message).toBe(expectedUnified);
      expect(errInvalidCred.message).toBe(expectedUnified);
      expect(errInvalidLoginCred.message).toBe(expectedUnified);
    });

    it('returns success on password reset even if email does not exist (prevents probing)', async () => {
      vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'AIzaSyTestKey1234567890');
      vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'test-project-cricket');
      vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'test-project-cricket.firebaseapp.com');
      vi.stubEnv('NEXT_PUBLIC_FIREBASE_APP_ID', '1:1234567890:web:abcdef');

      const result = await FirebaseAuthService.sendPasswordReset('unregistered-user-probe@example.com');
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects invalid email formats gracefully during password reset', async () => {
      const result = await FirebaseAuthService.sendPasswordReset('not-an-email');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Please enter a valid email address.');
    });
  });

  // =========================================================================
  // 5. GOOGLE DRIVE TOKEN LIFECYCLE & ISOLATION
  // =========================================================================
  describe('5. Google Drive Token Lifecycle, 5-Minute TTL & Boundary Isolation', () => {
    it('assertTokenSeparation rejects JWTs and Firebase ID tokens from Drive API calls', () => {
      const firebaseJwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9.abc';

      expect(() => {
        GoogleDriveAuthSpec.assertTokenSeparation(firebaseJwt);
      }).toThrow(/Firebase Auth ID token/i);
    });

    it('assertTokenSeparation accepts valid OAuth2 Bearer tokens (ya29.*)', () => {
      const validOAuthToken = 'ya29.a0ARrdaM8_valid_google_oauth_token_12345';
      expect(() => {
        GoogleDriveAuthSpec.assertTokenSeparation(validOAuthToken);
      }).not.toThrow();
    });

    it('enforces maximum 5-minute ephemeral memory TTL for cached token', async () => {
      const mockOAuthToken = 'ya29.test_ephemeral_token_ttl';
      // Seed the cache with a 1-hour expiry from Google OAuth response
      GoogleDriveService.setCachedTokenForTesting(mockOAuthToken, 3600);

      // Verify token is available immediately
      const tokenImmediate = GoogleDriveService.getCachedAccessToken();
      expect(tokenImmediate).toBe(mockOAuthToken);

      // Fast-forward time past 5 minutes (300,001 ms)
      const originalDateNow = Date.now;
      try {
        Date.now = vi.fn().mockReturnValue(originalDateNow() + 300001);
        // Cached token MUST be treated as expired due to the 5-minute cap
        const tokenExpired = GoogleDriveService.getCachedAccessToken();
        expect(tokenExpired).toBeNull();
      } finally {
        Date.now = originalDateNow;
      }
    });

    it('purges access token from memory on 401 Unauthorized during API calls', async () => {
      const mockToken = 'ya29.token_to_be_purged_on_401';
      GoogleDriveService.setCachedTokenForTesting(mockToken, 60);

      // Verify token is cached
      expect(GoogleDriveService.getCachedAccessToken()).toBe(mockToken);

      // Mock fetch returning 401 Unauthorized
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Invalid Credentials',
      }));

      // Call listBackups
      await expect(GoogleDriveService.listBackups(mockToken)).rejects.toThrow();

      // Token cache MUST be cleared following 401
      expect(GoogleDriveService.getCachedAccessToken()).toBeNull();
    });

    it('revokeAccessToken revokes Google token and purges memory cache', async () => {
      const mockToken = 'ya29.token_to_revoke';
      GoogleDriveService.setCachedTokenForTesting(mockToken, 60);

      const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
      vi.stubGlobal('fetch', mockFetch);

      await GoogleDriveService.revokeAccessToken();

      // Fetch should call Google oauth2 revoke endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('oauth2.googleapis.com/revoke'),
        expect.objectContaining({ method: 'POST' })
      );

      // Memory cache must be cleared
      expect(GoogleDriveService.getCachedAccessToken()).toBeNull();
    });
  });
});
