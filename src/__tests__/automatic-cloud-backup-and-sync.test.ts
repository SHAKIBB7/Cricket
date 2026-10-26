import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../infrastructure/database/dexie-db';
import { SyncEngine, AuthenticatedSession } from '../infrastructure/sync/SyncEngine';
import { MatchRepository } from '../infrastructure/storage/MatchRepository';
import { GroundRepository } from '../infrastructure/storage/GroundRepository';
import { renderToStaticMarkup } from 'react-dom/server';
import ProfilePage from '../app/profile/page';
import React from 'react';
import * as AuthContextModule from '../context/AuthContext';
import * as firebaseAuthModule from '../infrastructure/auth/firebase';
import { CricketGround, MatchScorecard } from '@/domain/cricket/types';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

// In-memory Firestore store for simulating multi-device cloud backend (hoisted for vi.mock)
const { firestoreStore } = vi.hoisted(() => {
  return {
    firestoreStore: {
      matches: {} as Record<string, any>,
      teams: {} as Record<string, any>,
      tournaments: {} as Record<string, any>,
      grounds: {} as Record<string, any>,
      users: {} as Record<string, any>,
    } as Record<string, Record<string, any>>,
  };
});

function resetFirestoreStore() {
  firestoreStore.matches = {};
  firestoreStore.teams = {};
  firestoreStore.tournaments = {};
  firestoreStore.grounds = {};
  firestoreStore.users = {};
}

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getFirestore: vi.fn().mockReturnValue({ isMockFirestore: true }),
    collection: vi.fn((_db, collectionName) => ({ type: 'collection', name: collectionName })),
    doc: vi.fn((_db, collectionName, id) => ({ type: 'doc', collection: collectionName, id })),
    where: vi.fn((field, op, val) => ({ field, op, val })),
    query: vi.fn((colRef, ...filters) => ({ type: 'query', colRef, filters })),
    setDoc: vi.fn(async (docRef, data, options) => {
      const col = docRef.collection || 'matches';
      const id = docRef.id;
      if (!firestoreStore[col]) firestoreStore[col] = {};
      if (options?.merge && firestoreStore[col][id]) {
        firestoreStore[col][id] = { ...firestoreStore[col][id], ...data };
      } else {
        firestoreStore[col][id] = { ...data };
      }
    }),
    getDoc: vi.fn(async (docRef) => {
      const col = docRef.collection;
      const id = docRef.id;
      const data = firestoreStore[col]?.[id];
      return {
        exists: () => !!data,
        data: () => data,
        id,
      };
    }),
    getDocs: vi.fn(async (queryOrCol) => {
      let colName = '';
      let filterField: string | null = null;
      let filterVal: any = null;

      if (queryOrCol.type === 'query') {
        colName = queryOrCol.colRef.name;
        for (const f of queryOrCol.filters) {
          if (f.field && f.val !== undefined) {
            filterField = f.field;
            filterVal = f.val;
          }
        }
      } else if (queryOrCol.type === 'collection') {
        colName = queryOrCol.name;
      }

      const all = Object.values(firestoreStore[colName] || {});
      const matched = filterField
        ? all.filter((item: any) => item[filterField!] === filterVal)
        : all;

      return {
        docs: matched.map((d: any) => ({
          id: d.id,
          data: () => d,
        })),
        size: matched.length,
        empty: matched.length === 0,
      };
    }),
    deleteDoc: vi.fn(async (docRef) => {
      const col = docRef.collection;
      const id = docRef.id;
      if (firestoreStore[col]) {
        delete firestoreStore[col][id];
      }
    }),
  };
});

// Mock Firebase client to provide valid database reference and pass checkFirebaseConfigured()
vi.mock('../infrastructure/auth/firebase', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    firestore: { isMockFirestore: true },
    getFirebaseDb: vi.fn().mockReturnValue({ isMockDb: true }),
    checkFirebaseConfigured: vi.fn().mockReturnValue(true),
    isFirebaseConfigured: true,
    getFirebaseConfigDiagnostics: vi.fn().mockReturnValue({
      isConfigured: true,
      missingVariables: [],
    }),
  };
});

describe('Automatic Cloud Backup & Cross-Device Data Sync Suite', () => {
  const USER_A_UID = 'user_device_A_101';
  const USER_B_UID = 'user_device_B_202';

  const sessionA: AuthenticatedSession = {
    provider: 'firebase',
    uid: USER_A_UID,
    token: 'token_user_A',
  };

  const sessionB: AuthenticatedSession = {
    provider: 'firebase',
    uid: USER_B_UID,
    token: 'token_user_B',
  };

  beforeEach(async () => {
    SyncEngine.stop();
    resetFirestoreStore();
    await db.matches.clear();
    await db.match_events.clear();
    await db.teams.clear();
    await db.tournaments.clear();
    await db.grounds.clear();
    await db.sync_queue.clear();
    await db.app_metadata.clear();

    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'AIzaSyFakeKeyForAutomaticSync123');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'cricket-proo');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_APP_ID', '1:123456789:web:abcdef');

    vi.spyOn(firebaseAuthModule, 'checkFirebaseConfigured').mockReturnValue(true);
    vi.spyOn(SyncEngine, 'checkServerReachability').mockResolvedValue(true);
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    SyncEngine.stop();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. AUTOMATIC CLOUD BACKUP (DEVICE A)
  // =========================================================================
  describe('Criterion 1: Automatic Cloud Backup on Data Creation & Mutation', () => {
    it('automatically queues and backs up created match and venue data to Firestore without user intervention', async () => {
      vi.spyOn(SyncEngine, 'getAuthenticatedSession').mockResolvedValue(sessionA);

      // 1. Create a match on Device A
      const matchData = {
        id: 'match_auto_backup_1',
        title: 'Dhaka Premier League Final',
        teamA: 'Dhaka Dynamites',
        teamB: 'Chittagong Kings',
        overs: 20,
        status: 'ONGOING' as const,
        userId: USER_A_UID,
        scorecard: {
          currentInnings: 1 as const,
          totalScore: 45,
          totalWickets: 1,
          totalBalls: 24,
        },
      };

      await MatchRepository.saveMatch(matchData as any);

      // Verify that saveMatch automatically queued mutation into Dexie
      const pendingOps = await db.sync_queue.where('status').equals('PENDING').toArray();
      expect(pendingOps.length).toBeGreaterThanOrEqual(1);
      expect(pendingOps[0].operationType).toBe('UPSERT_MATCH');
      expect(pendingOps[0].entityId).toBe('match_auto_backup_1');

      // 2. Also save a venue with valid geographical coordinates
      const groundData: CricketGround = {
        id: 'ground_mirpur_1',
        name: 'Sher-e-Bangla National Cricket Stadium',
        address: 'Mirpur, Dhaka, Bangladesh',
        latitude: 23.8069,
        longitude: 90.3636,
        userId: USER_A_UID,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await GroundRepository.saveGround(groundData);

      // 3. Trigger automatic background sync cycle
      await SyncEngine.syncNow();

      // 4. Verify Firestore now contains the match and ground with correct ownership and schema
      expect(firestoreStore.matches['match_auto_backup_1']).toBeDefined();
      expect(firestoreStore.matches['match_auto_backup_1'].teamA).toBe('Dhaka Dynamites');
      expect(firestoreStore.matches['match_auto_backup_1'].userId).toBe(USER_A_UID);
      expect(firestoreStore.matches['match_auto_backup_1'].scorecard_data).toBeDefined();

      expect(firestoreStore.grounds['ground_mirpur_1']).toBeDefined();
      expect(firestoreStore.grounds['ground_mirpur_1'].name).toBe('Sher-e-Bangla National Cricket Stadium');
      expect(firestoreStore.grounds['ground_mirpur_1'].userId).toBe(USER_A_UID);

      // 5. Outbox queue is now fully pruned / completed
      const remainingPending = await db.sync_queue.where('status').equals('PENDING').count();
      expect(remainingPending).toBe(0);
    });
  });

  // =========================================================================
  // 2. AUTOMATIC RESTORE ON ANOTHER DEVICE (DEVICE B)
  // =========================================================================
  describe('Criterion 2: Automatic Restore on Another Device Upon Login', () => {
    it('automatically restores existing cloud matches, events, squads, and grounds when user logs into a fresh device', async () => {
      // Setup: Cloud already contains user A's data (simulating Device A previous sync)
      firestoreStore.matches['match_cloud_100'] = {
        id: 'match_cloud_100',
        userId: USER_A_UID,
        teamA: 'Sylhet Strikers',
        teamB: 'Fortune Barishal',
        status: 'COMPLETED',
        overs: 20,
        scorecard_data: {
          id: 'match_cloud_100',
          teamA: 'Sylhet Strikers',
          teamB: 'Fortune Barishal',
          overs: 20,
          status: 'COMPLETED',
          createdAt: '2026-10-20T10:00:00.000Z',
          updatedAt: '2026-10-20T14:00:00.000Z',
          events: [
            { id: 'evt_ball_1', matchId: 'match_cloud_100', runsScored: 4, ballNumber: 1, overNumber: 0 },
            { id: 'evt_ball_2', matchId: 'match_cloud_100', runsScored: 1, ballNumber: 2, overNumber: 0 },
          ],
        },
        createdAt: '2026-10-20T10:00:00.000Z',
        updatedAt: '2026-10-20T14:00:00.000Z',
      };

      firestoreStore.teams['team_cloud_100'] = {
        id: 'team_cloud_100',
        userId: USER_A_UID,
        name: 'Sylhet Strikers',
        players: [{ id: 'p_mashrafe', name: 'Mashrafe Mortaza' }],
        updatedAt: '2026-10-20T10:00:00.000Z',
      };

      firestoreStore.grounds['ground_sylhet_100'] = {
        id: 'ground_sylhet_100',
        userId: USER_A_UID,
        name: 'Sylhet International Cricket Stadium',
        city: 'Sylhet',
        country: 'Bangladesh',
        pitchType: 'green_seaming',
        latitude: 24.9088,
        longitude: 91.8715,
        createdAt: '2026-10-20T10:00:00.000Z',
      };

      // Device B starts completely clean
      expect(await db.matches.count()).toBe(0);
      expect(await db.teams.count()).toBe(0);
      expect(await db.grounds.count()).toBe(0);
      expect(await db.match_events.count()).toBe(0);

      // User A logs in on Device B
      vi.spyOn(SyncEngine, 'getAuthenticatedSession').mockResolvedValue(sessionA);

      // Automatic sync triggers (same as triggered in AuthContext upon login)
      await SyncEngine.syncNow();

      // Verify all entities were restored into Dexie without any manual import file
      const restoredMatches = await db.matches.toArray();
      expect(restoredMatches.length).toBe(1);
      expect(restoredMatches[0].id).toBe('match_cloud_100');
      expect(restoredMatches[0].teamA).toBe('Sylhet Strikers');
      expect(restoredMatches[0].userId).toBe(USER_A_UID);

      // Embedded events restored to db.match_events
      const restoredEvents = await db.match_events.where('matchId').equals('match_cloud_100').toArray();
      expect(restoredEvents.length).toBe(2);

      const restoredTeams = await db.teams.toArray();
      expect(restoredTeams.length).toBe(1);
      expect(restoredTeams[0].name).toBe('Sylhet Strikers');

      const restoredGrounds = await db.grounds.toArray();
      expect(restoredGrounds.length).toBe(1);
      expect(restoredGrounds[0].name).toBe('Sylhet International Cricket Stadium');
    });
  });

  // =========================================================================
  // 3. SCORE UPDATES SYNCHRONIZATION
  // =========================================================================
  describe('Criterion 3: Cross-Device Score Updates', () => {
    it('propagates score updates and ball delta events across devices accurately', async () => {
      // 1. Setup initial match on Device A
      const matchId = 'match_live_scoring_1';
      const initialMatch = {
        id: matchId,
        teamA: 'Team Red',
        teamB: 'Team Green',
        userId: USER_A_UID,
        scorecard: { currentInnings: 1, totalScore: 10, totalWickets: 0, totalBalls: 6 },
      };
      await MatchRepository.saveMatch(initialMatch as any);

      // Add a 6-run boundary event
      await MatchRepository.saveEvents([
        { eventId: 'evt_six', matchId, runsScored: 6, isSix: true, ballNumber: 7, overNumber: 1 } as any,
      ]);

      // Push from Device A
      vi.spyOn(SyncEngine, 'getAuthenticatedSession').mockResolvedValue(sessionA);
      await SyncEngine.syncNow();

      // Check cloud snapshot has events attached
      expect(firestoreStore.matches[matchId].scorecard_data.events).toHaveLength(1);
      expect(firestoreStore.matches[matchId].scorecard_data.events[0].runsScored).toBe(6);

      // 2. Clear Dexie to simulate Device B
      await db.matches.clear();
      await db.match_events.clear();

      // Device B pulls cloud updates
      await SyncEngine.syncNow();

      // Device B now has the boundary event
      const deviceBEvents = await db.match_events.where('matchId').equals(matchId).toArray();
      expect(deviceBEvents.length).toBe(1);
      expect((deviceBEvents[0] as any).runsScored).toBe(6);
    });
  });

  // =========================================================================
  // 4. OFFLINE-FIRST SCORING & FLUSH UPON RECONNECTION
  // =========================================================================
  describe('Criterion 4: Offline Scoring & Auto-Flush on Reconnection', () => {
    it('allows full offline scoring and automatically uploads queued mutations once connection returns', async () => {
      vi.spyOn(SyncEngine, 'getAuthenticatedSession').mockResolvedValue(sessionA);

      // 1. Go offline
      vi.stubGlobal('navigator', { onLine: false });
      vi.spyOn(SyncEngine, 'checkServerReachability').mockResolvedValue(false);

      // 2. Score offline: add match
      const matchId = 'match_offline_test';
      await MatchRepository.saveMatch({
        id: matchId,
        teamA: 'Rangpur Riders',
        teamB: 'Comilla Victorians',
        userId: USER_A_UID,
        scorecard: { totalScore: 18, totalWickets: 0 },
      } as any);

      // Dexie write is non-blocking and immediate
      const localMatch = await db.matches.get(matchId);
      expect(localMatch).toBeDefined();

      // Mutations are safely buffered in sync_queue
      const queueItems = await db.sync_queue.where('status').equals('PENDING').toArray();
      expect(queueItems.length).toBeGreaterThan(0);

      // Cloud still does NOT have the match
      expect(firestoreStore.matches[matchId]).toBeUndefined();

      // Attempt sync while offline -> SyncEngine halts cleanly
      await SyncEngine.syncNow();
      expect(firestoreStore.matches[matchId]).toBeUndefined();

      // 3. Internet returns!
      vi.stubGlobal('navigator', { onLine: true });
      vi.spyOn(SyncEngine, 'checkServerReachability').mockResolvedValue(true);

      // Automatic flush runs
      await SyncEngine.syncNow();

      // Cloud now has the match!
      expect(firestoreStore.matches[matchId]).toBeDefined();
      expect(firestoreStore.matches[matchId].teamA).toBe('Rangpur Riders');

      // Local queue is resolved
      const remainingPending = await db.sync_queue.where('status').equals('PENDING').count();
      expect(remainingPending).toBe(0);
    });
  });

  // =========================================================================
  // 5. PROTECTION AGAINST EMPTY LOCAL OVERWRITING CLOUD
  // =========================================================================
  describe('Criterion 5: Cloud Protection Against Empty Local State', () => {
    it('does not delete or overwrite newer cloud data with an empty local database on initial sync', async () => {
      // Cloud contains 3 valuable matches
      firestoreStore.matches['m_cloud_1'] = {
        id: 'm_cloud_1',
        userId: USER_A_UID,
        teamA: 'Semi Final 1',
        scorecard_data: { id: 'm_cloud_1', teamA: 'Semi Final 1', createdAt: '2026-10-25T10:00:00.000Z' },
      };
      firestoreStore.matches['m_cloud_2'] = {
        id: 'm_cloud_2',
        userId: USER_A_UID,
        teamA: 'Semi Final 2',
        scorecard_data: { id: 'm_cloud_2', teamA: 'Semi Final 2', createdAt: '2026-10-25T10:00:00.000Z' },
      };
      firestoreStore.matches['m_cloud_3'] = {
        id: 'm_cloud_3',
        userId: USER_A_UID,
        teamA: 'Grand Final',
        scorecard_data: { id: 'm_cloud_3', teamA: 'Grand Final', createdAt: '2026-10-25T10:00:00.000Z' },
      };

      // Local device is completely empty
      expect(await db.matches.count()).toBe(0);
      expect(await db.sync_queue.count()).toBe(0);

      vi.spyOn(SyncEngine, 'getAuthenticatedSession').mockResolvedValue(sessionA);

      // Perform sync
      await SyncEngine.syncNow();

      // Cloud records MUST still exist in Firestore (not overwritten or purged)
      expect(Object.keys(firestoreStore.matches).length).toBe(3);
      expect(firestoreStore.matches['m_cloud_1'].teamA).toBe('Semi Final 1');

      // Local database now contains all 3 records
      expect(await db.matches.count()).toBe(3);
    });
  });

  // =========================================================================
  // 6. NON-DESTRUCTIVE CONFLICT RESOLUTION
  // =========================================================================
  describe('Criterion 6: Non-Destructive Conflict Resolution', () => {
    it('branches conflicting local records into a timestamped clone to guarantee zero data loss', async () => {
      vi.spyOn(SyncEngine, 'getAuthenticatedSession').mockResolvedValue(sessionA);

      const matchId = 'match_concurrent_1';

      // 1. Remote cloud version has newer timestamp and updated scorecard
      firestoreStore.matches[matchId] = {
        id: matchId,
        userId: USER_A_UID,
        teamA: 'Authoritative Cloud Team',
        updatedAt: '2026-10-25T12:00:00.000Z',
        createdAt: '2026-10-25T10:00:00.000Z',
        scorecard_data: {
          id: matchId,
          teamA: 'Authoritative Cloud Team',
          createdAt: '2026-10-25T10:00:00.000Z',
          updatedAt: '2026-10-25T12:00:00.000Z',
          totalScore: 120,
        },
      };

      // 2. Local device has older local modification that has pending sync queue operation
      await db.matches.put({
        id: matchId,
        userId: USER_A_UID,
        teamA: 'Local Match Record',
        createdAt: '2026-10-25T10:00:00.000Z',
        updatedAt: '2026-10-25T11:00:00.000Z',
        totalScore: 95,
      } as any);

      // Pending mutation exists locally
      await db.sync_queue.put({
        clientOpId: 'op_conflict_pending',
        operationType: 'UPSERT_MATCH',
        entityId: matchId,
        payload: { id: matchId, teamA: 'Local Match Record', totalScore: 95 },
        status: 'PENDING',
        retryCount: 0,
        createdAt: '2026-10-25T11:00:00.000Z',
      });

      // Perform sync pull
      await (SyncEngine as any).pullRemoteChanges(sessionA);

      // The primary record is updated to the authoritative cloud version
      const primaryRecord = await db.matches.get(matchId);
      expect(primaryRecord?.teamA).toBe('Authoritative Cloud Team');

      // The local conflicting record is branched non-destructively so no scorer work is lost!
      const allMatches = await db.matches.toArray();
      expect(allMatches.length).toBe(2);

      const branchedRecord = allMatches.find((m) => m.id.includes('_local_conflict_'));
      expect(branchedRecord).toBeDefined();
      expect(branchedRecord?.teamA).toBe('Local Match Record (Local Conflict)');
    });
  });

  // =========================================================================
  // 7. MULTI-TENANT ISOLATION
  // =========================================================================
  describe('Criterion 7: Multi-Tenant Data Isolation by UID', () => {
    it('ensures User B cannot see or synchronize User A’s cloud matches or venues', async () => {
      // User A creates records in Firestore
      firestoreStore.matches['m_user_A'] = {
        id: 'm_user_A',
        userId: USER_A_UID,
        teamA: 'User A Secret XI',
        scorecard_data: { id: 'm_user_A', teamA: 'User A Secret XI' },
      };
      firestoreStore.grounds['g_user_A'] = {
        id: 'g_user_A',
        userId: USER_A_UID,
        name: 'User A Private Club',
      };

      // User B logs in
      vi.spyOn(SyncEngine, 'getAuthenticatedSession').mockResolvedValue(sessionB);

      // User B syncs
      await SyncEngine.syncNow();

      // User B's local Dexie MUST NOT contain User A's data
      const allMatches = await db.matches.toArray();
      const userAMatchesInLocal = allMatches.filter((m) => m.userId === USER_A_UID);
      expect(userAMatchesInLocal.length).toBe(0);

      const allGrounds = await db.grounds.toArray();
      const userAGroundsInLocal = allGrounds.filter((g) => g.userId === USER_A_UID);
      expect(userAGroundsInLocal.length).toBe(0);

      expect(await db.matches.count()).toBe(0);
      expect(await db.grounds.count()).toBe(0);
    });
  });

  // =========================================================================
  // 8. ZERO MANUAL BACKUP UI REQUIREMENTS
  // =========================================================================
  describe('Criterion 8: Zero Manual Backup UI Requirements in Profile', () => {
    it('renders Automatic Cloud Backup & Sync status without any manual backup buttons or dialogs', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          uid: USER_A_UID,
          displayName: 'Shakib Al Hasan',
          email: 'shakib@tigers.bd',
        } as any,
        profile: {
          uid: USER_A_UID,
          displayName: 'Shakib Al Hasan',
          email: 'shakib@tigers.bd',
        } as any,
        isLoading: false,
        isConfigured: true,
        error: null,
        signInWithGoogle: vi.fn(),
        signInWithEmail: vi.fn(),
        signUpWithEmail: vi.fn(),
        sendPasswordReset: vi.fn(),
        signOut: vi.fn(),
        updateDisplayName: vi.fn(),
        refreshProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const html = renderToStaticMarkup(React.createElement(ProfilePage));

      // 1. Shows clean Automatic Cloud Backup & Sync card
      expect(html).toContain('Automatic Cloud Backup &amp; Sync');
      expect(html).toContain('Cloud Backup Active');
      expect(html).toContain('Zero-Friction Cross-Device Synchronization');

      // 2. Verified absence of all manual backup/restore/sync buttons
      expect(html).not.toContain('Backup to Google Drive');
      expect(html).not.toContain('Manage Backups / Restore');
      expect(html).not.toContain('Google Drive Cloud Backups');
      expect(html).not.toContain('Sync Now');
      expect(html).not.toContain('Export JSON Backup');
      expect(html).not.toContain('Import JSON Backup');

      // 3. Remote cloud safety transparency in Danger Zone
      expect(html).toContain('Remote cloud records in Firebase are protected');
    });
  });
});
