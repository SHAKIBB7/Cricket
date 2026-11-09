/**
 * Conflict resolution UI (pick-a-version) — SyncEngine helpers.
 *
 * When a pull would overwrite a record with unsynced local
 * work, the local version is preserved as a branch record with
 * syncStatus 'CONFLICT' and id `<primary>_local_conflict_<ts>`.
 * These tests pin the two helpers behind the profile page's
 * SyncConflictsSection:
 *  - listConflicts() surfaces every branch with its primary id,
 *    entity type, display name and updatedAt;
 *  - resolveConflict(branchId, type, 'keep-local') restores the
 *    branch content onto the primary record (id + name restored,
 *    syncStatus 'PENDING'), queues an UPSERT for it, and deletes
 *    the branch — fully offline;
 *  - resolveConflict(..., 'keep-remote') deletes only the branch.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../infrastructure/database/dexie-db';
import { SyncEngine } from '../infrastructure/sync/SyncEngine';
import { StorageManagerService } from '../infrastructure/storage/StorageManagerService';

const authHolder = vi.hoisted(() => ({
  currentUser: null as { uid: string } | null,
}));

vi.mock('../infrastructure/auth/firebase', async (importOriginal) => {
  const original = await importOriginal<typeof import('../infrastructure/auth/firebase')>();
  return {
    ...original,
    auth: {
      get currentUser() {
        return authHolder.currentUser;
      },
    },
  };
});

const T_OLD = '2024-01-01T00:00:00.000Z';
const T_NEW = '2024-06-01T00:00:00.000Z';
const TEAM_BRANCH_ID = 't_conf_local_conflict_1731000000000';
const MATCH_BRANCH_ID = 'm_conf_local_conflict_1731000001111';

async function seedTeamPair() {
  await db.teams.put({
    id: 't_conf',
    name: 'Cloud XI',
    captain: '',
    manager: '',
    players: [{ id: 'pl_arif', name: 'Arif' }],
    createdAt: T_OLD,
    updatedAt: T_OLD,
    syncStatus: 'SYNCED',
  });
  await db.teams.put({
    id: TEAM_BRANCH_ID,
    name: 'My XI (Local Conflict)',
    captain: '',
    manager: '',
    players: [{ id: 'pl_babul', name: 'Babul' }],
    createdAt: T_NEW,
    updatedAt: T_NEW,
    syncStatus: 'CONFLICT',
  });
}

async function seedMatchPair() {
  await db.matches.put({
    id: 'm_conf',
    teamA: 'Cloud Tigers',
    teamB: 'Lions',
    status: 'COMPLETED',
    createdAt: T_OLD,
    updatedAt: T_OLD,
    syncStatus: 'SYNCED',
  } as any);
  await db.matches.put({
    id: MATCH_BRANCH_ID,
    teamA: 'My Tigers (Local Conflict)',
    teamB: 'Lions',
    status: 'COMPLETED',
    createdAt: T_NEW,
    updatedAt: T_NEW,
    syncStatus: 'CONFLICT',
    isConflictBranch: true,
  } as any);
}

beforeEach(async () => {
  await db.matches.clear();
  await db.teams.clear();
  await db.tournaments.clear();
  await db.grounds.clear();
  await db.sync_queue.clear();
  await db.app_metadata.clear();
  (StorageManagerService as unknown as { deviceIdCache: string | null }).deviceIdCache = null;
  authHolder.currentUser = null;
});

afterEach(() => {
  SyncEngine.stop();
  vi.clearAllMocks();
});

describe('listConflicts', () => {
  it('finds a team branch with primary id, clean display name and updatedAt', async () => {
    await seedTeamPair();

    const conflicts = await SyncEngine.listConflicts();

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      branchId: TEAM_BRANCH_ID,
      primaryId: 't_conf',
      entityType: 'team',
      name: 'My XI',
      updatedAt: T_NEW,
    });
  });

  it('names a match branch from its teams, suffix stripped', async () => {
    await seedMatchPair();

    const conflicts = await SyncEngine.listConflicts();

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      branchId: MATCH_BRANCH_ID,
      primaryId: 'm_conf',
      entityType: 'match',
      name: 'My Tigers vs Lions',
    });
  });

  it('returns nothing when no CONFLICT records exist', async () => {
    await db.teams.put({
      id: 't_plain',
      name: 'Plain XI',
      captain: '',
      manager: '',
      players: [],
      createdAt: T_OLD,
      updatedAt: T_OLD,
      syncStatus: 'SYNCED',
    });

    expect(await SyncEngine.listConflicts()).toEqual([]);
  });
});

describe('resolveConflict — keep-local', () => {
  it('restores branch content onto the primary id, flags it PENDING, queues an UPSERT, deletes the branch', async () => {
    await seedTeamPair();

    const ok = await SyncEngine.resolveConflict(TEAM_BRANCH_ID, 'team', 'keep-local');
    expect(ok).toBe(true);

    const primary = await db.teams.get('t_conf');
    expect(primary?.name).toBe('My XI');
    expect(primary?.syncStatus).toBe('PENDING');
    expect(primary?.players.map((p) => p.id)).toEqual(['pl_babul']);
    expect(primary?.updatedAt).not.toBe(T_NEW);

    expect(await db.teams.get(TEAM_BRANCH_ID)).toBeUndefined();
    expect(await SyncEngine.listConflicts()).toEqual([]);

    const ops = (await db.sync_queue.toArray()).filter((op) => op.entityId === 't_conf');
    expect(ops).toHaveLength(1);
    expect(ops[0].operationType).toBe('UPSERT_TEAM');
    expect(ops[0].status).toBe('PENDING');
  });

  it('restores a match branch: teamA suffix stripped, conflict flag cleared, UPSERT_MATCH queued', async () => {
    await seedMatchPair();

    const ok = await SyncEngine.resolveConflict(MATCH_BRANCH_ID, 'match', 'keep-local');
    expect(ok).toBe(true);

    const primary = await db.matches.get('m_conf');
    expect(primary?.teamA).toBe('My Tigers');
    expect(primary?.syncStatus).toBe('PENDING');
    expect((primary as any)?.isConflictBranch).toBeFalsy();
    expect(await db.matches.get(MATCH_BRANCH_ID)).toBeUndefined();

    const ops = (await db.sync_queue.toArray()).filter((op) => op.entityId === 'm_conf');
    expect(ops).toHaveLength(1);
    expect(ops[0].operationType).toBe('UPSERT_MATCH');
  });
});

describe('resolveConflict — keep-remote', () => {
  it('deletes only the branch; the primary keeps the cloud version and no op is queued', async () => {
    await seedTeamPair();

    const ok = await SyncEngine.resolveConflict(TEAM_BRANCH_ID, 'team', 'keep-remote');
    expect(ok).toBe(true);

    const primary = await db.teams.get('t_conf');
    expect(primary?.name).toBe('Cloud XI');
    expect(primary?.syncStatus).toBe('SYNCED');
    expect(await db.teams.get(TEAM_BRANCH_ID)).toBeUndefined();
    expect(await db.sync_queue.count()).toBe(0);
    expect(await SyncEngine.listConflicts()).toEqual([]);
  });
});

describe('resolveConflict — guards', () => {
  it('rejects an id that is not a conflict branch', async () => {
    await seedTeamPair();

    expect(await SyncEngine.resolveConflict('t_conf', 'team', 'keep-local')).toBe(false);
    // The primary must not have been overwritten or deleted.
    expect((await db.teams.get('t_conf'))?.name).toBe('Cloud XI');
    expect(await db.teams.get(TEAM_BRANCH_ID)).toBeDefined();
  });

  it('rejects a well-formed branch id with no branch record', async () => {
    expect(
      await SyncEngine.resolveConflict('t_missing_local_conflict_1', 'team', 'keep-remote')
    ).toBe(false);
  });
});
