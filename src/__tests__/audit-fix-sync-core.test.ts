import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, SyncQueueRecord } from '../infrastructure/database/dexie-db';
import {
  SyncEngine,
  AuthenticatedSession,
  SyncStatusSnapshot,
} from '../infrastructure/sync/SyncEngine';
import { MatchRepository } from '../infrastructure/storage/MatchRepository';

/**
 * Audit-fix suite — sync core partition (Phase 3 findings).
 *
 * Pins the fixes for P3-H1 (ops execute only under their
 * owner's session), P3-H2 (pull converges event deletions),
 * P3-H3 (conflict protection for teams/tournaments/grounds),
 * P3-M1 (Firestore team pull normalises players), P3-M3
 * (FAILED ops count as unsynced at pull), P3-M4 (queue-write
 * failures surface), P3-M6 (conflict branches are reused, not
 * re-minted), P3-L1 (dead preference pull removed), P3-L3
 * (Supabase match pull paginates), P3-L4 (Retry-After is
 * honoured), P3-L5 (reachability is probed, not assumed) and
 * P3-L6/L7 (coalescing preserves attempts/order; draft
 * tournaments are held, not burned).
 *
 * Firestore is an in-memory mock in the F12 suite's shape;
 * Supabase is a small in-memory row store behind a chainable
 * query-builder fake.
 */

const { firestoreStore, supaStore, authHolder } = vi.hoisted(() => ({
  firestoreStore: {} as Record<string, Record<string, any>>,
  supaStore: {
    matches: [] as any[],
    teams: [] as any[],
    tournaments: [] as any[],
  },
  authHolder: { currentUser: null as any },
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getFirestore: vi.fn().mockReturnValue({ isMockFirestore: true }),
    collection: vi.fn((_db: any, name: string) => ({ type: 'collection', name })),
    doc: vi.fn((_db: any, collection: string, id: string) => ({ type: 'doc', collection, id })),
    where: vi.fn((field: string, op: string, val: any) => ({ field, op, val })),
    query: vi.fn((colRef: any, ...filters: any[]) => ({ type: 'query', colRef, filters })),
    setDoc: vi.fn(async (docRef: any, data: any, options: any) => {
      const col = docRef.collection;
      if (!firestoreStore[col]) firestoreStore[col] = {};
      firestoreStore[col][docRef.id] =
        options?.merge && firestoreStore[col][docRef.id]
          ? { ...firestoreStore[col][docRef.id], ...data }
          : { ...data };
    }),
    getDoc: vi.fn(async (docRef: any) => {
      const data = firestoreStore[docRef.collection]?.[docRef.id];
      return { exists: () => !!data, data: () => data, id: docRef.id };
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
      const matched = filterField ? all.filter((d: any) => d[filterField!] === filterVal) : all;
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
    getFirebaseDb: vi.fn().mockReturnValue({ isMockDb: true }),
    checkFirebaseConfigured: vi.fn().mockReturnValue(true),
    isFirebaseConfigured: true,
    getFirebaseConfigDiagnostics: vi.fn().mockReturnValue({ isConfigured: true, missingVariables: [] }),
    auth: {
      get currentUser() {
        return authHolder.currentUser;
      },
    },
  };
});

function makeSupaQuery(table: string) {
  const state: {
    filters: [string, any][];
    range: [number, number] | null;
    limitN: number | null;
    mode: 'select' | 'delete';
  } = { filters: [], range: null, limitN: null, mode: 'select' };
  const q: any = {
    select: () => q,
    order: () => q,
    eq: (f: string, v: any) => {
      state.filters.push([f, v]);
      return q;
    },
    range: (a: number, b: number) => {
      state.range = [a, b];
      return q;
    },
    limit: (n: number) => {
      state.limitN = n;
      return q;
    },
    delete: () => {
      state.mode = 'delete';
      return q;
    },
    upsert: async (row: any) => {
      const rows = (supaStore as any)[table] as any[];
      const idx = rows.findIndex((r) => r.id === row.id);
      if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
      else rows.push({ ...row });
      return { error: null };
    },
    then: (resolve: any, reject: any) => {
      try {
        const all = (supaStore as any)[table] as any[];
        const matched = all.filter((r) => state.filters.every(([f, v]) => r[f] === v));
        if (state.mode === 'delete') {
          (supaStore as any)[table] = all.filter((r) => !matched.includes(r));
          return resolve({ data: null, error: null });
        }
        let rows = matched;
        if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1);
        if (state.limitN != null) rows = rows.slice(0, state.limitN);
        resolve({ data: rows, error: null });
      } catch (e) {
        reject(e);
      }
    },
  };
  return q;
}

vi.mock('../infrastructure/auth/supabase', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null } })),
      },
    },
    getSupabaseClient: vi.fn(() => ({
      from: (table: string) => makeSupaQuery(table),
    })),
    setSupabaseAuthToken: vi.fn(),
    checkSupabaseConfigured: vi.fn().mockReturnValue(true),
  };
});

const firebaseSession: AuthenticatedSession = { provider: 'firebase', uid: 'user_b', token: 'tok' };
const supabaseSession: AuthenticatedSession = { provider: 'supabase', uid: 'user_b', token: 'tok' };

function opRecord(
  partial: Partial<SyncQueueRecord> &
    Pick<SyncQueueRecord, 'clientOpId' | 'operationType' | 'payload' | 'createdAt'>
): SyncQueueRecord {
  return { entityId: undefined, status: 'PENDING', retryCount: 0, ...partial };
}

const T1 = '2026-11-09T10:00:00.000Z';
const T2 = '2026-11-09T11:00:00.000Z';
const T3 = '2026-11-09T12:00:00.000Z';

function teamPayload(id: string, name: string) {
  return {
    id,
    name,
    captain: '',
    manager: '',
    players: [{ id: 'pl_fahim', name: 'Fahim' }],
    createdAt: T1,
    updatedAt: T1,
  };
}

describe('audit-fix sync core', () => {
  beforeEach(async () => {
    SyncEngine.stop();
    for (const key of Object.keys(firestoreStore)) delete firestoreStore[key];
    supaStore.matches = [];
    supaStore.teams = [];
    supaStore.tournaments = [];
    await db.sync_queue.clear();
    await db.matches.clear();
    await db.match_events.clear();
    await db.teams.clear();
    await db.tournaments.clear();
    await db.grounds.clear();
    await db.app_metadata.clear();
    authHolder.currentUser = { uid: 'user_b', getIdToken: async () => 'tok' };
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.spyOn(SyncEngine, 'getAuthenticatedSession').mockResolvedValue(firebaseSession);
    vi.spyOn(SyncEngine, 'checkServerReachability').mockResolvedValue(true);
  });

  afterEach(() => {
    SyncEngine.stop();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    // clearAllMocks, NOT restoreAllMocks (see the F12 suite:
    // restoring would strip the module-mock implementations).
    vi.clearAllMocks();
  });

  // ── P3-H1 ──────────────────────────────────────────────────
  describe('P3-H1: ops execute only under their owner', () => {
    it('holds another user\'s op while own and guest ops drain', async () => {
      await db.sync_queue.put(
        opRecord({
          clientOpId: 'op_alice',
          operationType: 'UPSERT_TEAM',
          entityId: 'team_alice',
          payload: teamPayload('team_alice', 'Alice XI'),
          userId: 'user_a',
          createdAt: T1,
        })
      );
      await db.sync_queue.put(
        opRecord({
          clientOpId: 'op_bob',
          operationType: 'UPSERT_TEAM',
          entityId: 'team_bob',
          payload: teamPayload('team_bob', 'Bob XI'),
          userId: 'user_b',
          createdAt: '2026-11-09T10:00:01.000Z',
        })
      );
      await db.sync_queue.put(
        opRecord({
          clientOpId: 'op_guest',
          operationType: 'UPSERT_TEAM',
          entityId: 'team_guest',
          payload: teamPayload('team_guest', 'Guest XI'),
          userId: null,
          createdAt: '2026-11-09T10:00:02.000Z',
        })
      );

      await SyncEngine.syncNow();

      // Alice's op was NOT executed under Bob's session.
      const held = await db.sync_queue.get('op_alice');
      expect(held?.status).toBe('PENDING');
      expect(held?.retryCount).toBe(0);
      expect(firestoreStore['teams']?.['team_alice']).toBeUndefined();
      // Bob's and the guest op drained.
      expect(await db.sync_queue.get('op_bob')).toBeUndefined();
      expect(await db.sync_queue.get('op_guest')).toBeUndefined();
      expect(firestoreStore['teams']?.['team_bob']?.name).toBe('Bob XI');
      expect(firestoreStore['teams']?.['team_guest']?.name).toBe('Guest XI');

      // The hold is visible in the snapshot, counted separately.
      let latest: SyncStatusSnapshot | null = null;
      const unsub = SyncEngine.subscribe((snap) => {
        latest = snap;
      });
      await vi.waitFor(() => expect(latest?.heldCount).toBe(1));
      unsub();
    });

    it('a held op drains once its owner signs in', async () => {
      await db.sync_queue.put(
        opRecord({
          clientOpId: 'op_alice2',
          operationType: 'UPSERT_TEAM',
          entityId: 'team_alice2',
          payload: teamPayload('team_alice2', 'Alice Returns'),
          userId: 'user_a',
          createdAt: T1,
        })
      );

      await SyncEngine.syncNow(); // as user_b: held
      expect(await db.sync_queue.get('op_alice2')).toBeTruthy();

      authHolder.currentUser = { uid: 'user_a', getIdToken: async () => 'tok' };
      vi.spyOn(SyncEngine, 'getAuthenticatedSession').mockResolvedValue({
        provider: 'firebase',
        uid: 'user_a',
        token: 'tok',
      });
      await SyncEngine.syncNow(); // as user_a: drains

      expect(await db.sync_queue.get('op_alice2')).toBeUndefined();
      expect(firestoreStore['teams']?.['team_alice2']?.userId).toBe('user_a');
    });
  });

  // ── P3-H2 ──────────────────────────────────────────────────
  describe('P3-H2: pull converges event deletions', () => {
    const evt = (eventId: string, version: number) => ({
      eventId,
      matchId: 'm_h2',
      version,
      type: 'BALL_SCORED',
      timestamp: T1,
    });

    async function seedLocalMatch() {
      await db.matches.put({
        id: 'm_h2',
        teamA: 'A',
        teamB: 'B',
        status: 'ONGOING',
        createdAt: T1,
        updatedAt: T1,
        syncStatus: 'SYNCED',
      } as any);
      await db.match_events.bulkPut([evt('e1', 1), evt('e2', 2), evt('e3', 3)] as any);
    }

    it('Firestore: events deleted remotely are deleted locally', async () => {
      await seedLocalMatch();
      firestoreStore['matches'] = {
        m_h2: {
          id: 'm_h2',
          userId: 'user_b',
          updatedAt: T2,
          scorecard_data: {
            id: 'm_h2',
            teamA: 'A',
            teamB: 'B',
            status: 'ONGOING',
            createdAt: T1,
            updatedAt: T2,
            events: [evt('e1', 1), evt('e2', 2)], // e3 deleted on another device
          },
        },
      };

      await SyncEngine.syncNow();

      const remaining = await db.match_events.where('matchId').equals('m_h2').toArray();
      expect(remaining.map((e: any) => e.eventId).sort()).toEqual(['e1', 'e2']);
    });

    it('Firestore: a remote scorecard with NO events list never wipes local events', async () => {
      await seedLocalMatch();
      firestoreStore['matches'] = {
        m_h2: {
          id: 'm_h2',
          userId: 'user_b',
          updatedAt: T2,
          scorecard_data: {
            id: 'm_h2',
            teamA: 'A',
            teamB: 'B',
            status: 'ONGOING',
            createdAt: T1,
            updatedAt: T2,
            // no events key at all
          },
        },
      };

      await SyncEngine.syncNow();

      const remaining = await db.match_events.where('matchId').equals('m_h2').toArray();
      expect(remaining).toHaveLength(3);
    });

    it('Supabase: events deleted remotely are deleted locally', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
      vi.spyOn(SyncEngine, 'getAuthenticatedSession').mockResolvedValue(supabaseSession);
      await db.matches.put({
        id: 'm_h2s',
        teamA: 'A',
        teamB: 'B',
        status: 'ONGOING',
        createdAt: T1,
        updatedAt: T1,
        syncStatus: 'SYNCED',
      } as any);
      const sevt = (eventId: string, version: number) => ({ ...evt(eventId, version), matchId: 'm_h2s' });
      await db.match_events.bulkPut([sevt('e1', 1), sevt('e2', 2), sevt('e3', 3)] as any);
      supaStore.matches = [
        {
          id: 'm_h2s',
          user_id: 'user_b',
          updated_at: T2,
          scorecard_data: {
            id: 'm_h2s',
            teamA: 'A',
            teamB: 'B',
            status: 'ONGOING',
            createdAt: T1,
            updatedAt: T2,
            events: [sevt('e1', 1), sevt('e2', 2)],
          },
        },
      ];

      await SyncEngine.syncNow();

      const remaining = await db.match_events.where('matchId').equals('m_h2s').toArray();
      expect(remaining.map((e: any) => e.eventId).sort()).toEqual(['e1', 'e2']);
    });
  });

  // ── P3-M3 + P3-M6 ──────────────────────────────────────────
  describe('P3-M3/M6: FAILED ops trigger branching; branches are reused', () => {
    it('a FAILED op makes the pull branch (not silently overwrite), once', async () => {
      await db.matches.put({
        id: 'm_m3',
        teamA: 'Local A',
        teamB: 'B',
        status: 'ONGOING',
        createdAt: T1,
        updatedAt: T1,
        syncStatus: 'SYNCED',
      } as any);
      await db.sync_queue.put(
        opRecord({
          clientOpId: 'op_failed_m3',
          operationType: 'UPSERT_MATCH',
          entityId: 'm_m3',
          payload: { id: 'm_m3' },
          status: 'FAILED',
          retryCount: 5,
          errorMessage: 'boom',
          createdAt: T1,
        })
      );
      firestoreStore['matches'] = {
        m_m3: {
          id: 'm_m3',
          userId: 'user_b',
          updatedAt: T2,
          scorecard_data: {
            id: 'm_m3',
            teamA: 'Remote A',
            teamB: 'B',
            status: 'ONGOING',
            createdAt: T1,
            updatedAt: T2,
          },
        },
      };

      await SyncEngine.syncNow();

      // Primary took the remote; local preserved as a branch.
      expect((await db.matches.get('m_m3'))?.teamA).toBe('Remote A');
      let branches = await db.matches.where('id').startsWith('m_m3_local_conflict_').toArray();
      expect(branches).toHaveLength(1);
      expect(branches[0].teamA).toContain('(Local Conflict)');

      // A second, newer remote pull reuses the same branch.
      firestoreStore['matches']['m_m3'].updatedAt = T3;
      firestoreStore['matches']['m_m3'].scorecard_data.updatedAt = T3;
      firestoreStore['matches']['m_m3'].scorecard_data.teamA = 'Remote A v2';
      await SyncEngine.syncNow();

      branches = await db.matches.where('id').startsWith('m_m3_local_conflict_').toArray();
      expect(branches).toHaveLength(1);
      expect((await db.matches.get('m_m3'))?.teamA).toBe('Remote A v2');
    });
  });

  // ── P3-H3 + P3-M1 ──────────────────────────────────────────
  describe('P3-H3/M1: team pull protection and normalisation', () => {
    it('Firestore: unsynced local team is branched; remote players normalised with local ids', async () => {
      await db.teams.put({
        id: 't_h3',
        name: 'Local Name',
        captain: '',
        manager: '',
        players: [
          { id: 'pl_arif', name: 'Arif' },
          { id: 'pl_babul', name: 'Babul' },
        ],
        createdAt: T1,
        updatedAt: T1,
        syncStatus: 'PENDING',
      });
      firestoreStore['teams'] = {
        t_h3: {
          id: 't_h3',
          userId: 'user_b',
          name: 'Remote Name',
          captain: '',
          manager: '',
          players: ['Arif', 'Babul'], // legacy string players
          createdAt: T1,
          updatedAt: T2,
        },
      };

      await SyncEngine.syncNow();

      const primary = await db.teams.get('t_h3');
      expect(primary?.name).toBe('Remote Name');
      // M1: players are TeamPlayer objects, ids preserved by name.
      expect(primary?.players).toEqual([
        { id: 'pl_arif', name: 'Arif' },
        { id: 'pl_babul', name: 'Babul' },
      ]);
      // H3: the unsynced local copy survived as a branch.
      const branches = await db.teams.where('id').startsWith('t_h3_local_conflict_').toArray();
      expect(branches).toHaveLength(1);
      expect(branches[0].name).toBe('Local Name (Local Conflict)');
      expect(branches[0].syncStatus).toBe('CONFLICT');

      // M6: a second conflict reuses the branch instead of minting another.
      await db.teams.update('t_h3', { syncStatus: 'PENDING' });
      firestoreStore['teams']['t_h3'].updatedAt = T3;
      firestoreStore['teams']['t_h3'].name = 'Remote Name v2';
      await SyncEngine.syncNow();
      const branches2 = await db.teams.where('id').startsWith('t_h3_local_conflict_').toArray();
      expect(branches2).toHaveLength(1);
      expect((await db.teams.get('t_h3'))?.name).toBe('Remote Name v2');
    });

    it('Supabase: unsynced local team is branched before the remote is taken', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
      vi.spyOn(SyncEngine, 'getAuthenticatedSession').mockResolvedValue(supabaseSession);
      await db.teams.put({
        id: 't_h3s',
        name: 'Local S',
        captain: '',
        manager: '',
        players: [{ id: 'pl_sam', name: 'Sam' }],
        createdAt: T1,
        updatedAt: T1,
        syncStatus: 'PENDING',
      });
      supaStore.teams = [
        {
          id: 't_h3s',
          user_id: 'user_b',
          name: 'Remote S',
          captain: '',
          manager: '',
          players: [{ id: 'pl_sam', name: 'Sam' }],
          created_at: T1,
          updated_at: T2,
        },
      ];

      await SyncEngine.syncNow();

      expect((await db.teams.get('t_h3s'))?.name).toBe('Remote S');
      const branches = await db.teams.where('id').startsWith('t_h3s_local_conflict_').toArray();
      expect(branches).toHaveLength(1);
      expect(branches[0].name).toBe('Local S (Local Conflict)');
    });

    it('Firestore: a clean (synced) local team is overwritten without a branch', async () => {
      await db.teams.put({
        id: 't_clean',
        name: 'Old',
        captain: '',
        manager: '',
        players: [],
        createdAt: T1,
        updatedAt: T1,
        syncStatus: 'SYNCED',
      });
      firestoreStore['teams'] = {
        t_clean: {
          id: 't_clean',
          userId: 'user_b',
          name: 'New',
          captain: '',
          manager: '',
          players: [],
          createdAt: T1,
          updatedAt: T2,
        },
      };

      await SyncEngine.syncNow();

      expect((await db.teams.get('t_clean'))?.name).toBe('New');
      const branches = await db.teams.where('id').startsWith('t_clean_local_conflict_').toArray();
      expect(branches).toHaveLength(0);
    });
  });

  // ── P3-L1 ──────────────────────────────────────────────────
  describe('P3-L1: remote preference fields are never applied locally', () => {
    it('a users doc carrying theme/language/lastActiveMatchId changes nothing local', async () => {
      firestoreStore['users'] = {
        user_b: {
          theme: 'dark',
          language: 'bn',
          lastActiveMatchId: 'm_stale',
          updatedAt: T2,
        },
      };

      await SyncEngine.syncNow();

      expect(await db.app_metadata.get('last_active_match_id')).toBeUndefined();
      expect(await db.app_metadata.get('preferred_theme')).toBeUndefined();
      expect(await db.app_metadata.get('preferred_language')).toBeUndefined();
    });
  });

  // ── P3-L3 ──────────────────────────────────────────────────
  describe('P3-L3: Supabase match pull paginates past 50', () => {
    it('pulls all 250 remote matches, not just the first page', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
      vi.spyOn(SyncEngine, 'getAuthenticatedSession').mockResolvedValue(supabaseSession);
      supaStore.matches = Array.from({ length: 250 }, (_, i) => ({
        id: `sm_${i}`,
        user_id: 'user_b',
        updated_at: T1,
        scorecard_data: {
          id: `sm_${i}`,
          teamA: 'A',
          teamB: 'B',
          status: 'COMPLETED',
          createdAt: T1,
          updatedAt: T1,
        },
      }));

      await SyncEngine.syncNow();

      expect(await db.matches.count()).toBe(250);
    });
  });

  // ── P3-L6 ──────────────────────────────────────────────────
  describe('P3-L6: coalescing preserves retryCount and createdAt', () => {
    it('editing a failing op keeps its attempt count and queue position', async () => {
      await SyncEngine.queueMutation('UPSERT_MATCH', { id: 'm_l6', score: 1 }, 'm_l6');
      const [op] = await db.sync_queue.toArray();
      await db.sync_queue.update(op.clientOpId, { retryCount: 3 });

      await SyncEngine.queueMutation('UPSERT_MATCH', { id: 'm_l6', score: 2 }, 'm_l6');

      const ops = await db.sync_queue.toArray();
      expect(ops).toHaveLength(1);
      expect(ops[0].retryCount).toBe(3);
      expect(ops[0].createdAt).toBe(op.createdAt);
      expect((ops[0].payload as any).score).toBe(2);
    });
  });

  // ── P3-L7 ──────────────────────────────────────────────────
  describe('P3-L7: draft tournaments are held, not burned', () => {
    it('a <2-team tournament op stays PENDING with attempts untouched and does not block the queue', async () => {
      await db.sync_queue.put(
        opRecord({
          clientOpId: 'op_draft_tourney',
          operationType: 'UPSERT_TOURNAMENT',
          entityId: 't_draft',
          payload: { id: 't_draft', name: 'Draft', teams: ['only-one'], fixtures: [] },
          createdAt: T1,
        })
      );
      await db.sync_queue.put(
        opRecord({
          clientOpId: 'op_team_after',
          operationType: 'UPSERT_TEAM',
          entityId: 'team_after',
          payload: teamPayload('team_after', 'After XI'),
          createdAt: '2026-11-09T10:00:01.000Z',
        })
      );

      await SyncEngine.syncNow();

      const held = await db.sync_queue.get('op_draft_tourney');
      expect(held?.status).toBe('PENDING');
      expect(held?.retryCount).toBe(0);
      expect(firestoreStore['tournaments']?.['t_draft']).toBeUndefined();
      expect(await db.sync_queue.get('op_team_after')).toBeUndefined();
    });
  });

  // ── P3-L4 ──────────────────────────────────────────────────
  describe('P3-L4: Retry-After is honoured by scheduleRetry', () => {
    it('uses the server-provided delay exactly once, then falls back to backoff', () => {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      (SyncEngine as any).pendingRetryAfterMs = 7000;
      (SyncEngine as any).scheduleRetry();
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 7000);
      expect((SyncEngine as any).pendingRetryAfterMs).toBeNull();

      SyncEngine.stop();
      setTimeoutSpy.mockClear();
      (SyncEngine as any).scheduleRetry();
      const delay = setTimeoutSpy.mock.calls[0][1] as number;
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThan(3000);
      SyncEngine.stop();
    });
  });

  // ── P3-L5 ──────────────────────────────────────────────────
  describe('P3-L5: Firebase reachability is probed, not assumed', () => {
    beforeEach(() => {
      // Supabase unconfigured, Firebase configured (module mock),
      // so reachability rests entirely on the Firestore probe.
      vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'proj_x');
      vi.spyOn(SyncEngine, 'checkServerReachability').mockRestore();
    });

    it('an HTTP response (even 401) means the service answered', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
      await expect(SyncEngine.checkServerReachability()).resolves.toBe(true);
    });

    it('a transport failure means unreachable (configuration alone is not enough)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new TypeError('Failed to fetch');
        })
      );
      await expect(SyncEngine.checkServerReachability()).resolves.toBe(false);
    });

    it('a 5xx means unreachable', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
      await expect(SyncEngine.checkServerReachability()).resolves.toBe(false);
    });

    it('probe results are cached briefly', async () => {
      const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      await SyncEngine.checkServerReachability();
      await SyncEngine.checkServerReachability();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain(
        'firestore.googleapis.com/v1/projects/proj_x'
      );
    });
  });

  // ── P3-M4 ──────────────────────────────────────────────────
  describe('P3-M4: queue-write failures surface', () => {
    it('queueMutation reports success as true', async () => {
      await expect(
        SyncEngine.queueMutation('UPSERT_TEAM', teamPayload('t_ok', 'OK XI'), 't_ok')
      ).resolves.toBe(true);
      expect(await db.sync_queue.count()).toBe(1);
    });

    it('a failed queue write returns false and the repository records it durably', async () => {
      const putSpy = vi
        .spyOn(db.sync_queue, 'put')
        .mockRejectedValue(new Error('QuotaExceededError'));
      try {
        await expect(
          SyncEngine.queueMutation('UPSERT_TEAM', teamPayload('t_q', 'Q XI'), 't_q')
        ).resolves.toBe(false);

        await MatchRepository.saveMatch({
          id: 'm_m4',
          teamA: 'A',
          teamB: 'B',
          status: 'COMPLETED',
          createdAt: T1,
        } as any);

        const record = await db.app_metadata.get('sync_queue_error');
        expect(record?.value?.entityId).toBe('m_m4');
        expect(record?.value?.operationType).toBe('UPSERT_MATCH');
        expect(record?.value?.error).toContain('QuotaExceededError');
        // The match itself is saved locally, visibly PENDING.
        expect((await db.matches.get('m_m4'))?.syncStatus).toBe('PENDING');
      } finally {
        putSpy.mockRestore();
      }
    });
  });
});
