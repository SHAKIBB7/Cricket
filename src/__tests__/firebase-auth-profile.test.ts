import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../infrastructure/database/dexie-db';
import { FeatureHubRepository } from '../infrastructure/storage/FeatureHubRepository';
import { MatchRepository } from '../infrastructure/storage/MatchRepository';
import { UserProfileService } from '../infrastructure/auth/UserProfileService';
import { FirebaseAuthService } from '../infrastructure/auth/FirebaseAuthService';
import { GoogleDriveAuthSpec } from '../infrastructure/auth/google-drive-auth-spec';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';

describe('Firebase Authentication & User Profile Test Suite', () => {
  beforeEach(async () => {
    await db.user_profile.clear();
    await db.matches.clear();
    await db.match_events.clear();
    await db.sync_queue.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. FIRST-TIME SIGN-IN & PROFILE CREATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. First-Time Sign-In & Profile Creation', () => {
    it('creates initial profile document using Google account details and populates Dexie', async () => {
      const mockFirebaseUser = {
        uid: 'user_first_time_123',
        displayName: 'Sachin Tendulkar',
        email: 'sachin@cricket.org',
        photoURL: 'https://images.example.com/sachin.jpg',
      };

      const profile = await UserProfileService.syncOrCreateUserProfile(mockFirebaseUser);

      expect(profile).toBeDefined();
      expect(profile.uid).toBe('user_first_time_123');
      expect(profile.displayName).toBe('Sachin Tendulkar');
      expect(profile.email).toBe('sachin@cricket.org');
      expect(profile.photoURL).toBe('https://images.example.com/sachin.jpg');
      expect(profile.createdAt).toBeDefined();
      expect(profile.updatedAt).toBeDefined();

      // Verify that local Dexie user_profile table is synchronized
      const localProfile = await FeatureHubRepository.loadProfile();
      expect(localProfile).toBeDefined();
      expect(localProfile?.uid).toBe('user_first_time_123');
      expect(localProfile?.name).toBe('Sachin Tendulkar');
      expect(localProfile?.email).toBe('sachin@cricket.org');
      expect(localProfile?.isLoggedIn).toBe(true);
    });

    it('falls back to email prefix if Google account has no display name', async () => {
      const mockFirebaseUser = {
        uid: 'user_no_name_456',
        displayName: null,
        email: 'scorer.legend@domain.com',
        photoURL: null,
      };

      const profile = await UserProfileService.syncOrCreateUserProfile(mockFirebaseUser);

      expect(profile.uid).toBe('user_no_name_456');
      expect(profile.displayName).toBe('scorer.legend');
      expect(profile.email).toBe('scorer.legend@domain.com');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. RETURNING USER AUTHENTICATION & CUSTOM DISPLAY NAME PRESERVATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Returning User Authentication & Custom Display Name Preservation', () => {
    it('preserves existing custom display name on subsequent logins instead of overwriting with Google name', async () => {
      const uid = 'user_custom_name_789';

      // First sign-in: Sets initial Google name
      await UserProfileService.syncOrCreateUserProfile({
        uid,
        displayName: 'Rohit Sharma',
        email: 'rohit@cricket.org',
        photoURL: 'https://example.com/rohit.jpg',
      });

      // User customizes their display name to "Hitman Sharma"
      await UserProfileService.updateDisplayName(uid, 'Hitman Sharma');

      // Subsequent login: Google provider passes "Rohit Sharma" again
      const returningProfile = await UserProfileService.syncOrCreateUserProfile({
        uid,
        displayName: 'Rohit Sharma', // Default Google name passed by provider
        email: 'rohit@cricket.org',
        photoURL: 'https://example.com/rohit-new.jpg',
      });

      // CRITICAL VERIFICATION: Custom name must remain "Hitman Sharma"
      expect(returningProfile.displayName).toBe('Hitman Sharma');
      expect(returningProfile.displayName).not.toBe('Rohit Sharma');

      // Verify Dexie local record also retains the custom display name
      const local = await FeatureHubRepository.loadProfile();
      expect(local?.name).toBe('Hitman Sharma');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. DISPLAY NAME UPDATES & INPUT VALIDATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Display Name Validation & Updates', () => {
    it('accepts and trims valid display names between 2 and 50 characters', () => {
      const valid = UserProfileService.validateDisplayName('   Rahul Dravid   ');
      expect(valid.isValid).toBe(true);
      expect(valid.normalized).toBe('Rahul Dravid');

      const maxLenName = 'A'.repeat(50);
      const validMax = UserProfileService.validateDisplayName(maxLenName);
      expect(validMax.isValid).toBe(true);
      expect(validMax.normalized.length).toBe(50);
    });

    it('rejects empty, whitespace-only, too short, and too long names', () => {
      const empty = UserProfileService.validateDisplayName('');
      expect(empty.isValid).toBe(false);
      expect(empty.error).toContain('cannot be empty');

      const whitespace = UserProfileService.validateDisplayName('     ');
      expect(whitespace.isValid).toBe(false);
      expect(whitespace.error).toContain('at least 2 characters');

      const tooShort = UserProfileService.validateDisplayName('A');
      expect(tooShort.isValid).toBe(false);
      expect(tooShort.error).toContain('at least 2 characters');

      const tooLong = UserProfileService.validateDisplayName('A'.repeat(51));
      expect(tooLong.isValid).toBe(false);
      expect(tooLong.error).toContain('cannot exceed 50 characters');
    });

    it('throws when attempting to update display name with invalid input', async () => {
      await expect(UserProfileService.updateDisplayName('uid_123', 'X')).rejects.toThrow(
        'at least 2 characters'
      );
      await expect(UserProfileService.updateDisplayName('uid_123', '')).rejects.toThrow(
        'cannot be empty'
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. AUTHENTICATION FAILURE & POPUP ERROR HANDLING
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Authentication Failure & Error Translation', () => {
    it('translates popup closure into friendly cancellation without scary error banner', () => {
      const err = { code: 'auth/popup-closed-by-user' };
      const formatted = FirebaseAuthService.formatAuthError(err);

      expect(formatted.cancelled).toBe(true);
      expect(formatted.message).toContain('cancelled before completion');
    });

    it('translates popup blocked by browser into informative instruction', () => {
      const err = { code: 'auth/popup-blocked' };
      const formatted = FirebaseAuthService.formatAuthError(err);

      expect(formatted.cancelled).toBe(false);
      expect(formatted.message).toContain('blocked by your browser');
    });

    it('translates network failures gracefully', () => {
      const err = { code: 'auth/network-request-failed' };
      const formatted = FirebaseAuthService.formatAuthError(err);

      expect(formatted.cancelled).toBe(false);
      expect(formatted.message).toContain('Network error');
    });

    it('translates unauthorized domain or operation-not-allowed errors', () => {
      const errDomain = { code: 'auth/unauthorized-domain' };
      expect(FirebaseAuthService.formatAuthError(errDomain).message).toContain('not authorized for OAuth');

      const errOp = { code: 'auth/operation-not-allowed' };
      expect(FirebaseAuthService.formatAuthError(errOp).message).toContain('enabled in Firebase Console');
    });

    it('translates email/password specific authentication errors', () => {
      const emailInUse = { code: 'auth/email-already-in-use' };
      expect(FirebaseAuthService.formatAuthError(emailInUse).message).toContain('already in use');

      const weakPass = { code: 'auth/weak-password' };
      expect(FirebaseAuthService.formatAuthError(weakPass).message).toContain('at least 6 characters');

      const invalidCred = { code: 'auth/invalid-credential' };
      expect(FirebaseAuthService.formatAuthError(invalidCred).message).toContain('Invalid email or password');

      const userNotFound = { code: 'auth/user-not-found' };
      expect(FirebaseAuthService.formatAuthError(userNotFound).message).toContain('No account found');

      const wrongPass = { code: 'auth/wrong-password' };
      expect(FirebaseAuthService.formatAuthError(wrongPass).message).toContain('Incorrect password');

      const tooMany = { code: 'auth/too-many-requests' };
      expect(FirebaseAuthService.formatAuthError(tooMany).message).toContain('Too many unsuccessful attempts');
    });

    it('validates client-side inputs for email and password authentication', async () => {
      const emptyEmailRes = await FirebaseAuthService.signInWithEmail('', 'password123');
      expect(emptyEmailRes.success).toBe(false);
      expect(emptyEmailRes.error).toContain('Email address is required');

      const emptyPassRes = await FirebaseAuthService.signInWithEmail('test@example.com', '');
      expect(emptyPassRes.success).toBe(false);
      expect(emptyPassRes.error).toContain('Password is required');

      const shortPassRes = await FirebaseAuthService.signUpWithEmail('test@example.com', '12345');
      expect(shortPassRes.success).toBe(false);
      expect(shortPassRes.error).toContain('at least 6 characters');

      const emptyResetRes = await FirebaseAuthService.sendPasswordReset('');
      expect(emptyResetRes.success).toBe(false);
      expect(emptyResetRes.error).toContain('Email address is required');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. SIGN-OUT & SESSION RESTORATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Sign-Out & Session State', () => {
    it('clears profile session on sign-out and reverts to guest mode without touching match data', async () => {
      // 1. Create a match first to test data retention
      const engine = new EventSourcedMatchEngine({
        teamA: 'India',
        teamB: 'Australia',
        tossWinner: 'India',
        tossDecision: 'Batting',
        totalOvers: 20,
      });
      engine.scoreBall({ runsScored: 4 });
      await MatchRepository.saveMatch(engine.toScorecard());

      // 2. Set signed-in profile
      await UserProfileService.syncOrCreateUserProfile({
        uid: 'user_temp_logout',
        displayName: 'Temporary User',
        email: 'temp@cricket.org',
      });

      const beforeSignOut = await FeatureHubRepository.loadProfile();
      expect(beforeSignOut?.isLoggedIn).toBe(true);

      // 3. Perform Sign-Out
      const signOutResult = await FirebaseAuthService.signOutUser();
      expect(signOutResult.success).toBe(true);

      // 4. Verify user profile is cleared
      const afterSignOut = await FeatureHubRepository.loadProfile();
      expect(afterSignOut).toBeUndefined();

      // 5. CRITICAL CHECK: Match data MUST be 100% intact
      const preservedMatch = await MatchRepository.getMatch(engine.id);
      expect(preservedMatch).toBeDefined();
      expect(preservedMatch?.id).toBe(engine.id);
      expect(preservedMatch?.firstInnings?.totalRuns).toBe(4);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. GOOGLE DRIVE BACKUP PREPARATION BOUNDARIES
  // ───────────────────────────────────────────────────────────────────────────
  describe('6. Google Drive Scope & Token Boundaries (Phase 2 Prep)', () => {
    it('enforces least-privilege scope drive.file and distinguishes access tokens from ID tokens', () => {
      expect(GoogleDriveAuthSpec.REQUIRED_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');

      // Firebase ID token (JWT - 3 segments)
      const mockFirebaseIdToken = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc123sig';
      expect(GoogleDriveAuthSpec.isDriveAccessToken(mockFirebaseIdToken)).toBe(false);

      // Google Identity Services OAuth 2.0 access token
      const mockGisAccessToken = 'ya29.a0AWY7CkkL94_dummy_access_token_12345';
      expect(GoogleDriveAuthSpec.isDriveAccessToken(mockGisAccessToken)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. OFFLINE SCORING REGRESSION TEST
  // ───────────────────────────────────────────────────────────────────────────
  describe('7. Offline-First Match Scoring Regression Safeguard', () => {
    it('allows full cricket match lifecycle, ball-by-ball scoring and undo without any network or authentication requirement', async () => {
      const match = new EventSourcedMatchEngine({
        teamA: 'Yorkshire',
        teamB: 'Surrey',
        tossWinner: 'Yorkshire',
        tossDecision: 'Batting',
        totalOvers: 5,
        strikerName: 'Root',
        nonStrikerName: 'Brook',
        bowlerName: 'Curran',
      });

      // Score delivery 1: 4 runs
      match.scoreBall({ runsScored: 4 });
      // Score delivery 2: 6 runs
      match.scoreBall({ runsScored: 6 });
      // Score delivery 3: Wicket
      match.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled', newBatsmanName: 'Bairstow' });

      expect(match.firstInnings.totalRuns).toBe(10);
      expect(match.firstInnings.totalWickets).toBe(1);

      // Save to IndexedDB
      await MatchRepository.saveMatchWithEvents(match.toScorecard(), match.events, 0);

      // Verify persistence
      const saved = await MatchRepository.getMatch(match.id);
      expect(saved).toBeDefined();
      expect(saved?.firstInnings?.totalRuns).toBe(10);

      // Test event-sourced undo
      match.undo();
      expect(match.firstInnings.totalRuns).toBe(10);
      expect(match.firstInnings.totalWickets).toBe(0);

      // Update in local database
      await MatchRepository.saveMatch(match.toScorecard());
      const updated = await MatchRepository.getMatch(match.id);
      expect(updated?.firstInnings?.totalWickets).toBe(0);
    });
  });
});
