import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../infrastructure/database/dexie-db';
import { SyncEngine, AuthenticatedSession } from '../infrastructure/sync/SyncEngine';

/**
 * Correctness audit finding 1 (2026-11-11) — sync outbox lost update.
 *
 * syncNow() snapshots the PENDING ops once, then executes them
 * one by one. While the UPSERT_MATCH for a live match awaits
 * its Firestore setDoc, the next ball is scored: queueMutation
 * COALESCES the newer scorecard into the same PENDING row. The
 * in-flight execution uploads the stale snapshot it captured,
 * then (pre-fix) unconditionally deleted the row — destroying
 * the newer, never-uploaded payload — and stamped the local
 * record SYNCED, hiding the loss forever.
 *
 * The fix: capture a payload signature before executing,
 * re-read the row after, and only delete/stamp when the row
 * still holds exactly what was uploaded.
 *
 * This suite drives the exact race with a gated setDoc: the
 * upload is held open, the coalesce lands mid-flight, and only
 * then is the upload released.
 */

const { firestoreStore, flight } = vi.hoisted(() => ({
  firestoreStore: {} as Record<string, Record<string, any>>,
  flight: {
    armed: false,
    entered: null as null | (() => void),
    gate: null as null | Promise<void>,
  },
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
      if (flight.armed && docRef.collection === 'matches') {
        flight.armed = false;
        const entered = flight.entered;
        flight.entered = null;
        entered?.();
        await flight.gate;
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
  uid: 'user_race',
  token: 'mock-token',
};

const MATCH_ID = 'match_race_1';
const T0 = '2026-11-11T10:00:00.000Z';
const T1 = '2026-11-11T10:01:00.000Z';
const T2 = '2026-11-11T10:02:00.000Z';

const matchPayloadV1 = {
  id: MATCH_ID,
  teamA: 'Race Tigers',
  teamB: 'Race Lions',
  tossWinner: 'Race Tigers',
  tossDecision: 'Batting',
  totalOvers: 20,
  status: 'ONGOING',
  currentInnings: 1,
  targetScore: 0,
  venue: 'Race Ground',
  isPublic: true,
  totalRuns: 20,
  createdAt: T0,
  updatedAt: T1,
};

const matchPayloadV2 = { ...matchPayloadV1, totalRuns: 25, updatedAt: T2 };

describe('finding 1: in-flight coalesce must not lose the newer payload', () => {
  beforeEach(async () => {
    SyncEngine.stop();
    for (const key of Object.keys(firestoreStore)) delete firestoreStore[key];
    flight.armed = false;
    flight.entered = null;
    flight.gate = null;
    await db.sync_queue.clear();
    await db.matches.clear();
    await db.match_events.clear();
    vi.spyOn(SyncEngine, 'getAuthenticatedSession').mockResolvedValue(session);
    vi.spyOn(SyncEngine, 'checkServerReachability').mockResolvedValue(true);
    // Neutralise the debounce so queued mutations never start a
    // background syncNow behind the test's back.
    vi.spyOn(SyncEngine, 'scheduleSync').mockImplementation(() => {});
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    SyncEngine.stop();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('op survives PENDING with the newer payload and the record is not stamped SYNCED', async () => {
    // Local record at v1, queued for upload.
    await db.matches.put({ ...matchPayloadV1, syncStatus: 'PENDING' } as any);
    await SyncEngine.queueMutation('UPSERT_MATCH', matchPayloadV1, MATCH_ID);
    const queued = await db.sync_queue.where('entityId').equals(MATCH_ID).first();
    expect(queued?.status).toBe('PENDING');

    // Arm the gate: the next match setDoc blocks until released.
    let releaseGate!: () => void;
    flight.gate = new Promise<void>((res) => {
      releaseGate = res;
    });
    const entered = new Promise<void>((res) => {
      flight.entered = res;
    });
    flight.armed = true;

    const syncRun = SyncEngine.syncNow();
    await entered; // the v1 upload is now in flight

    // The user scores the next ball mid-flight: the repository
    // saves the newer record and queueMutation coalesces it
    // into the SAME pending op row.
    await db.matches.put({ ...matchPayloadV2, syncStatus: 'PENDING' } as any);
    await SyncEngine.queueMutation('UPSERT_MATCH', matchPayloadV2, MATCH_ID);

    releaseGate();
    await syncRun;

    // The stale v1 snapshot WAS uploaded (the fix cannot unring
    // that bell) — but it must not be acknowledged as the
    // record's final state.
    expect(firestoreStore['matches']?.[MATCH_ID]?.scorecard_data?.totalRuns).toBe(20);

    // The op row survives, still PENDING, carrying v2.
    const surviving = await db.sync_queue.get(queued!.clientOpId);
    expect(surviving).toBeDefined();
    expect(surviving?.status).toBe('PENDING');
    expect((surviving?.payload as any)?.totalRuns).toBe(25);
    expect((surviving?.payload as any)?.updatedAt).toBe(T2);

    // The local record was NOT falsely stamped SYNCED.
    const local = await db.matches.get(MATCH_ID);
    expect(local?.syncStatus).toBe('PENDING');

    // The next run drains v2 for real: op deleted, record
    // stamped, cloud caught up.
    await SyncEngine.syncNow();
    expect(await db.sync_queue.get(queued!.clientOpId)).toBeUndefined();
    expect((await db.matches.get(MATCH_ID))?.syncStatus).toBe('SYNCED');
    expect(firestoreStore['matches']?.[MATCH_ID]?.scorecard_data?.totalRuns).toBe(25);
  });

  it('control: an undisturbed op still deletes and stamps in a single run', async () => {
    await db.matches.put({ ...matchPayloadV1, syncStatus: 'PENDING' } as any);
    await SyncEngine.queueMutation('UPSERT_MATCH', matchPayloadV1, MATCH_ID);

    await SyncEngine.syncNow();

    expect(await db.sync_queue.where('entityId').equals(MATCH_ID).count()).toBe(0);
    expect((await db.matches.get(MATCH_ID))?.syncStatus).toBe('SYNCED');
    expect(firestoreStore['matches']?.[MATCH_ID]?.scorecard_data?.totalRuns).toBe(20);
  });
});
