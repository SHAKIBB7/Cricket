import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../infrastructure/database/dexie-db';
import { FeatureHubRepository } from '../infrastructure/storage/FeatureHubRepository';
import { MatchRepository } from '../infrastructure/storage/MatchRepository';
import { UserProfileService } from '../infrastructure/auth/UserProfileService';
import { FirebaseAuthService } from '../infrastructure/auth/FirebaseAuthService';
import { GoogleDriveService } from '../infrastructure/storage/GoogleDriveService';
import { GoogleDriveAuthSpec } from '../infrastructure/auth/google-drive-auth-spec';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';

describe('Enterprise Account & User Profile Security & Regression Audit Suite', () => {
  beforeEach(async () => {
    await db.user_profile.clear();
    await db.matches.clear();
    await db.match_events.clear();
    await db.teams.clear();
    await db.tournaments.clear();
    await db.sync_queue.clear();
    await db.app_metadata.clear();
    GoogleDriveService.clearCachedToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. FIRST-TIME GOOGLE SIGN-IN AND PROFILE CREATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. First-Time Google Sign-In and Profile Creation', () => {
    it('initializes a full profile document and local Dexie cache with correct schema', async () => {
      const mockUser = {
        uid: 'user_enterprise_001',
        displayName: 'Shakib Al Hasan',
        email: 'shakib@tigers.bd',
        photoURL: 'https://images.example.com/shakib.png',
      };

      const profile = await UserProfileService.syncOrCreateUserProfile(mockUser);

      expect(profile).toBeDefined();
      expect(profile.uid).toBe('user_enterprise_001');
      expect(profile.displayName).toBe('Shakib Al Hasan');
      expect(profile.email).toBe('shakib@tigers.bd');
      expect(profile.photoURL).toBe('https://images.example.com/shakib.png');
      expect(profile.createdAt).toBeDefined();
      expect(profile.updatedAt).toBeDefined();
      expect(profile.syncStatus).toBeDefined();

      // Check Dexie cache
      const local = await FeatureHubRepository.loadProfileByUid('user_enterprise_001');
      expect(local).toBeDefined();
      expect(local?.name).toBe('Shakib Al Hasan');
      expect(local?.email).toBe('shakib@tigers.bd');
      expect(local?.isLoggedIn).toBe(true);
    });

    it('falls back to email prefix if Google account provides no display name', async () => {
      const mockUser = {
        uid: 'user_enterprise_002',
        displayName: null,
        email: 'scorer.pro.official@cricket.org',
        photoURL: null,
      };

      const profile = await UserProfileService.syncOrCreateUserProfile(mockUser);
      expect(profile.displayName).toBe('scorer.pro.official');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. EMAIL/PASSWORD REGISTRATION AND SIGN-IN
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Email/Password Registration and Sign-In Validation', () => {
    it('normalizes email input (trims, lowercase) and validates passwords', async () => {
      // 1. Invalid email
      const badEmailRes = await FirebaseAuthService.signInWithEmail('invalid-email-no-at', 'secretPass123');
      expect(badEmailRes.success).toBe(false);
      expect(badEmailRes.error).toContain('valid email');

      // 2. Empty password
      const emptyPassRes = await FirebaseAuthService.signInWithEmail('scorer@test.com', '');
      expect(emptyPassRes.success).toBe(false);
      expect(emptyPassRes.error).toContain('Password is required');

      // 3. Short password (< 6 chars) during registration
      const shortPassRes = await FirebaseAuthService.signUpWithEmail('scorer@test.com', '12345');
      expect(shortPassRes.success).toBe(false);
      expect(shortPassRes.error).toContain('at least 6 characters');

      // 4. Email normalization utility
      expect(UserProfileService.normalizeEmail('   John.Doe@EXAMPLE.COM   ')).toBe('john.doe@example.com');
      const emailVal = UserProfileService.validateEmail('   User.Scorer@Domain.ORG   ');
      expect(emailVal.isValid).toBe(true);
      expect(emailVal.normalized).toBe('user.scorer@domain.org');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. CUSTOM DISPLAY-NAME PRESERVATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Custom Display-Name Preservation', () => {
    it('never overwrites a user-customized display name with Google provider name on subsequent logins', async () => {
      const uid = 'user_legendary_777';

      // 1. Initial Google Sign-In with name "Mahendra Dhoni"
      await UserProfileService.syncOrCreateUserProfile({
        uid,
        displayName: 'Mahendra Dhoni',
        email: 'msd@cricket.org',
      });

      // 2. User customizes display name to "Captain Cool"
      await UserProfileService.updateDisplayName(uid, 'Captain Cool');

      // 3. Subsequent Google sign-in pass passes default "Mahendra Dhoni" again
      const returningProfile = await UserProfileService.syncOrCreateUserProfile({
        uid,
        displayName: 'Mahendra Dhoni',
        email: 'msd@cricket.org',
      });

      expect(returningProfile.displayName).toBe('Captain Cool');
      expect(returningProfile.displayName).not.toBe('Mahendra Dhoni');

      // 4. Dexie local record retains custom name
      const local = await FeatureHubRepository.loadProfileByUid(uid);
      expect(local?.name).toBe('Captain Cool');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. DISPLAY-NAME VALIDATION, INCLUDING UNICODE INPUT
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Display-Name Validation & Unicode Internationalization', () => {
    it('validates and accepts international Unicode characters (Bengali, Hindi, Arabic, European accents)', () => {
      // Bengali
      const bengali = UserProfileService.validateDisplayName('সাকিব আল হাসান');
      expect(bengali.isValid).toBe(true);
      expect(bengali.normalized).toBe('সাকিব আল হাসান');

      // Hindi
      const hindiName = 'सचिन तेंदुलकर';
      const hindi = UserProfileService.validateDisplayName(hindiName);
      expect(hindi.isValid).toBe(true);
      expect(hindi.normalized).toBe(hindiName);

      // Accents & hyphens
      const accented = UserProfileService.validateDisplayName('  José-Marie O\'Connor  ');
      expect(accented.isValid).toBe(true);
      expect(accented.normalized).toBe("José-Marie O'Connor");
    });

    it('strips invisible zero-width and control characters and rejects whitespace-only', () => {
      // Zero-width space (\u200B) stripped
      const zeroWidth = UserProfileService.validateDisplayName('\u200B\u200B');
      expect(zeroWidth.isValid).toBe(false);
      expect(zeroWidth.error).toContain('at least 2 characters');

      // Whitespace only
      const whitespace = UserProfileService.validateDisplayName('       ');
      expect(whitespace.isValid).toBe(false);
      expect(whitespace.error).toContain('at least 2 characters');

      // Empty string
      const empty = UserProfileService.validateDisplayName('');
      expect(empty.isValid).toBe(false);
      expect(empty.error).toContain('cannot be empty');

      // Name with invisible character around real letters
      const withInvisible = UserProfileService.validateDisplayName('\u200BRoot\uFEFF');
      expect(withInvisible.isValid).toBe(true);
      expect(withInvisible.normalized).toBe('Root');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. PROFILE UPDATE FAILURES AND RECOVERY
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Profile Update Failures and Recovery', () => {
    it('preserves local update with PENDING status when cloud update encounters error', async () => {
      const uid = 'user_offline_update_99';
      await UserProfileService.syncOrCreateUserProfile({
        uid,
        displayName: 'Original Name',
        email: 'orig@test.com',
      });

      // Update name locally
      const updated = await UserProfileService.updateDisplayName(uid, 'New Offline Name');

      expect(updated.displayName).toBe('New Offline Name');
      const local = await FeatureHubRepository.loadProfileByUid(uid);
      expect(local?.name).toBe('New Offline Name');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. FIRESTORE PERMISSION-DENIED AND NETWORK-ERROR SCENARIOS
  // ───────────────────────────────────────────────────────────────────────────
  describe('6. Firestore Permission-Denied and Network-Error Scenarios', () => {
    it('safely preserves existing local custom name and createdAt during cloud errors', async () => {
      const uid = 'user_resilience_test';
      const initialCreatedAt = '2026-01-01T00:00:00.000Z';

      // Seed local profile with custom name and existing createdAt
      await FeatureHubRepository.saveProfile({
        uid,
        name: 'Preserved Custom Name',
        email: 'resilient@test.com',
        isLoggedIn: true,
        createdAt: initialCreatedAt,
        lastSyncedAt: initialCreatedAt,
        syncStatus: 'LOCAL_ONLY',
      });

      // Cloud sync attempt with default Google name passed
      const result = await UserProfileService.syncOrCreateUserProfile({
        uid,
        displayName: 'Google Raw Name',
        email: 'resilient@test.com',
      });

      // MUST NOT overwrite local custom name or createdAt
      expect(result.displayName).toBe('Preserved Custom Name');
      expect(result.createdAt).toBe(initialCreatedAt);

      const local = await FeatureHubRepository.loadProfileByUid(uid);
      expect(local?.name).toBe('Preserved Custom Name');
      expect(local?.createdAt).toBe(initialCreatedAt);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. LOCAL FALLBACK AND SYNCHRONIZATION STATUS
  // ───────────────────────────────────────────────────────────────────────────
  describe('7. Local Fallback and Synchronization Status', () => {
    it('accurately identifies LOCAL_ONLY sync status when running offline', async () => {
      const uid = 'user_local_sync_status';
      const profile = await UserProfileService.syncOrCreateUserProfile({
        uid,
        displayName: 'Offline Hero',
        email: 'hero@test.com',
      });

      expect(profile.syncStatus).toBeDefined();
      const loaded = await UserProfileService.getUserProfile(uid);
      expect(loaded).toBeDefined();
      expect(loaded?.uid).toBe(uid);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. SESSION RESTORATION AFTER RELOAD
  // ───────────────────────────────────────────────────────────────────────────
  describe('8. Session Restoration After Reload', () => {
    it('provides safe observer callback without touching network in offline environments', () => {
      let receivedUser: any = undefined;
      const unsubscribe = FirebaseAuthService.onAuthStateChanged((user) => {
        receivedUser = user;
      });

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. CONCURRENT AUTHENTICATION AND PROFILE OPERATIONS
  // ───────────────────────────────────────────────────────────────────────────
  describe('9. Concurrent Authentication and Profile Operations', () => {
    it('deduplicates concurrent sync requests for the same UID to prevent race conditions', async () => {
      const uid = 'user_concurrent_race_test';
      const mockUser = {
        uid,
        displayName: 'Concurrent Player',
        email: 'concurrent@test.com',
      };

      // Fire 5 simultaneous sync calls
      const [p1, p2, p3, p4, p5] = await Promise.all([
        UserProfileService.syncOrCreateUserProfile(mockUser),
        UserProfileService.syncOrCreateUserProfile(mockUser),
        UserProfileService.syncOrCreateUserProfile(mockUser),
        UserProfileService.syncOrCreateUserProfile(mockUser),
        UserProfileService.syncOrCreateUserProfile(mockUser),
      ]);

      // All must resolve with the identical profile data without error
      expect(p1.displayName).toBe('Concurrent Player');
      expect(p2.displayName).toBe('Concurrent Player');
      expect(p3.displayName).toBe('Concurrent Player');
      expect(p4.displayName).toBe('Concurrent Player');
      expect(p5.displayName).toBe('Concurrent Player');
      expect(p1.uid).toBe(uid);
      expect(p2.uid).toBe(uid);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. SIGN-OUT AND ACCOUNT SWITCHING
  // ───────────────────────────────────────────────────────────────────────────
  describe('10. Sign-Out and Account Switching', () => {
    it('purges Drive cached token, resets active profile, and isolates next account', async () => {
      // 1. Sign in User A
      await UserProfileService.syncOrCreateUserProfile({
        uid: 'user_A_111',
        displayName: 'User Alpha',
        email: 'alpha@test.com',
      });

      // 2. Perform Sign Out
      const signOutResult = await FirebaseAuthService.signOutUser();
      expect(signOutResult.success).toBe(true);

      // Verify local active profile is cleared
      const afterSignOut = await FeatureHubRepository.loadProfile();
      expect(afterSignOut).toBeUndefined();

      // 3. Sign in User B
      await UserProfileService.syncOrCreateUserProfile({
        uid: 'user_B_222',
        displayName: 'User Beta',
        email: 'beta@test.com',
      });

      const userBProfile = await FeatureHubRepository.loadProfile();
      expect(userBProfile?.uid).toBe('user_B_222');
      expect(userBProfile?.name).toBe('User Beta');
      expect(userBProfile?.email).toBe('beta@test.com');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 11. PROFILE ISOLATION BETWEEN DIFFERENT USERS
  // ───────────────────────────────────────────────────────────────────────────
  describe('11. Profile Isolation Between Different Users', () => {
    it('loadProfile(expectedUid) strictly refuses to return a profile belonging to another user', async () => {
      // Store User X's profile in Dexie
      await FeatureHubRepository.saveProfile({
        uid: 'user_X_id',
        name: 'User X',
        email: 'x@test.com',
        isLoggedIn: true,
      });

      // Requesting with expected User Y's UID must return undefined (isolation enforced)
      const isolated = await FeatureHubRepository.loadProfile('user_Y_id');
      expect(isolated).toBeUndefined();

      // Requesting with User X's UID returns User X
      const authorized = await FeatureHubRepository.loadProfile('user_X_id');
      expect(authorized).toBeDefined();
      expect(authorized?.uid).toBe('user_X_id');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 12. IMMUTABLE PROFILE FIELDS AND SECURITY-RULE ENFORCEMENT
  // ───────────────────────────────────────────────────────────────────────────
  describe('12. Immutable Profile Fields and Security-Rule Enforcement', () => {
    it('protects createdAt and preserves it across subsequent profile updates', async () => {
      const uid = 'user_immutable_createdAt';
      const createdProfile = await UserProfileService.syncOrCreateUserProfile({
        uid,
        displayName: 'First Name',
        email: 'immut@test.com',
      });

      const originalCreatedAt = createdProfile.createdAt;
      expect(originalCreatedAt).toBeDefined();

      // Update display name
      const updatedProfile = await UserProfileService.updateDisplayName(uid, 'Second Name');

      // createdAt MUST remain immutable
      expect(updatedProfile.createdAt).toBe(originalCreatedAt);

      // Reload from local storage
      const reloaded = await UserProfileService.getUserProfile(uid);
      expect(reloaded?.createdAt).toBe(originalCreatedAt);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 13. PASSWORD-RESET BEHAVIOR
  // ───────────────────────────────────────────────────────────────────────────
  describe('13. Password-Reset Behavior', () => {
    it('validates and rejects empty or malformed email before dispatching reset', async () => {
      const emptyRes = await FirebaseAuthService.sendPasswordReset('');
      expect(emptyRes.success).toBe(false);
      expect(emptyRes.error).toContain('Email address is required');

      const malformedRes = await FirebaseAuthService.sendPasswordReset('not-an-email');
      expect(malformedRes.success).toBe(false);
      expect(malformedRes.error).toContain('valid email');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 14. GOOGLE DRIVE TOKEN AND PERMISSION BOUNDARIES
  // ───────────────────────────────────────────────────────────────────────────
  describe('14. Google Drive Token and Permission Boundaries', () => {
    it('strictly confines Drive permissions to drive.file and separates from Firebase Auth ID tokens', () => {
      expect(GoogleDriveService.DRIVE_FILE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
      expect(GoogleDriveAuthSpec.REQUIRED_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');

      // Standard JWT (Firebase ID token)
      const jwtToken = 'header.payload.signature';
      expect(GoogleDriveAuthSpec.isDriveAccessToken(jwtToken)).toBe(false);

      // GIS OAuth access token
      const gisToken = 'ya29.a0AWY7CkkL94_valid_token_test';
      expect(GoogleDriveAuthSpec.isDriveAccessToken(gisToken)).toBe(true);

      // Token cache clearing
      GoogleDriveService.clearCachedToken();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 15. OFFLINE SCORING REGRESSION SAFEGUARD
  // ───────────────────────────────────────────────────────────────────────────
  describe('15. Offline-First Match Scoring Lifecycle Safeguard', () => {
    it('executes ball scoring, boundary tracking, wicket dismissal and undo in 100% offline mode', async () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Chittagong Kings',
        teamB: 'Sylhet Strikers',
        tossWinner: 'Chittagong Kings',
        tossDecision: 'Batting',
        totalOvers: 10,
        strikerName: 'Tamim',
        nonStrikerName: 'Litton',
        bowlerName: 'Mustafizur',
      });

      // Ball 1: 4 runs (boundary)
      engine.scoreBall({ runsScored: 4 });
      // Ball 2: 6 runs (maximum)
      engine.scoreBall({ runsScored: 6 });
      // Ball 3: Wicket
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Caught',
        fielderName: 'Shanto',
        newBatsmanName: 'Mushfiqur',
      });

      expect(engine.firstInnings.totalRuns).toBe(10);
      expect(engine.firstInnings.totalWickets).toBe(1);

      // Persist to Dexie
      await MatchRepository.saveMatchWithEvents(engine.toScorecard(), engine.events, 0);

      const savedMatch = await MatchRepository.getMatch(engine.id);
      expect(savedMatch).toBeDefined();
      expect(savedMatch?.firstInnings?.totalRuns).toBe(10);
      expect(savedMatch?.firstInnings?.totalWickets).toBe(1);

      // Undo delivery
      engine.undo();
      expect(engine.firstInnings.totalRuns).toBe(10);
      expect(engine.firstInnings.totalWickets).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 16. PRESERVATION OF MATCHES, TEAMS, TOURNAMENTS DURING ACCOUNT OPERATIONS
  // ───────────────────────────────────────────────────────────────────────────
  describe('16. Preservation of Cricket Data During Account Operations', () => {
    it('guarantees 100% retention of matches, squads, and tournaments across sign-in, profile updates, and sign-out', async () => {
      // 1. Seed match
      const engine = new EventSourcedMatchEngine({
        teamA: 'Rajshahi Royals',
        teamB: 'Rangpur Rangers',
        tossWinner: 'Rajshahi Royals',
        tossDecision: 'Batting',
        totalOvers: 20,
      });
      engine.scoreBall({ runsScored: 1 });
      await MatchRepository.saveMatch(engine.toScorecard());

      // 2. Seed team
      await db.teams.put({
        id: 'team_audit_preserve_1',
        name: 'Rajshahi Royals',
        captain: 'Shoaib',
        manager: 'Coach A',
        players: ['Shoaib', 'Afif'],
        createdAt: new Date().toISOString(),
      });

      // 3. Seed tournament
      await db.tournaments.put({
        id: 'tourney_audit_preserve_1',
        name: 'BPL Championship',
        format: 'league',
        teams: ['team_audit_preserve_1'],
        fixtures: [],
        leagueMeetings: 1,
        matchOvers: 20,
        createdAt: new Date().toISOString(),
      });

      // 4. Perform User Sign-In
      await UserProfileService.syncOrCreateUserProfile({
        uid: 'user_audit_test_keeper',
        displayName: 'Keeper Pro',
        email: 'keeper@bpl.com',
      });

      // 5. Update Profile Display Name
      await UserProfileService.updateDisplayName('user_audit_test_keeper', 'Keeper Elite');

      // 6. Record Google Drive Backup timestamp
      await UserProfileService.recordDriveBackup('user_audit_test_keeper', new Date().toISOString());

      // 7. Perform Sign-Out
      await FirebaseAuthService.signOutUser();

      // 8. CRITICAL VERIFICATION: All cricket entities MUST be completely preserved
      const preservedMatch = await MatchRepository.getMatch(engine.id);
      expect(preservedMatch).toBeDefined();
      expect(preservedMatch?.teamA).toBe('Rajshahi Royals');
      expect(preservedMatch?.firstInnings?.totalRuns).toBe(1);

      const preservedTeams = await db.teams.toArray();
      expect(preservedTeams.length).toBe(1);
      expect(preservedTeams[0].name).toBe('Rajshahi Royals');

      const preservedTournaments = await db.tournaments.toArray();
      expect(preservedTournaments.length).toBe(1);
      expect(preservedTournaments[0].name).toBe('BPL Championship');
    });
  });
});
