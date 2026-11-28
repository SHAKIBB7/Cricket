/**
 * Bug hunt 2026-11-26 — regression pins for the fix programme.
 *
 *  - C-H1: BALL_SCORED payloads name the batter who FACED the ball
 *    (and, on a wicket, the dismissed batter), not the post-ball
 *    striker.
 *  - C-M6: 'Retired Hurt' routed into scoreBall as a wicket is
 *    converted to a retirement — never a dismissal — and replays
 *    identically from the event log.
 *  - C-M5: fromScorecard / fromEvents preserve the match's
 *    original createdAt.
 *  - C-M4: editHistoricalBall heals the stored log's derived
 *    payload fields from the replay.
 *  - C-M7: DLS charges an all-out first innings zero remaining
 *    resource (10 wickets), not the 9-wicket figure.
 *  - C-L4: tournament leaderboard dismissal matching is id-first;
 *    a same-named teammate is not marked dismissed.
 *  - D-H2: LivePublishService retries failures with bounded
 *    exponential backoff and parks — never a 0 ms spin.
 *  - D-H3: a failed unpublish delete is queued persistently and
 *    retried on later activity.
 *  - D-M5: the sync outbox never coalesces a save across a queued
 *    DELETE for the same record.
 *  - D-M7: the Clear Database tombstone expires (1 year), so
 *    other devices' older records eventually restore again.
 *  - D-M4/D-M9/D-L4: replace file-restore clears sync_queue;
 *    malformed matchEvents are dropped at parse; conflict-branch
 *    records are not imported as standalone matches.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../infrastructure/database/dexie-db';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { DlsEngine } from '../domain/cricket/dls/DlsEngine';
import { NetRunRateEngine } from '../domain/tournament/NetRunRateEngine';
import { SyncEngine } from '../infrastructure/sync/SyncEngine';
import { StorageManagerService } from '../infrastructure/storage/StorageManagerService';
import { buildLiveSnapshot } from '../domain/live/buildLiveSnapshot';
import type { DomainEvent, MatchScorecard } from '../domain/cricket/types';

// ── In-memory Firestore (pattern from bughunt-data-fixes) ──
const { firestoreStore } = vi.hoisted(() => ({
  firestoreStore: {
    matches: {},
    teams: {},
    tournaments: {},
    grounds: {},
    users: {},
  } as Record<string, Record<string, any>>,
}));

const authHolder = vi.hoisted(() => ({ currentUser: null as { uid: string } | null }));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getFirestore: vi.fn().mockReturnValue({ isMockFirestore: true }),
    collection: vi.fn((_db: any, name: string) => ({ type: 'collection', name })),
    doc: vi.fn((_db: any, collectionName: string, id: string) => ({
      type: 'doc',
      collection: collectionName,
      id,
    })),
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
const T_NEW = '2026-11-01T10:00:00.000Z';
const SESSION = { provider: 'firebase' as const, uid: 'u1', token: 'tok' };

function stubLocalStorage() {
  const store = new Map<string, string>();
  const shim = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal('localStorage', shim);
  return shim;
}

beforeEach(async () => {
  for (const k of Object.keys(firestoreStore)) firestoreStore[k] = {};
  authHolder.currentUser = null;
  await db.matches.clear();
  await db.match_events.clear();
  await db.teams.clear();
  await db.tournaments.clear();
  await db.grounds.clear();
  await db.sync_queue.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Engine: C-H1 / C-M6 / C-M5 / C-M4 ───────────────────────
function makeEngine() {
  return new EventSourcedMatchEngine({
    teamA: 'Alpha',
    teamB: 'Beta',
    tossWinner: 'Alpha',
    tossDecision: 'Batting',
    totalOvers: 20,
    strikerName: 'Opener One',
    nonStrikerName: 'Opener Two',
    bowlerName: 'Bowler One',
  });
}

describe('C-H1 — ball events name the batter who faced the ball', () => {
  it('a single that swaps strike is still attributed to the facer', () => {
    const engine = makeEngine();
    engine.scoreBall({ runsScored: 1 });
    const ev = engine.events.filter((e) => e.type === 'BALL_SCORED').at(-1)!;
    expect(ev.payload.striker).toBe('Opener One');
    // Post-ball, strike has swapped — the payload must not follow it.
    expect(engine.currentInnings.players[engine.currentInnings.strikerIdx].name).toContain('Opener Two');
  });

  it('a wicket ball names the dismissed batter as striker and dismissedBatter', () => {
    const engine = makeEngine();
    engine.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled' });
    const ev = engine.events.filter((e) => e.type === 'BALL_SCORED').at(-1)!;
    expect(ev.payload.striker).toBe('Opener One');
    expect(ev.payload.dismissedBatter).toBe('Opener One');
  });
});

describe('C-M6 — Retired Hurt via scoreBall is a retirement, not a dismissal', () => {
  it('wicket count and dismissal flags are untouched; the batter can be the one replaced', () => {
    const engine = makeEngine();
    engine.scoreBall({ runsScored: 1, isWicket: true, dismissalType: 'Retired Hurt' });
    const inn = engine.currentInnings;
    expect(inn.totalWickets).toBe(0);
    expect(inn.totalRuns).toBe(1);
    const retired = inn.players.find((p) => p.name.includes('Opener One'))!;
    expect(retired.isDismissed).toBe(false);
    expect(retired.dismissalType).toBe('Retire Hurt');
  });

  it('replays identically from the event log', () => {
    const engine = makeEngine();
    engine.scoreBall({ runsScored: 1, isWicket: true, dismissalType: 'Retired Hurt' });
    engine.scoreBall({ runsScored: 4 });
    const replayed = EventSourcedMatchEngine.fromEvents(engine.events as any);
    expect(replayed.currentInnings.totalWickets).toBe(engine.currentInnings.totalWickets);
    expect(replayed.currentInnings.totalRuns).toBe(engine.currentInnings.totalRuns);
    const retired = replayed.currentInnings.players.find((p) => p.name.includes('Opener One'))!;
    expect(retired.isDismissed).toBe(false);
  });
});

describe('C-M5 — createdAt survives rebuilds', () => {
  it('fromScorecard restores the scorecard createdAt', () => {
    const engine = makeEngine();
    const sc = engine.toScorecard();
    sc.createdAt = '2025-05-05T05:05:05.000Z';
    const rebuilt = EventSourcedMatchEngine.fromScorecard(sc);
    expect(rebuilt.createdAt).toBe('2025-05-05T05:05:05.000Z');
    expect(rebuilt.toScorecard().createdAt).toBe('2025-05-05T05:05:05.000Z');
  });
});

describe('C-M4 — editHistoricalBall heals derived payload fields', () => {
  it('editing a dot into a four updates the stored payload totals', () => {
    const engine = makeEngine();
    engine.scoreBall({ runsScored: 0 });
    engine.scoreBall({ runsScored: 0 });
    const ok = engine.editHistoricalBall(0, 1, { runsScored: 4 });
    expect(ok).toBe(true);
    const ev = engine.events.filter((e) => e.type === 'BALL_SCORED')[0];
    expect(ev.payload.runsScored).toBe(4);
    expect(ev.payload.totalRunsGained).toBe(4);
    // The payload's running-score field follows the replayed value.
    expect(ev.payload.score).toBe(4);
  });
});

// ─── DLS: C-M7 ───────────────────────────────────────────────
describe('C-M7 — DLS all-out first innings uses zero remaining resource', () => {
  const base = {
    originalOvers: 20,
    team1TotalRuns: 120,
    team1OversBowled: 15,
    team2OversAvailable: 20,
    matchType: 'T20' as const,
  };

  it('an all-out innings keeps the full initial resource', () => {
    const allOut = DlsEngine.calculate({ ...base, team1WicketsLost: 10 });
    const nineDown = DlsEngine.calculate({ ...base, team1WicketsLost: 9 });
    expect(allOut.team1ResourcePct).toBeGreaterThan(nineDown.team1ResourcePct);
    // With no resource lost, R1 equals the full-innings resource.
    expect(allOut.team1ResourcePct).toBe(DlsEngine.getResourcePercentage(20, 0));
  });
});

// ─── NRR leaderboard: C-L4 ───────────────────────────────────
describe('C-L4 — leaderboard dismissals are id-first', () => {
  it('a same-named teammate is not marked dismissed', () => {
    const mkPlayer = (id: string, playerId: string, runs: number) =>
      ({
        id,
        playerId,
        name: 'RAHIM',
        runs,
        balls: 10,
        fours: 0,
        sixes: 0,
        dotBalls: 0,
        ballLog: [],
        bowlersFaced: {},
        runsVsBowler: {},
        isDismissed: false,
      }) as any;
    const innings = {
      inningsNumber: 1,
      team: 'Alpha',
      bowlingTeam: 'Beta',
      totalRuns: 30,
      totalWickets: 1,
      totalBalls: 20,
      oversString: '3.2',
      wideRuns: 0,
      nbRuns: 0,
      byeRuns: 0,
      lbRuns: 0,
      penaltyRuns: 0,
      penaltyRunsAgainst: 0,
      players: [mkPlayer('pos-1', 'stable-1', 20), mkPlayer('pos-2', 'stable-2', 10)],
      bowlers: [],
      fallOfWickets: [
        { score: 20, wicket: 1, over: '2.0', player: 'RAHIM', playerId: 'pos-1', dismissalType: 'Bowled', dismissal: 'RAHIM b X' },
      ],
      pastPartnerships: [],
      currentPartnership: { batter1: '', batter2: '', runs: 0, balls: 0 },
      thisOverLog: [],
      strikerIdx: 1,
      nonStrikerIdx: 0,
      currentBowlerIdx: 0,
      nextPlayerIdx: 2,
      lastCompletedOverBowlerIdx: -1,
      isOverComplete: false,
      isFreeHit: false,
    } as any;
    const match = {
      id: 'cup-match-1',
      teamA: 'Alpha',
      teamB: 'Beta',
      tossWinner: 'Alpha',
      tossDecision: 'Batting',
      totalOvers: 20,
      status: 'COMPLETED',
      currentInnings: 1,
      advancedSettings: { tournamentId: 'cup1', players: 11 },
      firstInnings: innings,
      createdAt: T_OLD,
      updatedAt: T_NEW,
    } as unknown as MatchScorecard;

    const { battingLeaders } = NetRunRateEngine.generateLeaderboard('cup1', [match]);
    const rahims = battingLeaders.filter((b) => b.name === 'RAHIM');
    expect(rahims).toHaveLength(2);
    expect(rahims.reduce((n, b) => n + b.dismissals, 0)).toBe(1);
  });
});

// ─── Live snapshot: C-M1 / C-M2 / C-M3 / C-L6 ───────────────
const snapPlayer = (name: string, over: Record<string, unknown> = {}) =>
  ({
    id: `p-${name}`,
    name,
    battingHand: 'Right',
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    dotBalls: 0,
    ballLog: [],
    bowlersFaced: {},
    runsVsBowler: {},
    isDismissed: false,
    ...over,
  }) as any;

const snapInnings = (over: Record<string, unknown> = {}) =>
  ({
    inningsNumber: 1,
    team: 'Alpha',
    bowlingTeam: 'Beta',
    totalRuns: 0,
    totalWickets: 0,
    totalBalls: 0,
    oversString: '0.0',
    wideRuns: 0,
    nbRuns: 0,
    byeRuns: 0,
    lbRuns: 0,
    penaltyRuns: 0,
    penaltyRunsAgainst: 0,
    players: [],
    bowlers: [],
    fallOfWickets: [],
    pastPartnerships: [],
    currentPartnership: { batter1: '', batter2: '', runs: 0, balls: 0 },
    thisOverLog: [],
    strikerIdx: 0,
    nonStrikerIdx: 1,
    currentBowlerIdx: 0,
    nextPlayerIdx: 2,
    lastCompletedOverBowlerIdx: -1,
    isOverComplete: false,
    isFreeHit: false,
    ...over,
  }) as any;

const snapScorecard = (over: Record<string, unknown> = {}) =>
  ({
    id: 'snap-m1',
    teamA: 'Alpha',
    teamB: 'Beta',
    tossWinner: 'Alpha',
    tossDecision: 'Batting',
    totalOvers: 20,
    status: 'ONGOING',
    currentInnings: 1,
    advancedSettings: { players: 11 },
    firstInnings: snapInnings(),
    createdAt: T_OLD,
    updatedAt: T_NEW,
    ...over,
  }) as unknown as MatchScorecard;

describe('live snapshot fixes (C-M1, C-M2, C-M3, C-L6)', () => {
  it('C-M2: chase figures never go negative past the target', () => {
    const sc = snapScorecard({
      currentInnings: 2,
      targetScore: 101,
      firstInnings: snapInnings({ totalRuns: 100, totalBalls: 120, oversString: '20.0' }),
      secondInnings: snapInnings({
        inningsNumber: 2,
        team: 'Beta',
        bowlingTeam: 'Alpha',
        totalRuns: 105,
        totalWickets: 2,
        totalBalls: 60,
        oversString: '10.0',
        players: [snapPlayer('CHASER', { runs: 50, balls: 30 })],
      }),
    });
    const snap = buildLiveSnapshot(sc, []);
    expect(snap.current).not.toBeNull();
    expect(snap.current!.runsNeeded).toBe(0);
    expect(snap.current!.reqRate).toBeNull();
  });

  it('C-M1: an abandoned match publishes as completed, not live', () => {
    const snap = buildLiveSnapshot(snapScorecard({ status: 'ABANDONED' }), []);
    expect(snap.status).toBe('completed');
    expect(snap.statusLine).toBe('Match abandoned');
  });

  it('C-M3: the win predictor respects the super-over 2-wicket limit', () => {
    const chase = (isSuperOver: boolean) =>
      snapScorecard({
        currentInnings: 2,
        targetScore: 16,
        totalOvers: isSuperOver ? 1 : 20,
        advancedSettings: { players: 11, isSuperOver },
        firstInnings: snapInnings({ totalRuns: 15, totalBalls: 6, oversString: '1.0' }),
        secondInnings: snapInnings({
          inningsNumber: 2,
          team: 'Beta',
          bowlingTeam: 'Alpha',
          totalRuns: 8,
          totalWickets: 1,
          totalBalls: 3,
          oversString: '0.3',
          players: [snapPlayer('CHASER', { runs: 8, balls: 3 })],
        }),
      });
    const normal = buildLiveSnapshot(chase(false), []);
    const superOver = buildLiveSnapshot(chase(true), []);
    expect(normal.current!.winPct).not.toBeNull();
    expect(superOver.current!.winPct).not.toBeNull();
    // One wicket down in a super over leaves ONE wicket in hand —
    // the chase is far more precarious than the same figures with
    // nine wickets in hand.
    expect(superOver.current!.winPct!).toBeLessThan(normal.current!.winPct!);
  });

  it('C-L6: penalty runs appear in the over summary and reconcile with the innings total', () => {
    const events: DomainEvent[] = [];
    for (let i = 0; i < 6; i++) {
      events.push({
        eventId: `b${i}`,
        matchId: 'snap-m1',
        version: i + 1,
        timestamp: 1000 + i,
        type: 'BALL_SCORED',
        payload: {
          inningsNumber: 1,
          overNumber: 1,
          ballNumber: i + 1,
          runsScored: 1,
          totalRunsGained: 1,
          isLegalBall: true,
          striker: 'Opener One',
          bowler: 'Bowler One',
        },
      } as any);
    }
    events.push({
      eventId: 'pen1',
      matchId: 'snap-m1',
      version: 7,
      timestamp: 2000,
      type: 'PENALTY_AWARDED',
      payload: { runs: 5, awardedToBattingTeam: true },
    } as any);
    const sc = snapScorecard({
      firstInnings: snapInnings({
        totalRuns: 11,
        totalBalls: 6,
        oversString: '1.0',
        penaltyRuns: 5,
        players: [snapPlayer('Opener One', { runs: 6, balls: 6 })],
        bowlers: [
          {
            id: 'bw1',
            name: 'Bowler One',
            ballsBowled: 6,
            maidens: 0,
            runs: 11,
            wickets: 0,
            overHistory: [],
          },
        ],
      }),
    });
    const snap = buildLiveSnapshot(sc, events);
    expect(snap.current).not.toBeNull();
    expect(snap.current!.overs).toHaveLength(1);
    expect(snap.current!.overs[0].runs).toBe(11);
    expect(snap.current!.feed.some((f) => f.text.includes('Penalty'))).toBe(true);
  });
});

// ─── Sync outbox: D-M5 ───────────────────────────────────────
describe('D-M5 — outbox never coalesces across a queued DELETE', () => {
  it('delete → re-create keeps all three ops in FIFO order', async () => {
    await SyncEngine.queueMutation('UPSERT_MATCH', { id: 'mx', teamA: 'A' }, 'mx');
    await SyncEngine.queueMutation('DELETE_MATCH', { id: 'mx' }, 'mx');
    await SyncEngine.queueMutation('UPSERT_MATCH', { id: 'mx', teamA: 'Recreated' }, 'mx');
    const ops = (await db.sync_queue.where('entityId').equals('mx').toArray()).sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : 1,
    );
    expect(ops.map((o) => o.operationType)).toEqual(['UPSERT_MATCH', 'DELETE_MATCH', 'UPSERT_MATCH']);
    expect((ops[2].payload as any).teamA).toBe('Recreated');
  });

  it('ordinary consecutive saves still coalesce into one op', async () => {
    await SyncEngine.queueMutation('UPSERT_MATCH', { id: 'my', teamA: 'A' }, 'my');
    await SyncEngine.queueMutation('UPSERT_MATCH', { id: 'my', teamA: 'A2' }, 'my');
    const ops = await db.sync_queue.where('entityId').equals('my').toArray();
    expect(ops).toHaveLength(1);
    expect((ops[0].payload as any).teamA).toBe('A2');
  });
});

// ─── Pull tombstone expiry: D-M7 ─────────────────────────────
describe('D-M7 — the Clear Database tombstone expires', () => {
  it('a record older than a year-expired clear restores normally', async () => {
    const ls = stubLocalStorage();
    const longAgo = Date.now() - 400 * 24 * 60 * 60 * 1000;
    ls.setItem('csp_db_cleared_at', String(longAgo));
    firestoreStore.matches['m_old'] = {
      id: 'm_old',
      userId: 'u1',
      updatedAt: T_OLD,
      scorecard_data: { id: 'm_old', teamA: 'Old', teamB: 'B', createdAt: T_OLD, updatedAt: T_OLD },
    };
    await (SyncEngine as any).pullRemoteChanges(SESSION);
    expect((await db.matches.get('m_old'))?.teamA).toBe('Old');
    const tombstones = (await db.sync_queue.toArray()).filter((o) =>
      o.operationType.startsWith('DELETE_'),
    );
    expect(tombstones).toHaveLength(0);
  });
});

// ─── File restore: D-M4 / D-M9 / D-L4 ────────────────────────
describe('file restore hardening (D-M4, D-M9, D-L4)', () => {
  const backupWith = (extra: Record<string, unknown>) =>
    JSON.stringify({
      app: 'Cric Scorer Pro',
      version: '2.5.0',
      exportedAt: T_NEW,
      matches: [{ id: 'fm1', teamA: 'A', teamB: 'B', updatedAt: T_OLD }],
      matchEvents: [],
      teams: [],
      tournaments: [],
      grounds: [],
      ...extra,
    });

  it('D-M4: a replace restore clears the pre-restore sync queue', async () => {
    await SyncEngine.queueMutation('UPSERT_MATCH', { id: 'ghost', teamA: 'Ghost' }, 'ghost');
    expect((await db.sync_queue.toArray()).length).toBeGreaterThan(0);
    const result = await StorageManagerService.importDatabase(backupWith({}), 'replace');
    expect(result.success).toBe(true);
    const remaining = (await db.sync_queue.toArray()).filter((o) => o.entityId === 'ghost');
    expect(remaining).toHaveLength(0);
  });

  it('D-M9: malformed matchEvents are dropped, valid ones kept', async () => {
    const result = await StorageManagerService.importDatabase(
      backupWith({
        matchEvents: [
          { eventId: 'ev-ok', matchId: 'fm1', version: 1, type: 'BALL_SCORED', payload: {} },
          { nope: true },
          'a string is not an event',
          { eventId: 'ev-no-match' },
        ],
      }),
      'replace',
    );
    expect(result.success).toBe(true);
    const events = await db.match_events.where('matchId').equals('fm1').toArray();
    expect(events.map((e: any) => e.eventId)).toEqual(['ev-ok']);
    expect(result.dropped).toBeGreaterThanOrEqual(3);
  });

  it('D-L4: conflict branches are not imported as standalone matches', async () => {
    const result = await StorageManagerService.importDatabase(
      backupWith({
        matches: [
          { id: 'fm1', teamA: 'A', teamB: 'B', updatedAt: T_OLD },
          {
            id: 'fm1_local_conflict_1731000000000',
            teamA: 'A (Local Conflict)',
            teamB: 'B',
            updatedAt: T_OLD,
            syncStatus: 'CONFLICT',
          },
        ],
      }),
      'replace',
    );
    expect(result.success).toBe(true);
    expect(await db.matches.get('fm1_local_conflict_1731000000000')).toBeUndefined();
    expect(await db.matches.get('fm1')).toBeDefined();
  });

  it('D-L3: a backup owned by another account is rejected when the uid is known', async () => {
    const result = await StorageManagerService.importDatabase(
      backupWith({
        matches: [{ id: 'fm9', teamA: 'A', teamB: 'B', userId: 'someone-else', updatedAt: T_OLD }],
      }),
      'merge',
      'u1',
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('different user');
    expect(await db.matches.get('fm9')).toBeUndefined();
  });
});
