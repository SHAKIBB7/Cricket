import { describe, it, expect } from 'vitest';
import { EventSourcedMatchEngine } from '@/domain/cricket/match-engine/EventSourcedMatchEngine';
import { GoogleDriveService } from '@/infrastructure/storage/GoogleDriveService';

describe('Phase 06 — Cricket Engine & Architecture Comprehensive Edge Cases', () => {
  it('1. Handles 1-over ultra short match (Super Over format) with 0 runs & maiden over', () => {
    const engine = new EventSourcedMatchEngine({
      teamA: 'Super A',
      teamB: 'Super B',
      tossWinner: 'Super A',
      tossDecision: 'Batting',
      totalOvers: 1,
      strikerName: 'Batter 1',
      nonStrikerName: 'Batter 2',
      bowlerName: 'Bowler 1',
    });

    for (let i = 0; i < 6; i++) {
      engine.scoreBall({ runsScored: 0 });
    }

    const inn1 = engine.firstInnings;
    expect(inn1.totalRuns).toBe(0);
    expect(inn1.totalBalls).toBe(6);
    expect(inn1.oversString).toBe('1.0');
    expect(engine.isInningsOver).toBe(true);
    expect(inn1.bowlers[0].maidens).toBe(1);
  });

  it('2. Enforces All-Out innings completion across alternating overs when wickets reach maxWickets', () => {
    const engine = new EventSourcedMatchEngine({
      teamA: 'Team AllOut',
      teamB: 'Team Bowling',
      tossWinner: 'Team AllOut',
      tossDecision: 'Batting',
      totalOvers: 10,
      advancedSettings: { players: 11 },
      strikerName: 'P1',
      nonStrikerName: 'P2',
      bowlerName: 'B1',
    });

    expect(engine.maxWickets).toBe(10);

    // Over 1 (bowler B1 bowls 6 balls, taking 6 wickets)
    for (let w = 1; w <= 6; w++) {
      expect(engine.isInningsOver).toBe(false);
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Bowled',
        newBatsmanName: `P${w + 2}`,
      });
    }

    // Over 1 completed. Cricket laws require changing bowler to B2 for Over 2
    expect(engine.firstInnings.isOverComplete).toBe(true);
    const changeResult = engine.changeBowler('B2');
    expect(changeResult.success).toBe(true);

    // Over 2 (bowler B2 bowls balls 7 to 10, taking remaining 4 wickets)
    for (let w = 7; w <= 10; w++) {
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Bowled',
        newBatsmanName: w < 10 ? `P${w + 2}` : undefined,
      });
    }

    expect(engine.firstInnings.totalWickets).toBe(10);
    expect(engine.isInningsOver).toBe(true);
  });

  it('3. Differentiates Run Out of Striker vs Run Out of Non-Striker', () => {
    const engine = new EventSourcedMatchEngine({
      teamA: 'Team Alpha',
      teamB: 'Team Beta',
      tossWinner: 'Team Alpha',
      tossDecision: 'Batting',
      totalOvers: 5,
      strikerName: 'Rohit',
      nonStrikerName: 'Kohli',
      bowlerName: 'Starc',
    });

    // Run out of non-striker on 1 run attempt
    engine.scoreBall({
      runsScored: 1,
      isWicket: true,
      dismissalType: 'Run Out',
      isStrikerOut: false, // Non-striker is out!
      newBatsmanName: 'Rahane',
    });

    const inn = engine.firstInnings;
    expect(inn.totalWickets).toBe(1);
    expect(inn.fallOfWickets[0].player).toContain('Kohli');
    // Starc does NOT get wicket credit for Run Out
    expect(inn.bowlers[0].wickets).toBe(0);
  });

  it('4. Free Hit rule: Batter cannot be out Caught, but CAN be Run Out (Law 21.18)', () => {
    const engine = new EventSourcedMatchEngine({
      teamA: 'Team A',
      teamB: 'Team B',
      tossWinner: 'Team A',
      tossDecision: 'Batting',
      totalOvers: 5,
      strikerName: 'Hardik',
      nonStrikerName: 'Jadeja',
      bowlerName: 'Cummins',
    });

    // 1. Bowl a No-Ball -> triggers Free Hit on next delivery
    engine.scoreBall({ runsScored: 0, isNoBall: true });
    expect(engine.firstInnings.isFreeHit).toBe(true);

    // 2. Next ball: Caught attempt on Free Hit -> Not out per cricket laws!
    engine.scoreBall({
      runsScored: 0,
      isWicket: true,
      dismissalType: 'Caught',
      fielderName: 'Smith',
    });
    expect(engine.firstInnings.totalWickets).toBe(0);
    expect(engine.firstInnings.isFreeHit).toBe(false); // Legal delivery consumed Free Hit

    // 3. Another No-Ball
    engine.scoreBall({ runsScored: 0, isNoBall: true });
    expect(engine.firstInnings.isFreeHit).toBe(true);

    // 4. Run out on Free Hit -> Allowed per Law 21.18!
    engine.scoreBall({
      runsScored: 1,
      isWicket: true,
      dismissalType: 'Run Out',
      isStrikerOut: true,
      newBatsmanName: 'Axar',
    });
    expect(engine.firstInnings.totalWickets).toBe(1);
    expect(engine.firstInnings.fallOfWickets[0].dismissalType).toBe('Run Out');
  });

  it('5. Extras handling: Wide with 4 overthrows yields 5 runs and extra ball', () => {
    const engine = new EventSourcedMatchEngine({
      teamA: 'Team Extras',
      teamB: 'Team Bowling',
      tossWinner: 'Team Extras',
      tossDecision: 'Batting',
      totalOvers: 5,
      strikerName: 'B1',
      nonStrikerName: 'B2',
      bowlerName: 'Bw1',
    });

    engine.scoreBall({ runsScored: 4, isWide: true });

    const inn = engine.firstInnings;
    // 4 overthrows + 1 wide penalty = 5 total runs
    expect(inn.totalRuns).toBe(5);
    expect(inn.totalBalls).toBe(0); // Wide does NOT consume a legal ball
    expect(inn.bowlers[0].ballsBowled).toBe(0);
    expect(inn.bowlers[0].runs).toBe(5);
  });

  it('6. Byes and Leg-Byes are credited to team extras, NOT charged to bowler', () => {
    const engine = new EventSourcedMatchEngine({
      teamA: 'Team A',
      teamB: 'Team B',
      tossWinner: 'Team A',
      tossDecision: 'Batting',
      totalOvers: 5,
      strikerName: 'B1',
      nonStrikerName: 'B2',
      bowlerName: 'Bw1',
    });

    engine.scoreBall({ runsScored: 2, isByes: true });
    engine.scoreBall({ runsScored: 1, isLegByes: true });

    const inn = engine.firstInnings;
    expect(inn.totalRuns).toBe(3);
    expect(inn.byeRuns).toBe(2);
    expect(inn.lbRuns).toBe(1);
    expect(inn.bowlers[0].runs).toBe(0); // 0 runs charged to bowler!
    expect(inn.players[0].runs).toBe(0); // 0 runs credited to batter!
  });

  it('7. Retired Hurt vs Retired Out handling', () => {
    const engine = new EventSourcedMatchEngine({
      teamA: 'Team A',
      teamB: 'Team B',
      tossWinner: 'Team A',
      tossDecision: 'Batting',
      totalOvers: 5,
      strikerName: 'Pant',
      nonStrikerName: 'Rahul',
      bowlerName: 'Anderson',
    });

    // Retire Hurt Pant
    const success = engine.retirePlayer(true, 'Retire Hurt');
    expect(success).toBe(true);

    const inn = engine.firstInnings;
    // Retired Hurt does NOT count as a wicket
    expect(inn.totalWickets).toBe(0);
    expect(inn.fallOfWickets.length).toBe(1);
    expect(inn.fallOfWickets[0].dismissalType).toBe('Retire Hurt');
  });

  it('8. Tied match detection when defending score equals chasing score', () => {
    const engine = new EventSourcedMatchEngine({
      teamA: 'Team 1',
      teamB: 'Team 2',
      tossWinner: 'Team 1',
      tossDecision: 'Batting',
      totalOvers: 1,
      strikerName: 'B1',
      nonStrikerName: 'B2',
      bowlerName: 'Bowler 1',
    });

    // 1st innings: 10 runs
    engine.scoreBall({ runsScored: 6 });
    engine.scoreBall({ runsScored: 4 });
    engine.scoreBall({ runsScored: 0 });
    engine.scoreBall({ runsScored: 0 });
    engine.scoreBall({ runsScored: 0 });
    engine.scoreBall({ runsScored: 0 });

    expect(engine.firstInnings.totalRuns).toBe(10);

    // 2nd innings
    engine.startSecondInnings('Chaser 1', 'Chaser 2', 'Bowler 2');
    expect(engine.targetScore).toBe(11);

    // Chasing team scores exactly 10 runs (Tie)
    engine.scoreBall({ runsScored: 4 });
    engine.scoreBall({ runsScored: 6 });
    engine.scoreBall({ runsScored: 0 });
    engine.scoreBall({ runsScored: 0 });
    engine.scoreBall({ runsScored: 0 });
    engine.scoreBall({ runsScored: 0 }); // 6 balls bowled, 10 runs

    const result = engine.calculateResult();
    expect(result.isCompleted).toBe(true);
    expect(result.resultType).toBe('TIE');
    expect(result.resultText).toBe('Match Tied');
  });

  it('9. Rapid consecutive undo operations back to initial state without corruption', () => {
    const engine = new EventSourcedMatchEngine({
      teamA: 'Team Undo',
      teamB: 'Team Test',
      tossWinner: 'Team Undo',
      tossDecision: 'Batting',
      totalOvers: 5,
      strikerName: 'S1',
      nonStrikerName: 'S2',
      bowlerName: 'B1',
    });

    // 6 consecutive deliveries in over 1
    for (let i = 1; i <= 6; i++) {
      engine.scoreBall({ runsScored: 1 });
    }
    expect(engine.firstInnings.totalRuns).toBe(6);

    // 6 consecutive undos
    for (let i = 1; i <= 6; i++) {
      const ok = engine.undo();
      expect(ok).toBe(true);
    }
    expect(engine.firstInnings.totalRuns).toBe(0);
    expect(engine.firstInnings.totalBalls).toBe(0);

    // Undo past initial state safely returns false without crashing
    expect(engine.undo()).toBe(false);
  });

  it('10. Safely rejects malformed or empty payloads in restoreToIndexedDb', async () => {
    await expect(GoogleDriveService.restoreToIndexedDb(null)).rejects.toThrow();
    await expect(GoogleDriveService.restoreToIndexedDb({})).rejects.toThrow();
    await expect(GoogleDriveService.restoreToIndexedDb({ app: 'Random' })).rejects.toThrow();
  });
});
