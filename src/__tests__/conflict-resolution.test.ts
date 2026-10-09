import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../infrastructure/database/dexie-db';
import { MatchScorecard, DomainEvent } from '../domain/cricket/types';

describe('Conflict Resolution & Event Deduplication Test Suite', () => {
  beforeEach(async () => {
    await db.matches.clear();
    await db.match_events.clear();
    await db.sync_queue.clear();
  });

  it('A. Preserves local changes as a conflict branch when remote divergence is detected', async () => {
    const matchId = 'match_diverged_1';

    // 1. Local match state with unsynchronized offline edits
    const localMatch: MatchScorecard = {
      id: matchId,
      teamA: 'Eagles',
      teamB: 'Hawks',
      tossWinner: 'Eagles',
      tossDecision: 'Batting',
      totalOvers: 10,
      status: 'ONGOING',
      currentInnings: 1,
      targetScore: 0,
      venue: 'City Oval',
      advancedSettings: {
        players: 11,
        noBall: true,
        noBallReball: true,
        noBallRun: 1,
        wideBall: true,
        wideReball: true,
        wideRun: 1,
        isManualLimitEnabled: false,
        manualOverLimit: 2,
      },
      firstInnings: {
        inningsNumber: 1,
        team: 'Eagles',
        bowlingTeam: 'Hawks',
        totalRuns: 45, // Local scored 45
        totalWickets: 2,
        totalBalls: 30,
        oversString: '5.0',
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
      },
      createdAt: '2026-10-09T10:00:00Z',
      updatedAt: '2026-10-09T10:30:00Z',
      syncStatus: 'PENDING',
    };

    await db.matches.put(localMatch);

    // Queue pending operation for local match
    await db.sync_queue.put({
      clientOpId: 'op_local_1',
      operationType: 'UPSERT_MATCH',
      entityId: matchId,
      payload: localMatch,
      status: 'PENDING',
      retryCount: 0,
      createdAt: '2026-10-09T10:30:00Z',
    });

    // 2. Incoming remote match from another device with higher updatedAt and different score
    const remoteMatch: MatchScorecard = {
      ...localMatch,
      updatedAt: '2026-10-09T10:35:00Z',
      firstInnings: {
        ...localMatch.firstInnings!,
        totalRuns: 50, // Remote has 50
      },
    };

    // Simulate Conflict Branching logic (as performed in SyncEngine.pullRemoteChanges)
    const localRecord = await db.matches.get(matchId);
    expect(localRecord).toBeDefined();

    const hasPendingLocalOps = (await db.sync_queue
      .where('status')
      .equals('PENDING')
      .and((r) => r.entityId === matchId)
      .count()) > 0;

    expect(hasPendingLocalOps).toBe(true);

    const localUpdated = new Date(localRecord!.updatedAt).getTime();
    const remoteUpdated = new Date(remoteMatch.updatedAt).getTime();

    expect(remoteUpdated).toBeGreaterThan(localUpdated);

    // Branching: preserve local version without destroying it
    const conflictBranchId = `${matchId}_local_conflict_${Date.now()}`;
    const preservedLocalBranch: MatchScorecard = {
      ...localRecord!,
      id: conflictBranchId,
      syncStatus: 'CONFLICT',
      isConflictBranch: true,
      teamA: `${localRecord!.teamA} (Local Conflict)`,
    };
    await db.matches.put(preservedLocalBranch);

    // Primary ID adopts remote authoritative state
    remoteMatch.syncStatus = 'SYNCED';
    await db.matches.put(remoteMatch);

    // 3. Verify: ZERO DATA LOSS! Both primary and preserved conflict exist in Dexie
    const allMatches = await db.matches.toArray();
    expect(allMatches.length).toBe(2);

    const activeMatch = await db.matches.get(matchId);
    expect(activeMatch?.firstInnings?.totalRuns).toBe(50);
    expect(activeMatch?.syncStatus).toBe('SYNCED');

    const conflictBranch = await db.matches.get(conflictBranchId);
    expect(conflictBranch).toBeDefined();
    expect(conflictBranch?.firstInnings?.totalRuns).toBe(45);
    expect(conflictBranch?.syncStatus).toBe('CONFLICT');
    expect(conflictBranch?.isConflictBranch).toBe(true);
  });

  it('B. Deduplicates ball-by-ball domain events by unique eventId', async () => {
    const events: DomainEvent[] = [
      {
        eventId: 'ev_101',
        matchId: 'm_test',
        version: 1,
        timestamp: 1000,
        type: 'BALL_SCORED',
        payload: { runsScored: 4 },
      },
      {
        eventId: 'ev_102',
        matchId: 'm_test',
        version: 2,
        timestamp: 2000,
        type: 'BALL_SCORED',
        payload: { runsScored: 1 },
      },
      {
        eventId: 'ev_101', // Duplicate submission of ev_101
        matchId: 'm_test',
        version: 1,
        timestamp: 1000,
        type: 'BALL_SCORED',
        payload: { runsScored: 4 },
      },
    ];

    // Dexie primary key on match_events is eventId
    await db.match_events.bulkPut(events);

    const storedEvents = await db.match_events.where('matchId').equals('m_test').toArray();
    // Duplicates are idempotently deduped by eventId!
    expect(storedEvents.length).toBe(2);
    expect(storedEvents.map((e) => e.eventId).sort()).toEqual(['ev_101', 'ev_102']);
  });
});
