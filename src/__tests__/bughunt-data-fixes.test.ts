/**
 * Bug-hunt Batch C (data integrity & sync) — D-1..D-11 fixes.
 *
 *  - D-1: a match conflict branch snapshots the local event
 *    log; resolveConflict keep-local reinstalls it, so the
 *    restored scorecard is never re-paired with the remote
 *    version's ball-by-ball history.
 *  - D-2: Supabase UPSERT_MATCH embeds the event log, like
 *    Firestore already did.
 *  - D-3: file + Drive restores store records PENDING and
 *    queue UPSERTs for everything they wrote.
 *  - D-4: a Clear Database tombstone stops pulls resurrecting
 *    pre-clear records; tombstone DELETEs are queued instead.
 *  - D-5: Drive merge restore converges event deletions.
 *  - D-6: Supabase UPSERT_TEAM sends the record's own
 *    updatedAt, not upload time.
 *  - D-7: a queued (PENDING/FAILED) DELETE blocks pull
 *    resurrection.
 *  - D-8/D-9: source pins (Dexie v2 default, rules caps,
 *    backup-version set) where a behavioural test cannot
 *    reach (no emulator / no v1 database in this env).
 *  - D-10: duplicate player ids are re-minted on intake.
 *  - D-11: file import validates records, not just the
 *    envelope, and reports the dropped count.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { db } from '../infrastructure/database/dexie-db';
import { SyncEngine } from '../infrastructure/sync/SyncEngine';
import { StorageManagerService } from '../infrastructure/storage/StorageManagerService';
import { GoogleDriveService } from '../infrastructure/storage/GoogleDriveService';
import { normalizeTeamPlayers } from '../domain/teams/playerIdentity';
import * as supabaseModule from '../infrastructure/auth/supabase';
import { setSupabaseAuthToken, clearSupabaseClientCache } from '../infrastructure/auth/supabase';

// ── In-memory Firestore (pattern from automatic-cloud-backup) ──
const { firestoreStore } = vi.hoisted(() => ({
  firestoreStore: {
    matches: {} as Record<string, any>,
    teams: {} as Record<string, any>,
    tournaments: {} as Record<string, any>,
    grounds: {} as Record<string, any>,
    users: {} as Record<string, any>,
  } as Record<string, Record<string, any>>,
}));

function resetFirestoreStore() {
  firestoreStore.matches = {};
  firestoreStore.teams = {};
  firestoreStore.tournaments = {};
  firestoreStore.grounds = {};
  firestoreStore.users = {};
}

const authHolder = vi.hoisted(() => ({
  currentUser: null as { uid: string } | null,
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getFirestore: vi.fn().mockReturnValue({ isMockFirestore: true }),
    collection: vi.fn((_db: any, name: string) => ({ type: 'collection', name })),
    doc: vi.fn((_db: any, collectionName: string, id: string) => ({ type: 'doc', collection: collectionName, id })),
    where: vi.fn((field: string, op: string, val: any) => ({ field, op, val })),
    query: vi.fn((colRef: any, ...filters: any[]) => ({ type: 'query', colRef, filters })),
    setDoc: vi.fn(async (docRef: any, data: any, options: any) => {
      const col = docRef.collection || 'matches';
      if (!firestoreStore[col]) firestoreStore[col] = {};
      firestoreStore[col][docRef.id] =
        options?.merge && firestoreStore[col][docRef.id]
          ? { ...firestoreStore[col][docRef.id], ...data }
          : { ...data };
    }),
    getDocs: vi.fn(async (queryOrCol: any) => {
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
      const matched = filterField ? all.filter((i: any) => i[filterField!] === filterVal) : all;
      return {
        docs: matched.map((d: any) => ({ id: d.id, data: () => d })),
        size: matched.length,
        empty: matched.length === 0,
      };
    }),
    deleteDoc: vi.fn(async (docRef: any) => {
      if (firestoreStore[docRef.collection]) delete firestoreStore[docRef.collection][docRef.id];
    }),
  };
});

vi.mock('../infrastructure/auth/firebase', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    firestore: { isMockFirestore: true },
    checkFirebaseConfigured: vi.fn().mockReturnValue(true),
    auth: {
      get currentUser() {
        return authHolder.currentUser;
      },
    },
  };
});

const T_OLD = '2026-01-01T10:00:00.000Z';
const T_MID = '2026-06-01T10:00:00.000Z';
const T_NEW = '2026-11-01T10:00:00.000Z';
const SESSION = { provider: 'firebase' as const, uid: 'u1', token: 'tok' };

const evt = (eventId: string, matchId: string, version: number) =>
  ({ eventId, matchId, version, type: 'BALL', timestamp: T_OLD }) as any;

async function pull() {
  await (SyncEngine as any).pullRemoteChanges(SESSION);
}

beforeEach(async () => {
  resetFirestoreStore();
  authHolder.currentUser = null;
  await db.matches.clear();
  await db.match_events.clear();
  await db.teams.clear();
  await db.tournaments.clear();
  await db.grounds.clear();
  await db.sync_queue.clear();
  await db.app_metadata.clear();
  setSupabaseAuthToken(null);
  clearSupabaseClientCache();
});

afterEach(() => {
  SyncEngine.stop();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  // clearAllMocks, NOT restoreAllMocks: restoring would reset
  // the vi.fn() implementations inside the vi.mock factories
  // above (getDocs & friends) for later tests in this file.
  vi.clearAllMocks();
});

// ─── D-1 ─────────────────────────────────────────────────────
describe('D-1 — conflict branch carries the local event log', () => {
  it('branch + keep-local preserves the local ball-by-ball history end to end', async () => {
    // Local version with unsynced work and its own event log.
    await db.matches.put({
      id: 'm1', teamA: 'Local XI', teamB: 'Rivals', status: 'ONGOING',
      createdAt: T_OLD, updatedAt: T_OLD, syncStatus: 'PENDING',
    } as any);
    await db.match_events.bulkPut([evt('e_l1', 'm1', 1), evt('e_l2', 'm1', 2)]);
    await db.sync_queue.put({
      clientOpId: 'op_local_m1', operationType: 'UPSERT_MATCH', entityId: 'm1',
      payload: { id: 'm1' }, status: 'PENDING', retryCount: 0, createdAt: T_OLD,
    });

    // Newer remote version with a different event log.
    firestoreStore.matches['m1'] = {
      id: 'm1', userId: 'u1', updatedAt: T_NEW,
      scorecard_data: {
        id: 'm1', teamA: 'Remote XI', teamB: 'Rivals', status: 'ONGOING',
        createdAt: T_OLD, updatedAt: T_NEW, events: [evt('e_r1', 'm1', 1)],
      },
    };

    await pull();

    // Primary took the remote version; its table events converged.
    expect((await db.matches.get('m1'))?.teamA).toBe('Remote XI');
    const afterPull = await db.match_events.where('matchId').equals('m1').toArray();
    expect(afterPull.map((e) => e.eventId)).toEqual(['e_r1']);

    // The branch preserved BOTH the local scorecard and its log.
    const branches = (await db.matches.toArray()).filter((m) => m.syncStatus === 'CONFLICT');
    expect(branches).toHaveLength(1);
    const branch = branches[0] as any;
    expect(branch.teamA).toBe('Local XI (Local Conflict)');
    expect((branch.events as any[]).map((e) => e.eventId).sort()).toEqual(['e_l1', 'e_l2']);

    // Keep-local: scorecard AND its own log come back together.
    const ok = await SyncEngine.resolveConflict(branch.id, 'match', 'keep-local');
    expect(ok).toBe(true);

    const primary = (await db.matches.get('m1')) as any;
    expect(primary.teamA).toBe('Local XI');
    expect(primary.syncStatus).toBe('PENDING');
    // The embedded field is not persisted on the restored record.
    expect(primary.events).toBeUndefined();

    const restoredEvents = await db.match_events.where('matchId').equals('m1').sortBy('version');
    expect(restoredEvents.map((e) => e.eventId)).toEqual(['e_l1', 'e_l2']);

    const ops = (await db.sync_queue.toArray()).filter((o) => o.entityId === 'm1' && o.operationType === 'UPSERT_MATCH');
    expect(ops).toHaveLength(1);
    expect(ops[0].status).toBe('PENDING');
  });

  it('a pre-fix branch (no embedded events) resolves without wiping the current log', async () => {
    await db.matches.put({
      id: 'm2', teamA: 'Remote XI', teamB: 'Rivals', status: 'ONGOING',
      createdAt: T_OLD, updatedAt: T_NEW, syncStatus: 'SYNCED',
    } as any);
    await db.match_events.bulkPut([evt('e_r1', 'm2', 1)]);
    await db.matches.put({
      id: 'm2_local_conflict_1731000000000', teamA: 'Local XI (Local Conflict)', teamB: 'Rivals',
      status: 'ONGOING', createdAt: T_OLD, updatedAt: T_OLD, syncStatus: 'CONFLICT', isConflictBranch: true,
    } as any);

    const ok = await SyncEngine.resolveConflict('m2_local_conflict_1731000000000', 'match', 'keep-local');
    expect(ok).toBe(true);
    // Nothing to install → the guard leaves the table untouched.
    const events = await db.match_events.where('matchId').equals('m2').toArray();
    expect(events.map((e) => e.eventId)).toEqual(['e_r1']);
  });
});

// ─── D-4 / D-7 ───────────────────────────────────────────────
describe('D-4/D-7 — pulls never resurrect deliberately deleted records', () => {
  function stubLocalStorage() {
    const store = new Map<string, string>();
    const shim = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
    };
    vi.stubGlobal('localStorage', shim);
    return shim;
  }

  it('D-4: pre-clear cloud records are tombstoned, post-clear records restore', async () => {
    const ls = stubLocalStorage();
    ls.setItem('csp_db_cleared_at', String(Date.parse('2026-06-01T00:00:00.000Z')));

    firestoreStore.matches['m_old'] = {
      id: 'm_old', userId: 'u1', updatedAt: T_OLD,
      scorecard_data: { id: 'm_old', teamA: 'Old', teamB: 'B', createdAt: T_OLD, updatedAt: T_OLD },
    };
    firestoreStore.matches['m_new'] = {
      id: 'm_new', userId: 'u1', updatedAt: T_NEW,
      scorecard_data: { id: 'm_new', teamA: 'New', teamB: 'B', createdAt: T_NEW, updatedAt: T_NEW },
    };
    firestoreStore.teams['t_old'] = {
      id: 't_old', userId: 'u1', name: 'Old Team', captain: '', manager: '',
      players: [], createdAt: T_OLD, updatedAt: T_OLD,
    };

    await pull();

    expect(await db.matches.get('m_old')).toBeUndefined();
    expect(await db.teams.get('t_old')).toBeUndefined();
    expect((await db.matches.get('m_new'))?.teamA).toBe('New');

    const ops = await db.sync_queue.toArray();
    const tombstones = ops.filter((o) => o.operationType.startsWith('DELETE_'));
    expect(tombstones.map((o) => `${o.operationType}:${o.entityId}`).sort()).toEqual([
      'DELETE_MATCH:m_old',
      'DELETE_TEAM:t_old',
    ]);
    expect(tombstones.every((o) => o.status === 'PENDING')).toBe(true);

    // A second pull must not queue duplicate tombstones.
    await pull();
    const ops2 = (await db.sync_queue.toArray()).filter((o) => o.operationType.startsWith('DELETE_'));
    expect(ops2).toHaveLength(2);
  });

  it('D-7: a FAILED DELETE op blocks resurrection even without a clear marker', async () => {
    firestoreStore.matches['m_del'] = {
      id: 'm_del', userId: 'u1', updatedAt: T_NEW,
      scorecard_data: { id: 'm_del', teamA: 'Gone', teamB: 'B', createdAt: T_OLD, updatedAt: T_NEW },
    };
    await db.sync_queue.put({
      clientOpId: 'op_del_failed', operationType: 'DELETE_MATCH', entityId: 'm_del',
      payload: { id: 'm_del' }, status: 'FAILED', retryCount: 5, createdAt: T_OLD,
    });

    await pull();

    expect(await db.matches.get('m_del')).toBeUndefined();
    expect(await db.sync_queue.count()).toBe(1);
  });
});

// ─── D-2 / D-6 ───────────────────────────────────────────────
describe('D-2/D-6 — Supabase writes carry events and honest timestamps', () => {
  function captureSupabase() {
    const captured: Record<string, any> = {};
    vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue({
      from: (table: string) => ({
        upsert: vi.fn(async (row: any) => {
          captured[table] = row;
          return { error: null };
        }),
      }),
    } as any);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    return captured;
  }

  const supaSession = { provider: 'supabase' as const, uid: 'u1', token: 'tok' };

  it('D-2: UPSERT_MATCH embeds the Dexie event log into scorecard_data', async () => {
    const captured = captureSupabase();
    await db.match_events.bulkPut([evt('e_s1', 'm_supa', 1), evt('e_s2', 'm_supa', 2)]);

    await (SyncEngine as any).executeRemoteOperation(
      {
        clientOpId: 'op_supa_1', operationType: 'UPSERT_MATCH', entityId: 'm_supa',
        payload: {
          id: 'm_supa', teamA: 'A', teamB: 'B', status: 'ONGOING',
          createdAt: T_OLD, updatedAt: T_MID,
        },
        status: 'PENDING', retryCount: 0, createdAt: T_MID,
      },
      supaSession
    );

    const events = captured.matches?.scorecard_data?.events;
    expect(Array.isArray(events)).toBe(true);
    expect(events.map((e: any) => e.eventId)).toEqual(['e_s1', 'e_s2']);
  });

  it('D-6: UPSERT_TEAM sends the record updatedAt, not upload time', async () => {
    const captured = captureSupabase();

    await (SyncEngine as any).executeRemoteOperation(
      {
        clientOpId: 'op_team_1', operationType: 'UPSERT_TEAM', entityId: 't_supa',
        payload: {
          id: 't_supa', name: 'Stamp XI', captain: '', manager: '', players: [],
          createdAt: T_OLD, updatedAt: T_MID,
        },
        status: 'PENDING', retryCount: 0, createdAt: T_MID,
      },
      supaSession
    );

    expect(captured.teams?.updated_at).toBe(T_MID);
  });
});

// ─── D-3 / D-5 — restores ────────────────────────────────────
describe('D-3/D-5 — backup restores sync and converge', () => {
  it('D-3 (file): written records are stored PENDING and queued for sync', async () => {
    const backup = JSON.stringify({
      app: 'Cric Scorer Pro',
      version: '2.5.0',
      exportedAt: T_MID,
      matches: [{ id: 'fm1', teamA: 'A', teamB: 'B', updatedAt: T_OLD, syncStatus: 'SYNCED' }],
      matchEvents: [],
      teams: [{ id: 'ft1', name: 'File XI', players: [], updatedAt: T_OLD, syncStatus: 'SYNCED' }],
      tournaments: [{ id: 'ftr1', name: 'File Cup', teams: ['A', 'B'], fixtures: [], updatedAt: T_OLD }],
      grounds: [{ id: 'fg1', name: 'File Ground', updatedAt: T_OLD }],
    });

    const result = await StorageManagerService.importDatabase(backup, 'merge');
    expect(result.success).toBe(true);

    expect((await db.matches.get('fm1'))?.syncStatus).toBe('PENDING');
    expect((await db.teams.get('ft1'))?.syncStatus).toBe('PENDING');

    const ops = await db.sync_queue.toArray();
    const byType = new Map(ops.map((o) => [o.operationType, o.entityId]));
    expect(byType.get('UPSERT_MATCH')).toBe('fm1');
    expect(byType.get('UPSERT_TEAM')).toBe('ft1');
    expect(byType.get('UPSERT_TOURNAMENT')).toBe('ftr1');
    expect(byType.get('UPSERT_GROUND')).toBe('fg1');
    expect(ops.every((o) => o.status === 'PENDING')).toBe(true);
  });

  it('D-3 (Drive): a missing syncStatus no longer becomes SYNCED; restore queues UPSERTs', async () => {
    const summary = await GoogleDriveService.restoreToIndexedDb(
      {
        app: 'Cric Scorer Pro',
        schemaVersion: 3,
        matches: [{ id: 'dm1', teamA: 'A', teamB: 'B', updatedAt: T_OLD }],
        matchEvents: [],
        teams: [{ id: 'dt1', name: 'Drive XI', players: [], updatedAt: T_OLD }],
        tournaments: [],
        grounds: [],
      },
      { mode: 'merge' }
    );
    expect(summary.matchesCount).toBe(1);

    expect((await db.matches.get('dm1'))?.syncStatus).toBe('PENDING');
    expect((await db.teams.get('dt1'))?.syncStatus).toBe('PENDING');

    const ops = await db.sync_queue.toArray();
    expect(ops.map((o) => o.operationType).sort()).toEqual(['UPSERT_MATCH', 'UPSERT_TEAM']);
  });

  it('D-5 (Drive merge): events deleted since the backup do not resurrect', async () => {
    await db.matches.put({
      id: 'dm5', teamA: 'A', teamB: 'B', status: 'ONGOING',
      createdAt: T_OLD, updatedAt: T_OLD, syncStatus: 'SYNCED',
    } as any);
    await db.match_events.bulkPut([evt('e1', 'dm5', 1), evt('e2', 'dm5', 2), evt('e3-stale', 'dm5', 3)]);

    await GoogleDriveService.restoreToIndexedDb(
      {
        app: 'Cric Scorer Pro',
        schemaVersion: 3,
        matches: [{ id: 'dm5', teamA: 'A', teamB: 'B', status: 'ONGOING', createdAt: T_OLD, updatedAt: T_MID }],
        matchEvents: [evt('e1', 'dm5', 1), evt('e2', 'dm5', 2)],
        teams: [],
        tournaments: [],
        grounds: [],
      },
      { mode: 'merge' }
    );

    expect(await db.match_events.get('e3-stale')).toBeUndefined();
    expect(await db.match_events.get('e1')).toBeTruthy();
    expect(await db.match_events.get('e2')).toBeTruthy();
  });
});

// ─── D-11 ────────────────────────────────────────────────────
describe('D-11 — file import validates records, not just the envelope', () => {
  it('drops malformed records, restores valid ones, reports the dropped count', async () => {
    const backup = JSON.stringify({
      app: 'Cric Scorer Pro',
      version: '2.5.0',
      exportedAt: T_MID,
      matches: [
        { id: 'ok1', teamA: 'A', teamB: 'B', updatedAt: T_OLD },
        { id: 'bad1', teamA: 'A', updatedAt: T_OLD }, // no teamB
        { teamA: 'A', teamB: 'B', updatedAt: T_OLD }, // no id
      ],
      matchEvents: [],
      teams: [{ id: 'badteam', players: [], updatedAt: T_OLD }], // no name
      tournaments: [{ id: 'badtr', name: 'No Teams Cup', updatedAt: T_OLD }], // no teams array
      grounds: [{ id: 'okg', name: 'Good Ground', updatedAt: T_OLD }],
    });

    // Peek counts already reflect validation.
    const peek = StorageManagerService.peekBackupEnvelope(backup);
    expect(peek.ok).toBe(true);
    expect(peek.counts).toMatchObject({ matches: 1, teams: 0, tournaments: 0, grounds: 1 });

    const result = await StorageManagerService.importDatabase(backup, 'merge');
    expect(result.success).toBe(true);
    expect(result.dropped).toBe(4);
    expect(await db.matches.get('ok1')).toBeTruthy();
    expect(await db.matches.get('bad1')).toBeUndefined();
    expect(await db.teams.get('badteam')).toBeUndefined();
    expect(await db.tournaments.get('badtr')).toBeUndefined();
    expect(await db.grounds.get('okg')).toBeTruthy();
  });
});

// ─── D-10 ────────────────────────────────────────────────────
describe('D-10 — duplicate player ids on intake', () => {
  it('first entry keeps the id; later duplicates are re-minted', () => {
    const out = normalizeTeamPlayers([
      { id: 'pl_dup', name: 'Arif' },
      { id: 'pl_dup', name: 'Babul' },
      { id: 'pl_dup', name: 'Arif' }, // same object listed twice
      { id: 'pl_solo', name: 'Chanchal' },
    ]);
    expect(out.map((p) => p.name)).toEqual(['Arif', 'Babul', 'Arif', 'Chanchal']);
    expect(out[0].id).toBe('pl_dup');
    expect(out[1].id).not.toBe('pl_dup');
    expect(out[1].id.startsWith('pl_')).toBe(true);
    expect(out[2].id).not.toBe('pl_dup');
    expect(out[3].id).toBe('pl_solo');
    expect(new Set(out.map((p) => p.id)).size).toBe(4);
  });
});

// ─── D-8 / D-9 — source pins ─────────────────────────────────
describe('D-8/D-9 — migration default, rules caps, backup version set', () => {
  const repoRoot = path.resolve(__dirname, '../..');

  it('D-8: the Dexie v2 upgrade defaults missing match syncStatus to PENDING', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'src/infrastructure/database/dexie-db.ts'), 'utf8');
    expect(src).toContain("match.syncStatus = 'PENDING'");
    expect(src).not.toContain("match.syncStatus = 'SYNCED'");
  });

  it('D-9 (rules): tournament fixtures cap fits a 64-team double round-robin; grounds coords optional', () => {
    const rules = fs.readFileSync(path.join(repoRoot, 'firestore.rules'), 'utf8');
    expect(rules).toContain('data.fixtures.size() <= 5000');
    expect(rules).toContain("data.keys().hasAll(['id', 'userId', 'name', 'createdAt', 'updatedAt'])");
    expect(rules).toContain("(!('latitude' in data) || data.latitude == null");
    expect(rules).toContain("(!('longitude' in data) || data.longitude == null");
  });

  it('D-9 (profile): Clear Database stamps the tombstone marker before wiping', () => {
    const page = fs.readFileSync(path.join(repoRoot, 'src/app/profile/page.tsx'), 'utf8');
    const markerAt = page.indexOf("localStorage.setItem('csp_db_cleared_at'");
    const wipeAt = page.indexOf('await db.matches.clear()');
    expect(markerAt).toBeGreaterThan(-1);
    expect(wipeAt).toBeGreaterThan(markerAt);
  });

  it('D-9 (backup versions): the export stamp is in the accepted set (round-trip works)', async () => {
    await db.teams.put({
      id: 'vt1', name: 'Version XI', captain: '', manager: '', players: [],
      createdAt: T_OLD, updatedAt: T_OLD,
    });
    const { jsonString } = await StorageManagerService.exportDatabase();
    const parsed = JSON.parse(jsonString);
    expect(parsed.version).toBe('2.5.0');
    // Behavioural pin: whatever export stamps, import accepts.
    expect(StorageManagerService.peekBackupEnvelope(jsonString).ok).toBe(true);
    const result = await StorageManagerService.importDatabase(jsonString, 'merge');
    expect(result.success).toBe(true);
  });
});
