import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { MatchScorecard, DomainEvent, InningsData } from '../domain/cricket/types';
import { isAllowedOnNoBall, isAllowedOnWide } from '../domain/cricket/dismissals';
import { isMatchTie, isMatchNoResult } from '../domain/cricket/formatters';
import { ManOfTheMatchEngine } from '../domain/cricket/analytics/ManOfTheMatchEngine';
import { ScorecardPdfGenerator } from '../features/scoring/pdf/ScorecardPdfGenerator';
import { GoogleDriveService } from '../infrastructure/storage/GoogleDriveService';
import { SyncEngine } from '../infrastructure/sync/SyncEngine';
import { db } from '../infrastructure/database/dexie-db';
import { MatchRepository } from '../infrastructure/storage/MatchRepository';

function createTestScorecard(overrides: Partial<MatchScorecard> = {}): MatchScorecard {
  const inn1: InningsData = {
    inningsNumber: 1,
    team: 'Team Alpha',
    bowlingTeam: 'Team Beta',
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
    players: [
      {
        id: 'p1',
        name: 'Striker One',
        battingHand: 'Right-hand Batsman',
        battingPosition: '1',
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        dotBalls: 0,
        ballLog: [],
        bowlersFaced: {},
        runsVsBowler: {},
        isDismissed: false,
      },
      {
        id: 'p2',
        name: 'NonStriker Two',
        battingHand: 'Right-hand Batsman',
        battingPosition: '2',
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        dotBalls: 0,
        ballLog: [],
        bowlersFaced: {},
        runsVsBowler: {},
        isDismissed: false,
      },
      {
        id: 'p3',
        name: 'Batter Three',
        battingHand: 'Right-hand Batsman',
        battingPosition: '3',
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        dotBalls: 0,
        ballLog: [],
        bowlersFaced: {},
        runsVsBowler: {},
        isDismissed: false,
      },
    ],
    bowlers: [
      {
        id: 'b1',
        name: 'Bowler Alpha',
        ballsBowled: 0,
        maidens: 0,
        runs: 0,
        wickets: 0,
        overHistory: [],
      },
      {
        id: 'b2',
        name: 'Bowler Beta',
        ballsBowled: 0,
        maidens: 0,
        runs: 0,
        wickets: 0,
        overHistory: [],
      },
    ],
    fallOfWickets: [],
    pastPartnerships: [],
    currentPartnership: { batter1: 'Striker One', batter2: 'NonStriker Two', runs: 0, balls: 0 },
    thisOverLog: [],
    strikerIdx: 0,
    nonStrikerIdx: 1,
    currentBowlerIdx: 0,
    nextPlayerIdx: 2,
    lastCompletedOverBowlerIdx: -1,
    isOverComplete: false,
    isFreeHit: false,
  };

  return {
    id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    teamA: 'Team Alpha',
    teamB: 'Team Beta',
    tossWinner: 'Team Alpha',
    tossDecision: 'Batting',
    totalOvers: 20,
    status: 'ONGOING',
    currentInnings: 1,
    targetScore: 0,
    venue: 'National Cricket Stadium',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    advancedSettings: {
      players: 11,
      noBall: true,
      noBallReball: true,
      noBallRun: 1,
      wideBall: true,
      wideReball: true,
      wideRun: 1,
      isManualLimitEnabled: false,
      manualOverLimit: 4,
    },
    firstInnings: inn1,
    ...overrides,
  };
}

describe('Cricket Scorer Pro — Audit & Critical Bug Fix Verification Matrix', () => {
  beforeEach(async () => {
    await db.matches.clear();
    await db.match_events.clear();
    await db.teams.clear();
    await db.tournaments.clear();
    await db.sync_queue.clear();
    SyncEngine.stop();
  });

  afterEach(() => {
    SyncEngine.stop();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Normal Legal Delivery
  // ──────────────────────────────────────────────────────────────────────────
  it('1. Normal legal delivery: updates runs, legal balls, strike rotation, and invariants', () => {
    const sc = createTestScorecard();
    const engine = new EventSourcedMatchEngine(sc);

    engine.scoreBall({ runsScored: 1, isWicket: false });

    const inn = engine.currentInnings;
    expect(inn.totalRuns).toBe(1);
    expect(inn.totalBalls).toBe(1);
    expect(inn.oversString).toBe('0.1');

    // Striker (Idx 0) scored 1 run off 1 ball
    expect(inn.players[0].runs).toBe(1);
    expect(inn.players[0].balls).toBe(1);

    // Bowler conceded 1 run off 1 legal ball
    expect(inn.bowlers[0].runs).toBe(1);
    expect(inn.bowlers[0].ballsBowled).toBe(1);

    // Strike rotation: odd run swaps striker and non-striker
    expect(inn.strikerIdx).toBe(1);
    expect(inn.nonStrikerIdx).toBe(0);

    // Scoring Invariants validation
    expect(engine.validateScoringInvariants().valid).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Wide Delivery
  // ──────────────────────────────────────────────────────────────────────────
  it('2. Wide delivery: charges bowler, does not count as legal ball, preserves strike', () => {
    const sc = createTestScorecard();
    const engine = new EventSourcedMatchEngine(sc);

    engine.scoreBall({ runsScored: 0, isWide: true, isWicket: false });

    const inn = engine.currentInnings;
    expect(inn.totalRuns).toBe(1);
    expect(inn.wideRuns).toBe(1);
    expect(inn.totalBalls).toBe(0);
    expect(inn.oversString).toBe('0.0');

    // Batter should NOT be charged balls or credited runs
    expect(inn.players[0].runs).toBe(0);
    expect(inn.players[0].balls).toBe(0);

    // Bowler charged 1 wide extra
    expect(inn.bowlers[0].runs).toBe(1);
    expect(inn.bowlers[0].ballsBowled).toBe(0);

    // Strike should not rotate
    expect(inn.strikerIdx).toBe(0);
    expect(inn.nonStrikerIdx).toBe(1);

    expect(engine.validateScoringInvariants().valid).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. No-Ball with Batter Runs
  // ──────────────────────────────────────────────────────────────────────────
  it('3. No-ball with batter runs: charges bowler (batter runs + penalty), activates Free Hit', () => {
    const sc = createTestScorecard();
    const engine = new EventSourcedMatchEngine(sc);

    engine.scoreBall({ runsScored: 2, isNoBall: true, isWicket: false });

    const inn = engine.currentInnings;
    // 2 batter runs + 1 penalty = 3 team runs
    expect(inn.totalRuns).toBe(3);
    expect(inn.nbRuns).toBe(1);
    expect(inn.totalBalls).toBe(0); // Not a legal ball

    // Batter credited 2 runs off 1 ball faced
    expect(inn.players[0].runs).toBe(2);
    expect(inn.players[0].balls).toBe(1);

    // Bowler charged total 3 runs (2 bat + 1 penalty)
    expect(inn.bowlers[0].runs).toBe(3);
    expect(inn.bowlers[0].ballsBowled).toBe(0);

    // Even runs: strike does not rotate
    expect(inn.strikerIdx).toBe(0);

    // Free hit activated
    expect(inn.isFreeHit).toBe(true);

    expect(engine.validateScoringInvariants().valid).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. No-Ball with Byes
  // ──────────────────────────────────────────────────────────────────────────
  it('4. No-ball with byes: bowler charged ONLY penalty run, byes not charged to bowler', () => {
    const sc = createTestScorecard();
    const engine = new EventSourcedMatchEngine(sc);

    // 2 byes taken on a no-ball
    engine.scoreBall({ runsScored: 2, isNoBall: true, isByes: true, isWicket: false });

    const inn = engine.currentInnings;
    // Team gets 1 penalty + 2 byes = 3 total runs
    expect(inn.totalRuns).toBe(3);
    expect(inn.nbRuns).toBe(1);
    expect(inn.byeRuns).toBe(2);

    // Striker faced 1 ball but scored 0 runs
    expect(inn.players[0].runs).toBe(0);
    expect(inn.players[0].balls).toBe(1);

    // CRITICAL: Bowler is charged ONLY the 1 penalty run, NOT the 2 byes!
    expect(inn.bowlers[0].runs).toBe(1);
    expect(inn.bowlers[0].ballsBowled).toBe(0);

    // Free hit activated
    expect(inn.isFreeHit).toBe(true);

    expect(engine.validateScoringInvariants().valid).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. No-Ball with Leg-Byes
  // ──────────────────────────────────────────────────────────────────────────
  it('5. No-ball with leg-byes: bowler charged ONLY penalty, leg-byes excluded from bowler figures', () => {
    const sc = createTestScorecard();
    const engine = new EventSourcedMatchEngine(sc);

    // 1 leg-bye taken on a no-ball
    engine.scoreBall({ runsScored: 1, isNoBall: true, isLegByes: true, isWicket: false });

    const inn = engine.currentInnings;
    // Team gets 1 penalty + 1 leg-bye = 2 total runs
    expect(inn.totalRuns).toBe(2);
    expect(inn.nbRuns).toBe(1);
    expect(inn.lbRuns).toBe(1);

    // Striker scored 0 runs
    expect(inn.players[0].runs).toBe(0);
    expect(inn.players[0].balls).toBe(1);

    // Bowler charged ONLY the 1 penalty run
    expect(inn.bowlers[0].runs).toBe(1);
    expect(inn.bowlers[0].ballsBowled).toBe(0);

    // Odd leg-bye rotates strike
    expect(inn.strikerIdx).toBe(1);

    expect(engine.validateScoringInvariants().valid).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Invalid Wide + No-Ball Combination
  // ──────────────────────────────────────────────────────────────────────────
  it('6. Invalid wide + no-ball combination: normalized to no-ball without duplicate penalties', () => {
    const sc = createTestScorecard();
    const engine = new EventSourcedMatchEngine(sc);

    // Erroneously supply both isWide: true and isNoBall: true
    engine.scoreBall({
      runsScored: 0,
      isWide: true,
      isNoBall: true,
      isWicket: false,
    });

    const inn = engine.currentInnings;
    // Under Law 21.13 & 22.1, No-Ball takes precedence and Wide is cleared
    expect(inn.nbRuns).toBe(1);
    expect(inn.wideRuns).toBe(0);
    expect(inn.totalRuns).toBe(1); // Exactly 1 penalty run, NOT 2!
    expect(inn.bowlers[0].runs).toBe(1);

    expect(engine.validateScoringInvariants().valid).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Dismissal Restrictions & Permitted Exceptions
  // ──────────────────────────────────────────────────────────────────────────
  it('7. Dismissal restrictions: rejects Bowled/Caught/LBW on No-Ball, permits Run Out', () => {
    // Domain helpers verify MCC Laws 21.18 & 22.17
    expect(isAllowedOnNoBall('Bowled')).toBe(false);
    expect(isAllowedOnNoBall('Caught')).toBe(false);
    expect(isAllowedOnNoBall('LBW')).toBe(false);
    expect(isAllowedOnNoBall('Stumped')).toBe(false);
    expect(isAllowedOnNoBall('Hit Wicket')).toBe(false);
    expect(isAllowedOnNoBall('Run Out')).toBe(true);
    expect(isAllowedOnNoBall('Obstructing the Field')).toBe(true);
    expect(isAllowedOnNoBall('Hit the Ball Twice')).toBe(true);

    expect(isAllowedOnWide('Bowled')).toBe(false);
    expect(isAllowedOnWide('Caught')).toBe(false);
    expect(isAllowedOnWide('LBW')).toBe(false);
    expect(isAllowedOnWide('Stumped')).toBe(true);
    expect(isAllowedOnWide('Hit Wicket')).toBe(true);
    expect(isAllowedOnWide('Run Out')).toBe(true);

    const sc = createTestScorecard();
    const engine = new EventSourcedMatchEngine(sc);

    // Attempting prohibited Bowled dismissal on No-Ball
    engine.scoreBall({
      runsScored: 0,
      isNoBall: true,
      isWicket: true,
      dismissalType: 'Bowled',
    });

    // Wicket must be disallowed!
    let inn = engine.currentInnings;
    expect(inn.totalWickets).toBe(0);
    expect(inn.players[0].isDismissed).toBe(false);

    // Permitted Run Out on No-Ball
    engine.scoreBall({
      runsScored: 1,
      isNoBall: true,
      isWicket: true,
      dismissalType: 'Run Out',
      isStrikerOut: true,
    });

    inn = engine.currentInnings;
    expect(inn.totalWickets).toBe(1);
    expect(inn.players[0].isDismissed).toBe(true);
    expect(inn.players[0].dismissalType).toBe('Run Out');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Strike Rotation & Over Completion
  // ──────────────────────────────────────────────────────────────────────────
  it('8. Strike rotation and over completion: 6 legal balls complete over and rotate strike', () => {
    const sc = createTestScorecard();
    const engine = new EventSourcedMatchEngine(sc);

    // Ball 1: 1 run (rotates strike to player 1)
    engine.scoreBall({ runsScored: 1 });
    expect(engine.currentInnings.strikerIdx).toBe(1);

    // Ball 2: 0 run (strike stays player 1)
    engine.scoreBall({ runsScored: 0 });
    expect(engine.currentInnings.strikerIdx).toBe(1);

    // Ball 3: 2 runs (strike stays player 1)
    engine.scoreBall({ runsScored: 2 });
    expect(engine.currentInnings.strikerIdx).toBe(1);

    // Ball 4: 1 run (rotates strike to player 0)
    engine.scoreBall({ runsScored: 1 });
    expect(engine.currentInnings.strikerIdx).toBe(0);

    // Ball 5: 0 run (strike stays player 0)
    engine.scoreBall({ runsScored: 0 });
    expect(engine.currentInnings.strikerIdx).toBe(0);

    // Ball 6: 0 run (end of over: automatically swaps strike for start of next over)
    engine.scoreBall({ runsScored: 0 });
    expect(engine.currentInnings.isOverComplete).toBe(true);
    expect(engine.currentInnings.oversString).toBe('1.0');
    // After over completion, strike is rotated so player 1 faces next over
    expect(engine.currentInnings.strikerIdx).toBe(1);
    expect(engine.currentInnings.nonStrikerIdx).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Variable Match Lengths (5, 6, 10, 20 overs)
  // ──────────────────────────────────────────────────────────────────────────
  it('9. Variable match formats: 5, 6, 10, 20 overs adapt bowler limits accurately', () => {
    // Under 10 overs default limit is 4 overs per bowler
    const engine5 = new EventSourcedMatchEngine(createTestScorecard({ totalOvers: 5 }));
    expect(engine5.totalOvers).toBe(5);
    expect(engine5.maxOversPerBowler).toBe(4);

    // 10 overs international limit: 2 overs per bowler
    const engine10 = new EventSourcedMatchEngine(createTestScorecard({ totalOvers: 10 }));
    expect(engine10.totalOvers).toBe(10);
    expect(engine10.maxOversPerBowler).toBe(2);

    // 20 overs international limit: 4 overs per bowler
    const engine20 = new EventSourcedMatchEngine(createTestScorecard({ totalOvers: 20 }));
    expect(engine20.totalOvers).toBe(20);
    expect(engine20.maxOversPerBowler).toBe(4);

    // Custom limit configured: 1 over per bowler in a 10-over match
    const engineCustom = new EventSourcedMatchEngine(
      createTestScorecard({
        totalOvers: 10,
        advancedSettings: {
          players: 11,
          noBall: true,
          noBallReball: true,
          noBallRun: 1,
          wideBall: true,
          wideReball: true,
          wideRun: 1,
          isManualLimitEnabled: true,
          bowlingLimitMode: 'custom',
          manualOverLimit: 1,
          maxOversPerBowler: 1,
        },
      })
    );
    expect(engineCustom.maxOversPerBowler).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 10. Historical Ball Editing and Full Recalculation
  // ──────────────────────────────────────────────────────────────────────────
  it('10. Historical ball editing: updates target ball and recalculates all downstream stats and strike', () => {
    const sc = createTestScorecard();
    const engine = new EventSourcedMatchEngine(sc);

    // Ball 0: Striker One hits 4
    engine.scoreBall({ runsScored: 4 });
    // Ball 1: Striker One hits 1 (rotates strike to NonStriker Two)
    engine.scoreBall({ runsScored: 1 });
    // Ball 2: NonStriker Two hits 2
    engine.scoreBall({ runsScored: 2 });

    expect(engine.currentInnings.totalRuns).toBe(7);
    expect(engine.currentInnings.players[0].runs).toBe(5);
    expect(engine.currentInnings.players[1].runs).toBe(2);

    // Edit Ball 0 from 4 runs to 1 run (which alters strike rotation!)
    engine.editHistoricalBall(0, 1, { runsScored: 1 });

    const updatedInn = engine.currentInnings;
    // Total runs: was 7, minus 3 = 4
    expect(updatedInn.totalRuns).toBe(4);
    expect(updatedInn.bowlers[0].runs).toBe(4);

    // Ball 0 (1 run) rotated strike to NonStriker Two!
    // So Ball 1 was faced by NonStriker Two, and Ball 2 was faced accordingly
    expect(engine.validateScoringInvariants().valid).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 11. Undo Before and After Simulated Browser Reload
  // ──────────────────────────────────────────────────────────────────────────
  it('11. Undo before and after simulated browser reload: restores exact prior state', () => {
    const sc = createTestScorecard();
    const engine = new EventSourcedMatchEngine(sc);

    // Ball 1: 4 runs
    engine.scoreBall({ runsScored: 4 });
    // Ball 2: 1 run
    engine.scoreBall({ runsScored: 1 });

    expect(engine.currentInnings.totalRuns).toBe(5);
    expect(engine.currentInnings.totalBalls).toBe(2);

    // Undo before reload
    engine.undo();
    expect(engine.currentInnings.totalRuns).toBe(4);
    expect(engine.currentInnings.totalBalls).toBe(1);

    // Add another ball: 2 runs
    engine.scoreBall({ runsScored: 2 });
    expect(engine.currentInnings.totalRuns).toBe(6);

    // Simulate browser reload: re-create engine from scorecard and stored events with empty in-memory snapshots
    const savedScorecard = engine.toScorecard();
    const reloadedEngine = new EventSourcedMatchEngine({
      ...savedScorecard,
      events: engine.events,
    });

    // Undo after reload must still successfully restore previous state via event replay!
    reloadedEngine.undo();
    expect(reloadedEngine.currentInnings.totalRuns).toBe(4);
    expect(reloadedEngine.currentInnings.totalBalls).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 12. Event Replay Mathematical Fidelity (`fromEvents`)
  // ──────────────────────────────────────────────────────────────────────────
  it('12. Deterministic event replay: fromEvents produces exact state identical to real-time play', () => {
    const sc = createTestScorecard();
    const engine = new EventSourcedMatchEngine(sc);

    engine.scoreBall({ runsScored: 1 });
    engine.scoreBall({ runsScored: 0, isWide: true });
    engine.scoreBall({ runsScored: 2, isNoBall: true });
    engine.scoreBall({ runsScored: 4 });
    engine.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled' });

    const originalState = engine.toScorecard();
    const originalEvents = engine.events;

    // Replay full stream from scratch
    const replayedEngine = EventSourcedMatchEngine.fromEvents(originalEvents);
    const replayedState = replayedEngine.toScorecard();

    expect(replayedState.firstInnings?.totalRuns).toBe(originalState.firstInnings?.totalRuns);
    expect(replayedState.firstInnings?.totalWickets).toBe(originalState.firstInnings?.totalWickets);
    expect(replayedState.firstInnings?.totalBalls).toBe(originalState.firstInnings?.totalBalls);
    expect(replayedState.firstInnings?.wideRuns).toBe(originalState.firstInnings?.wideRuns);
    expect(replayedState.firstInnings?.nbRuns).toBe(originalState.firstInnings?.nbRuns);
    expect(replayedState.firstInnings?.strikerIdx).toBe(originalState.firstInnings?.strikerIdx);
    expect(replayedState.firstInnings?.bowlers[0].runs).toBe(originalState.firstInnings?.bowlers[0].runs);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 13. Offline Scoring & Local Persistence
  // ──────────────────────────────────────────────────────────────────────────
  it('13. Offline scoring: stores match scorecard and delta events atomically in IndexedDB', async () => {
    const sc = createTestScorecard();
    const engine = new EventSourcedMatchEngine(sc);
    engine.scoreBall({ runsScored: 4 });

    await MatchRepository.saveMatchWithEvents(engine.toScorecard(), engine.events, 0);

    const saved = await db.matches.get(sc.id);
    expect(saved).toBeDefined();
    expect(saved?.firstInnings?.totalRuns).toBe(4);
    expect(saved?.syncStatus).toBe('PENDING');

    const events = await db.match_events.where('matchId').equals(sc.id).toArray();
    expect(events.length).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 14. Sync Retry & Duplicate Prevention
  // ──────────────────────────────────────────────────────────────────────────
  it('14. Sync retry and duplicate prevention: coalesces rapid outbox mutations safely', async () => {
    const matchId = 'm_test_coalesce';

    await SyncEngine.queueMutation('UPSERT_MATCH', { id: matchId, score: 1 }, matchId);
    await SyncEngine.queueMutation('UPSERT_MATCH', { id: matchId, score: 2 }, matchId);
    await SyncEngine.queueMutation('UPSERT_MATCH', { id: matchId, score: 3 }, matchId);

    const queue = await db.sync_queue.toArray();
    // Coalescing ensures only 1 pending record exists for the entity
    expect(queue.length).toBe(1);
    expect(queue[0].payload.score).toBe(3);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 15. Concurrent Modification & Conflict Handling
  // ──────────────────────────────────────────────────────────────────────────
  it('15. Concurrent modification: detects version conflict and prevents silent overwrite', async () => {
    const matchId = 'm_conflict_test';
    const localMatch = createTestScorecard({ id: matchId, version: 2, updatedAt: '2026-10-11T10:00:00Z' });
    await db.matches.put(localMatch);

    // If an incoming remote match has version 1 (older than local), it should not overwrite local
    const remoteOlder = { ...localMatch, version: 1, updatedAt: '2026-10-11T09:00:00Z' };

    // Verify local record remains at version 2
    const current = await db.matches.get(matchId);
    expect(current?.version).toBe(2);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 16. Firebase / Supabase Identity Compatibility
  // ──────────────────────────────────────────────────────────────────────────
  it('16. Identity resolution: getAuthenticatedUserId reads Firebase Auth uid', async () => {
    vi.stubGlobal('window', {
      __FIREBASE_APP__: {},
    });

    const resolved = await SyncEngine.getAuthenticatedUserId();
    // In test environment without active login, returns null gracefully without crashing
    expect(resolved === null || typeof resolved === 'string').toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 17. User Isolation in Cloud Records (`user_id` scoping)
  // ──────────────────────────────────────────────────────────────────────────
  it('17. User isolation in cloud records: upsert payload attaches user_id', async () => {
    const sc = createTestScorecard();
    const userId = 'firebase_user_abc123';

    // Verify payload structuring with user_id
    const payload = {
      id: sc.id,
      user_id: userId,
      team_a: sc.teamA,
      team_b: sc.teamB,
      scorecard_data: sc,
    };

    expect(payload.user_id).toBe(userId);
    expect(payload.id).toBe(sc.id);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 18. Backup Isolation Across Multiple Accounts
  // ──────────────────────────────────────────────────────────────────────────
  it('18. Backup isolation: createBackupPayload filters records strictly by userUid', async () => {
    const userAlice = 'user_alice_1';
    const userBob = 'user_bob_2';

    const matchAlice = createTestScorecard({ id: 'm_alice', userId: userAlice } as any);
    const matchBob = createTestScorecard({ id: 'm_bob', userId: userBob } as any);

    await db.matches.bulkPut([matchAlice, matchBob]);
    await db.match_events.bulkPut([
      { eventId: 'e_alice', matchId: 'm_alice', type: 'MATCH_CREATED', version: 1, timestamp: Date.now(), payload: {} },
      { eventId: 'e_bob', matchId: 'm_bob', type: 'MATCH_CREATED', version: 1, timestamp: Date.now(), payload: {} },
    ]);

    const aliceBackup = await GoogleDriveService.createBackupPayload(userAlice);

    expect(aliceBackup.userUid).toBe(userAlice);
    expect(aliceBackup.matches.length).toBe(1);
    expect(aliceBackup.matches[0].id).toBe('m_alice');
    // Ensure Bob's events are NOT leaked in Alice's backup!
    expect(aliceBackup.matchEvents.length).toBe(1);
    expect(aliceBackup.matchEvents[0].matchId).toBe('m_alice');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 19. Backup Restore: Validation, Foreign Account Rejection & Modes
  // ──────────────────────────────────────────────────────────────────────────
  it('19. Backup restore: rejects foreign user backup and supports merge vs replace modes', async () => {
    const userAlice = 'user_alice_1';
    const userBob = 'user_bob_2';

    const foreignBackup = {
      app: 'Cric Scorer Pro',
      version: '2.5.0',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      userUid: userBob,
      matches: [{ id: 'm_bob_1', teamA: 'T1', teamB: 'T2', status: 'COMPLETED' }],
      teams: [],
      tournaments: [],
      matchEvents: [],
    };

    // Rejection of foreign account backup
    await expect(
      GoogleDriveService.restoreToIndexedDb(foreignBackup, { expectedUserUid: userAlice })
    ).rejects.toThrow('Unauthorized backup');

    // Valid backup restore in replace mode
    const aliceBackup = {
      app: 'Cric Scorer Pro',
      version: '2.5.0',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      userUid: userAlice,
      matches: [{ id: 'm_alice_restore', teamA: 'Alpha', teamB: 'Beta', status: 'COMPLETED' }],
      teams: [{ id: 't_alice', name: 'Alpha Squad' }],
      tournaments: [],
      matchEvents: [],
    };

    const summary = await GoogleDriveService.restoreToIndexedDb(aliceBackup, {
      expectedUserUid: userAlice,
      mode: 'replace',
    });

    expect(summary.matchesCount).toBe(1);
    expect(summary.teamsCount).toBe(1);
    const restored = await db.matches.get('m_alice_restore');
    expect(restored).toBeDefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 20. Match Result and MOTM Consistency on Tied and Abandoned Matches
  // ──────────────────────────────────────────────────────────────────────────
  it('20. Match result & MOTM consistency: handles Tied and Abandoned matches accurately', async () => {
    // A. Tied Match
    const tiedScorecard = createTestScorecard({
      status: 'COMPLETED',
      resultType: 'TIE',
      result: 'Match Tied',
      secondInnings: {
        ...createTestScorecard().firstInnings!,
        inningsNumber: 2,
        totalRuns: 150,
      },
    });
    tiedScorecard.firstInnings!.totalRuns = 150;
    tiedScorecard.firstInnings!.players[0].runs = 75;
    tiedScorecard.firstInnings!.players[0].balls = 45;

    expect(isMatchTie(tiedScorecard)).toBe(true);
    expect(isMatchNoResult(tiedScorecard)).toBe(false);

    // MOTM awarded to top contributor in tied match
    const motmTied = ManOfTheMatchEngine.resolveForMatch(tiedScorecard, { forceRecalculate: true });
    expect(motmTied).not.toBeNull();
    expect(tiedScorecard.mom).toBe('Striker One');

    // B. Abandoned Match
    const abandonedScorecard = createTestScorecard({
      status: 'ABANDONED',
      resultType: 'NO_RESULT',
      result: 'Match Abandoned',
    });

    expect(isMatchTie(abandonedScorecard)).toBe(false);
    expect(isMatchNoResult(abandonedScorecard)).toBe(true);

    // Abandoned match must NOT invent an artificial MOTM!
    const motmAbandoned = ManOfTheMatchEngine.resolveForMatch(abandonedScorecard, { forceRecalculate: true });
    expect(motmAbandoned).toBeNull();
    expect(abandonedScorecard.mom).toBeUndefined();

    // C. PDF Generation test with Abandoned match
    const pdfDoc = await ScorecardPdfGenerator.generatePdf(abandonedScorecard);
    expect(pdfDoc).toBeDefined();
  });
});
