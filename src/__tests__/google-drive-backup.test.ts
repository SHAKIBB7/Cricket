import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../infrastructure/database/dexie-db';
import { GoogleDriveService } from '../infrastructure/storage/GoogleDriveService';
import { GoogleDriveAuthSpec } from '../infrastructure/auth/google-drive-auth-spec';
import { UserProfileService } from '../infrastructure/auth/UserProfileService';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { MatchRepository } from '../infrastructure/storage/MatchRepository';

describe('Google Drive Backup & Restore Test Suite', () => {
  beforeEach(async () => {
    await db.matches.clear();
    await db.match_events.clear();
    await db.teams.clear();
    await db.tournaments.clear();
    await db.user_profile.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Scope & Token Boundaries', () => {
    it('strictly enforces the least-privilege drive.file scope', () => {
      expect(GoogleDriveService.DRIVE_FILE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
      expect(GoogleDriveAuthSpec.REQUIRED_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
    });

    it('distinguishes between ephemeral GIS OAuth access tokens and Firebase ID tokens', () => {
      const jwtToken = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc123sig';
      expect(GoogleDriveAuthSpec.isDriveAccessToken(jwtToken)).toBe(false);

      const gisToken = 'ya29.a0AWY7CkkL94_valid_drive_token_67890';
      expect(GoogleDriveAuthSpec.isDriveAccessToken(gisToken)).toBe(true);
    });
  });

  describe('2. Backup Payload Creation from Dexie IndexedDB', () => {
    it('packages all local matches, events, squads, and tournaments into structured backup format', async () => {
      // 1. Seed match data
      const match = new EventSourcedMatchEngine({
        id: 'match_drive_test_1',
        teamA: 'Mumbai Stars',
        teamB: 'Chennai Kings',
        tossWinner: 'Mumbai Stars',
        tossDecision: 'Batting',
        totalOvers: 20,
        strikerName: 'Rohit',
        nonStrikerName: 'Kishan',
        bowlerName: 'Chahar',
      });
      match.scoreBall({ runsScored: 6 });
      await MatchRepository.saveMatchWithEvents(match.toScorecard(), match.events, 0);

      // 2. Seed a team
      await db.teams.put({
        id: 'team_drive_1',
        name: 'Mumbai Stars',
        captain: 'Rohit',
        manager: 'Mahela',
        players: ['Rohit', 'Kishan'],
        createdAt: new Date().toISOString(),
      });

      // 3. Seed a tournament
      await db.tournaments.put({
        id: 'tourney_drive_1',
        name: 'Premier League',
        format: 'league',
        teams: ['team_drive_1'],
        fixtures: [],
        leagueMeetings: 1,
        matchOvers: 10,
        createdAt: new Date().toISOString(),
      });

      // 4. Generate payload
      const payload = await GoogleDriveService.createBackupPayload('user_firebase_uid_123');

      expect(payload.app).toBe('Cric Scorer Pro');
      expect(payload.version).toBe('2.5.0');
      expect(payload.userUid).toBe('user_firebase_uid_123');
      expect(payload.stats.matchesCount).toBe(1);
      expect(payload.stats.teamsCount).toBe(1);
      expect(payload.stats.tournamentsCount).toBe(1);
      expect(payload.matches[0].id).toBe('match_drive_test_1');
      expect(payload.teams[0].name).toBe('Mumbai Stars');
      expect(payload.tournaments[0].name).toBe('Premier League');
    });
  });

  describe('3. Restore from Backup into Dexie IndexedDB', () => {
    it('restores backup data into IndexedDB safely and merges records without corruption', async () => {
      const backupData = {
        app: 'Cric Scorer Pro',
        version: '2.5.0',
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        userUid: 'user_restore_test',
        stats: {
          matchesCount: 2,
          teamsCount: 1,
          tournamentsCount: 1,
          matchEventsCount: 1,
        },
        matches: [
          {
            id: 'restored_match_1',
            teamA: 'India',
            teamB: 'Pakistan',
            status: 'COMPLETED',
            currentInnings: 1,
            firstInnings: { totalRuns: 160, totalWickets: 5, oversCompleted: 20 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        matchEvents: [
          {
            eventId: 'event_1',
            matchId: 'restored_match_1',
            version: 1,
            timestamp: Date.now(),
            type: 'MATCH_CREATED',
            data: {},
          },
        ],
        teams: [
          {
            id: 'team_restored_1',
            name: 'India Legends',
            captain: 'Dhoni',
            manager: 'Kearns',
            players: ['Dhoni', 'Yuvraj'],
            createdAt: new Date().toISOString(),
          },
        ],
        tournaments: [
          {
            id: 'tourney_restored_1',
            name: 'World Championship',
            format: 'knockout',
            teams: ['team_restored_1'],
            matches: ['restored_match_1'],
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
          },
        ],
      };

      const summary = await GoogleDriveService.restoreToIndexedDb(backupData);

      expect(summary.matchesCount).toBe(1);
      expect(summary.teamsCount).toBe(1);
      expect(summary.tournamentsCount).toBe(1);
      expect(summary.matchEventsCount).toBe(1);

      // Verify records are accessible in Dexie
      const storedMatch = await db.matches.get('restored_match_1');
      expect(storedMatch).toBeDefined();
      expect(storedMatch?.teamA).toBe('India');
      expect(storedMatch?.firstInnings?.totalRuns).toBe(160);

      const storedTeam = await db.teams.get('team_restored_1');
      expect(storedTeam).toBeDefined();
      expect(storedTeam?.name).toBe('India Legends');

      const storedTourney = await db.tournaments.get('tourney_restored_1');
      expect(storedTourney).toBeDefined();
      expect(storedTourney?.name).toBe('World Championship');
    });

    it('rejects corrupt or invalid backup formats with clear error', async () => {
      await expect(GoogleDriveService.restoreToIndexedDb(null)).rejects.toThrow('Invalid backup file format');
      await expect(GoogleDriveService.restoreToIndexedDb({})).rejects.toThrow('No matches, teams, or tournaments found');
      await expect(GoogleDriveService.restoreToIndexedDb({ corruptedField: 123 })).rejects.toThrow(
        'Invalid Cric Scorer Pro backup structure'
      );
    });
  });

  describe('4. Firestore Profile Drive Metadata', () => {
    it('records lastDriveBackupAt timestamp in user profile metadata', async () => {
      const uid = 'user_drive_meta_test';
      const now = new Date().toISOString();

      await UserProfileService.syncOrCreateUserProfile({
        uid,
        displayName: 'Drive User',
        email: 'drive@example.com',
      });

      await UserProfileService.recordDriveBackup(uid, now);

      const profile = await UserProfileService.getUserProfile(uid);
      expect(profile).toBeDefined();
      expect(profile?.lastDriveBackupAt).toBe(now);
    });
  });

  describe('5. Google Drive Cloud Data Deletion & Strict Isolation', () => {
    it('successfully calls Google Drive API DELETE endpoint with fileId and bearer token', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      });
      global.fetch = mockFetch;

      const accessToken = 'ya29.test_valid_token_123';
      const fileId = 'drive_backup_file_to_delete_999';

      await GoogleDriveService.deleteBackup(accessToken, fileId);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`https://www.googleapis.com/drive/v3/files/${fileId}`);
      expect(options.method).toBe('DELETE');
      expect(options.headers.Authorization).toBe(`Bearer ${accessToken}`);
    });

    it('treats 404 (already deleted) as a successful idempotent operation', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      global.fetch = mockFetch;

      await expect(
        GoogleDriveService.deleteBackup('ya29.token', 'already_deleted_id')
      ).resolves.not.toThrow();
    });

    it('clears cached access token and throws error on HTTP 401 Unauthorized', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized token',
      });
      global.fetch = mockFetch;

      const clearSpy = vi.spyOn(GoogleDriveService, 'clearCachedToken');

      await expect(
        GoogleDriveService.deleteBackup('ya29.expired_token', 'file_xyz')
      ).rejects.toThrow('Google Drive authorization expired (401)');

      expect(clearSpy).toHaveBeenCalled();
    });

    it('throws descriptive error on server error (HTTP 500)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error in Drive',
      });
      global.fetch = mockFetch;

      await expect(
        GoogleDriveService.deleteBackup('ya29.token', 'file_error')
      ).rejects.toThrow('Failed to delete backup from Google Drive (500)');
    });

    it('guarantees that deleting a cloud backup leaves local IndexedDB matches and teams completely intact', async () => {
      // 1. Seed local match and team
      const match = new EventSourcedMatchEngine({
        id: 'local_protected_match_1',
        teamA: 'Local Tigers',
        teamB: 'Local Lions',
        tossWinner: 'Local Tigers',
        tossDecision: 'Batting',
        totalOvers: 10,
        strikerName: 'Tamim',
        nonStrikerName: 'Litton',
        bowlerName: 'Mustafiz',
      });
      await MatchRepository.saveMatchWithEvents(match.toScorecard(), match.events, 0);

      await db.teams.put({
        id: 'local_protected_team_1',
        name: 'Local Tigers',
        captain: 'Tamim',
        manager: 'Hathurusingha',
        players: ['Tamim', 'Litton'],
        createdAt: new Date().toISOString(),
      });

      // 2. Perform cloud backup deletion
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      });
      global.fetch = mockFetch;

      await GoogleDriveService.deleteBackup('ya29.token', 'some_cloud_snapshot_id');

      // 3. Assert local data was NOT touched
      const storedMatch = await db.matches.get('local_protected_match_1');
      expect(storedMatch).toBeDefined();
      expect(storedMatch?.teamA).toBe('Local Tigers');

      const storedTeam = await db.teams.get('local_protected_team_1');
      expect(storedTeam).toBeDefined();
      expect(storedTeam?.name).toBe('Local Tigers');

      const matchesCount = await db.matches.count();
      const teamsCount = await db.teams.count();
      expect(matchesCount).toBe(1);
      expect(teamsCount).toBe(1);
    });
  });

  describe('6. Google Drive Round-Trip Verification & Ongoing Match Continuation', () => {
    it('restores ongoing match and properly configures last_active_match_id in app_metadata', async () => {
      const ongoingMatch = {
        id: 'ongoing_match_drive_1',
        teamA: 'Dhaka Dynamites',
        teamB: 'Chittagong Vikings',
        status: 'ONGOING',
        currentInnings: 1,
        totalOvers: 20,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const backupData = {
        app: 'Cric Scorer Pro',
        version: '2.5.0',
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        userUid: 'user_active_test',
        stats: {
          matchesCount: 1,
          teamsCount: 0,
          tournamentsCount: 0,
          matchEventsCount: 0,
        },
        matches: [ongoingMatch],
        matchEvents: [],
        teams: [],
        tournaments: [],
      };

      await GoogleDriveService.restoreToIndexedDb(backupData);

      // Verify ongoing match is restored
      const match = await db.matches.get('ongoing_match_drive_1');
      expect(match).toBeDefined();
      expect(match?.status).toBe('ONGOING');

      // Verify app_metadata contains last_active_match_id
      const meta = await db.app_metadata.get('last_active_match_id');
      expect(meta).toBeDefined();
      expect(meta?.value).toBe('ongoing_match_drive_1');
    });
  });
});
