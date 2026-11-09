import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, SyncQueueRecord } from '../infrastructure/database/dexie-db';
import {
  SyncEngine,
  AuthenticatedSession,
  SyncStatusSnapshot,
  stripUndefinedForFirestore,
  MAX_SYNC_OP_ATTEMPTS,
} from '../infrastructure/sync/SyncEngine';

/**
 * F12-1 regression suite.
 *
 * Production evidence (TAIMUR's desktop console, 2026-11-09): a match
 * upsert failed Firestore's setDoc on EVERY attempt with
 * "Unsupported field value: undefined (found in field
 * scorecard_data.secondInnings ...)" and, because syncNow broke the
 * FIFO loop on the first failure, silently blocked ALL cloud sync
 * behind it. This suite reproduces that failure class against a
 * STRICT Firestore mock — one that validates payloads the way the
 * real SDK does — and pins both halves of the fix:
 *   A. undefined values are stripped at the write boundary, at
 *      execution time, so already-queued poisoned ops drain.
 *   B. an op that still fails permanently is parked as FAILED after
 *      MAX_SYNC_OP_ATTEMPTS and the queue moves on; retryFailed()
 *      revives it. Transient failures keep FIFO order.
 */

// In-memory Firestore + a set of "cursed" doc ids whose writes always
// fail with a permission error (a permanent, non-undefined failure).
const { firestoreStore, cursedDocIds } = vi.hoisted(() => ({
  firestoreStore: {} as Record<string, Record<string, any>>,
  cursedDocIds: new Set<string>(),
}));

function findUndefinedPath(value: any, path: string): string | null {
  if (value === undefined) return path;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findUndefinedPath(value[i], `${path}.${i}`);
      if (hit) return hit;
    }
    return null;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const hit = findUndefinedPath(v, path ? `${path}.${k}` : k);
      if (hit) return hit;
    }
  }
  return null;
}

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
      if (cursedDocIds.has(docRef.id)) {
        const err: any = new Error('Missing or insufficient permissions.');
        err.code = 'permission-denied';
        throw err;
      }
      const badPath = findUndefinedPath(data, '');
      if (badPath) {
        throw new Error(
          `Function setDoc() called with invalid data. Unsupported field value: undefined (found in field ${badPath} in document ${docRef.collection}/${docRef.id})`,
        );
      }
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
  };
});

const session: AuthenticatedSession = {
  provider: 'firebase',
  uid: 'user_f12',
  token: 'mock-token',
};

function opRecord(partial: Partial<SyncQueueRecord> & Pick<SyncQueueRecord, 'clientOpId' | 'operationType' | 'payload' | 'createdAt'>): SyncQueueRecord {
  return {
    entityId: undefined,
    status: 'PENDING',
    retryCount: 0,
    ...partial,
  };
}

const poisonedMatchPayload = {
  id: 'match_1794203887893_wqqx7',
  teamA: 'F12 Tigers',
  teamB: 'F12 Lions',
  tossWinner: 'F12 Tigers',
  tossDecision: 'BAT',
  totalOvers: 20,
  status: 'ONGOING',
  currentInnings: 1,
  targetScore: undefined,
  venue: 'F12 Ground',
  result: undefined,
  isPublic: true,
  firstInnings: { team: 'F12 Tigers', totalRuns: 64, wickets: 1 },
  secondInnings: undefined, // <- the F12-1 poison: innings not started yet
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:05:00.000Z',
};

const teamPayload = {
  id: 'team_f12_lions',
  name: 'F12 Lions',
  captain: undefined,
  manager: undefined,
  players: [{ id: 'pl_fahim', name: 'Fahim' }],
  createdAt: '2026-11-09T10:01:00.000Z',
  updatedAt: '2026-11-09T10:01:00.000Z',
};

describe('F12-1: undefined-poisoned sync queue', () => {
  beforeEach(async () => {
    SyncEngine.stop();
    for (const key of Object.keys(firestoreStore)) delete firestoreStore[key];
    cursedDocIds.clear();
    await db.sync_queue.clear();
    await db.matches.clear();
    await db.match_events.clear();
    await db.teams.clear();
    vi.spyOn(SyncEngine, 'getAuthenticatedSession').mockResolvedValue(session);
    vi.spyOn(SyncEngine, 'checkServerReachability').mockResolvedValue(true);
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    SyncEngine.stop();
    vi.unstubAllGlobals();
    // clearAllMocks, NOT restoreAllMocks: restoring would strip the
    // implementations of the module-mock vi.fn()s (checkFirebaseConfigured
    // would return undefined and the Firestore leg would silently skip).
    vi.clearAllMocks();
  });

  it('stripUndefinedForFirestore drops undefined keys, nulls undefined array items, keeps the rest', () => {
    const when = new Date('2026-11-09T00:00:00.000Z');
    const input = {
      keep: 1,
      drop: undefined,
      nested: { a: 'x', b: undefined, deep: { c: undefined, d: [1, undefined, { e: undefined, f: 2 }] } },
      when,
      nothing: null,
    };
    const out = stripUndefinedForFirestore(input) as any;
    expect(out).toEqual({
      keep: 1,
      nested: { a: 'x', deep: { d: [1, null, { f: 2 }] } },
      when,
      nothing: null,
    });
    expect(out.when).toBe(when); // non-plain values pass through untouched
    expect('drop' in out).toBe(false);
    expect(stripUndefinedForFirestore(42)).toBe(42);
    expect(stripUndefinedForFirestore('s')).toBe('s');
    expect(stripUndefinedForFirestore(undefined)).toBeUndefined();
  });

  it('A: a pre-fix queued match op with secondInnings undefined now drains', async () => {
    await db.sync_queue.put(
      opRecord({
        clientOpId: 'op_poisoned_match',
        operationType: 'UPSERT_MATCH',
        entityId: poisonedMatchPayload.id,
        payload: poisonedMatchPayload,
        createdAt: '2026-11-09T10:00:00.000Z',
      }),
    );

    await SyncEngine.syncNow();

    expect(await db.sync_queue.count()).toBe(0);
    const written = firestoreStore['matches']?.[poisonedMatchPayload.id];
    expect(written).toBeTruthy();
    expect(written.teamA).toBe('F12 Tigers');
    expect('secondInnings' in written.scorecard_data).toBe(false);
    expect(written.scorecard_data.firstInnings).toEqual({ team: 'F12 Tigers', totalRuns: 64, wickets: 1 });
  });

  it('B: a permanently failing op is parked FAILED and the queue behind it drains', async () => {
    cursedDocIds.add('match_cursed');
    await db.sync_queue.put(
      opRecord({
        clientOpId: 'op_cursed',
        operationType: 'UPSERT_MATCH',
        entityId: 'match_cursed',
        payload: { ...poisonedMatchPayload, id: 'match_cursed', secondInnings: { team: 'F12 Lions' } },
        retryCount: MAX_SYNC_OP_ATTEMPTS - 1,
        createdAt: '2026-11-09T10:00:00.000Z',
      }),
    );
    await db.sync_queue.put(
      opRecord({
        clientOpId: 'op_team_behind',
        operationType: 'UPSERT_TEAM',
        entityId: teamPayload.id,
        payload: teamPayload,
        createdAt: '2026-11-09T10:00:01.000Z',
      }),
    );

    await SyncEngine.syncNow();

    const cursed = await db.sync_queue.get('op_cursed');
    expect(cursed?.status).toBe('FAILED');
    expect(cursed?.retryCount).toBe(MAX_SYNC_OP_ATTEMPTS);
    expect(cursed?.errorMessage).toContain('insufficient permissions');
    // The op behind the poisoned one executed and left the queue.
    expect(await db.sync_queue.get('op_team_behind')).toBeUndefined();
    expect(firestoreStore['teams']?.[teamPayload.id]?.name).toBe('F12 Lions');

    // The failure is visible in the sync snapshot, not silent.
    const snapshot: SyncStatusSnapshot = await new Promise((resolve) => {
      const unsub = SyncEngine.subscribe((snap) => {
        if (snap.failedCount > 0) {
          unsub();
          resolve(snap);
        }
      });
    });
    expect(snapshot.failedCount).toBe(1);
    expect(snapshot.failedError).toContain('insufficient permissions');
    expect(snapshot.state).toBe('ERROR');
  });

  it('B: a transient failure keeps FIFO order (no skipping before the attempt budget ends)', async () => {
    cursedDocIds.add('match_cursed');
    await db.sync_queue.put(
      opRecord({
        clientOpId: 'op_cursed_fresh',
        operationType: 'UPSERT_MATCH',
        entityId: 'match_cursed',
        payload: { ...poisonedMatchPayload, id: 'match_cursed' },
        retryCount: 0,
        createdAt: '2026-11-09T10:00:00.000Z',
      }),
    );
    await db.sync_queue.put(
      opRecord({
        clientOpId: 'op_team_blocked',
        operationType: 'UPSERT_TEAM',
        entityId: teamPayload.id,
        payload: teamPayload,
        createdAt: '2026-11-09T10:00:01.000Z',
      }),
    );

    await SyncEngine.syncNow();

    const cursed = await db.sync_queue.get('op_cursed_fresh');
    expect(cursed?.status).toBe('PENDING');
    expect(cursed?.retryCount).toBe(1);
    // FIFO preserved: the team op was NOT executed out of order.
    expect(await db.sync_queue.get('op_team_blocked')).toBeTruthy();
    expect(firestoreStore['teams']?.[teamPayload.id]).toBeUndefined();
  });

  it('B: retryFailed revives a parked op and it drains once the failure clears', async () => {
    cursedDocIds.add('match_cursed');
    await db.sync_queue.put(
      opRecord({
        clientOpId: 'op_parked',
        operationType: 'UPSERT_MATCH',
        entityId: 'match_cursed',
        payload: { ...poisonedMatchPayload, id: 'match_cursed' },
        status: 'FAILED',
        retryCount: MAX_SYNC_OP_ATTEMPTS,
        errorMessage: 'Missing or insufficient permissions.',
        createdAt: '2026-11-09T10:00:00.000Z',
      }),
    );

    cursedDocIds.delete('match_cursed');
    await SyncEngine.retryFailed();

    await vi.waitFor(
      async () => {
        expect(await db.sync_queue.count()).toBe(0);
      },
      { timeout: 4000, interval: 50 },
    );
    expect(firestoreStore['matches']?.['match_cursed']).toBeTruthy();
  });
});
