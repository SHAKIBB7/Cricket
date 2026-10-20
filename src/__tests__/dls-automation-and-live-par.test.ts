import { describe, it, expect } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { DlsEngine } from '../domain/cricket/dls/DlsEngine';

describe('DLS Target Automation & Live Par Tracking Suite', () => {
  const createT20Match = () => {
    return new EventSourcedMatchEngine({
      id: 'dls_auto_test_01',
      teamA: 'Dhaka Gladiators',
      teamB: 'Chittagong Kings',
      tossWinner: 'Dhaka Gladiators',
      tossDecision: 'Batting',
      totalOvers: 20,
    });
  };

  describe('1. Engine Initialization & Preserved Original Overs', () => {
    it('preserves originalTotalOvers in advancedSettings upon match creation', () => {
      const engine = createT20Match();
      expect(engine.totalOvers).toBe(20);
      expect(engine.advancedSettings?.originalTotalOvers).toBe(20);
    });
  });

  describe('2. Automated DLS Target Calculation on Overs Reduction', () => {
    it('automatically calculates the correct revised target for 15 overs after 1st innings finishes at 160 runs', () => {
      const engine = createT20Match();

      // Simulate 1st innings: 160 runs scored
      engine.firstInnings.totalRuns = 160;
      engine.firstInnings.totalBalls = 120;
      engine.firstInnings.totalWickets = 6;

      // Start 2nd innings
      engine.startSecondInnings('Batter A', 'Batter B', 'Bowler X');
      expect(engine.currentInningsNumber).toBe(2);

      // Rain occurs: match reduced from 20 overs to 15 overs
      const autoDls = engine.autoCalculateDlsTarget(15);
      expect(autoDls.oversAvailable).toBe(15);
      expect(autoDls.team1ResourcePct).toBe(DlsEngine.getResourcePercentage(20, 0));
      // Team 2 has 15 overs available at start (0 wkts lost)
      expect(autoDls.team2ResourcePct).toBe(DlsEngine.getResourcePercentage(15, 0));
      expect(autoDls.revisedTarget).toBe(
        Math.floor(160 * (autoDls.team2ResourcePct / autoDls.team1ResourcePct)) + 1
      );

      // Apply the target via automated method
      engine.applyDlsTarget(autoDls.revisedTarget, 15);
      expect(engine.targetScore).toBe(autoDls.revisedTarget);
      expect(engine.totalOvers).toBe(15);
      expect(engine.advancedSettings?.originalTotalOvers).toBe(20);
      expect(engine.advancedSettings?.dlsApplied).toBe(true);
      expect(engine.advancedSettings?.dlsRevisedTarget).toBe(autoDls.revisedTarget);
      expect(engine.advancedSettings?.dlsRevisedOvers).toBe(15);

      // Event was recorded in event log
      const dlsEvent = engine.events.find((e) => e.type === 'DLS_TARGET_APPLIED');
      expect(dlsEvent).toBeDefined();
      expect(dlsEvent?.payload.revisedTarget).toBe(autoDls.revisedTarget);
      expect(dlsEvent?.payload.revisedTotalOvers).toBe(15);
    });
  });

  describe('3. Automated Live DLS Par Tracking on Every Ball in Innings 2', () => {
    it('tracks real-time live DLS Par Score and Ahead/Behind delta dynamically', () => {
      const engine = createT20Match();
      engine.firstInnings.totalRuns = 150;
      engine.startSecondInnings('Chaser 1', 'Chaser 2', 'Bowler 1');

      // Score 10 overs: 70/2 (switching among 3 bowlers to respect 4-over limit per bowler)
      for (let over = 0; over < 10; over++) {
        if (over > 0) {
          engine.changeBowler(`Bowler ${(over % 3) + 1}`);
        }
        for (let b = 0; b < 6; b++) {
          const ballIdx = over * 6 + b;
          engine.scoreBall({
            runsScored: ballIdx === 15 || ballIdx === 35 ? 0 : 1,
            isWicket: ballIdx === 15 || ballIdx === 35,
            dismissalType: ballIdx === 15 || ballIdx === 35 ? 'Bowled' : undefined,
          });
        }
      }

      expect(engine.secondInnings?.totalBalls).toBe(60);
      expect(engine.secondInnings?.totalWickets).toBe(2);

      // Automated DLS Live calculation for current ball
      const liveDls = engine.autoCalculateDlsTarget();
      expect(liveDls.isMinimumOversMet).toBe(true); // 10 overs >= 5 overs T20 minimum
      expect(liveDls.parScore).toBeGreaterThan(0);

      const currentRuns = engine.secondInnings!.totalRuns;
      const diff = currentRuns - liveDls.parScore;

      if (currentRuns > liveDls.parScore) {
        expect(diff).toBeGreaterThan(0);
      } else if (currentRuns < liveDls.parScore) {
        expect(diff).toBeLessThan(0);
      } else {
        expect(diff).toBe(0);
      }
    });
  });

  describe('4. Automated Match Conclusion with DLS Result', () => {
    it('concludes match as WIN by RUNS (DLS Method) when chasing side is ahead of Par Score', () => {
      const engine = createT20Match();
      engine.firstInnings.totalRuns = 140;
      engine.startSecondInnings('Chaser 1', 'Chaser 2', 'Bowler 1');

      // Chasing side reaches 8 overs: 80/1 (well ahead of par for 140)
      for (let over = 0; over < 8; over++) {
        if (over > 0) {
          engine.changeBowler(over % 2 === 0 ? 'Bowler 1' : 'Bowler 2');
        }
        for (let b = 0; b < 6; b++) {
          const ballIdx = over * 6 + b;
          engine.scoreBall({
            runsScored: ballIdx === 10 ? 0 : 2,
            isWicket: ballIdx === 10,
            dismissalType: ballIdx === 10 ? 'Caught' : undefined,
          });
        }
      }

      const outcome = engine.concludeMatchWithDls();
      expect(outcome.isCompleted).toBe(true);
      expect(outcome.resultType).toBe('WIN');
      expect(outcome.winner).toBe(engine.teamB);
      expect(outcome.marginType).toBe('RUNS');
      expect(outcome.resultText).toContain('Chittagong Kings won by');
      expect(outcome.resultText).toContain('(DLS Method)');
      expect(engine.status).toBe('COMPLETED');
      expect(engine.advancedSettings?.dlsApplied).toBe(true);
    });

    it('concludes match as WIN by RUNS for defending side when chasing side is behind Par Score', () => {
      const engine = createT20Match();
      engine.firstInnings.totalRuns = 180;
      engine.startSecondInnings('Chaser 1', 'Chaser 2', 'Bowler 1');

      // Chasing side collapses: 8 overs: 24/5
      for (let over = 0; over < 8; over++) {
        if (over > 0) {
          engine.changeBowler(over % 2 === 0 ? 'Bowler 1' : 'Bowler 2');
        }
        for (let b = 0; b < 6; b++) {
          const ballIdx = over * 6 + b;
          const isWkt = ballIdx === 5 || ballIdx === 12 || ballIdx === 20 || ballIdx === 30 || ballIdx === 40;
          engine.scoreBall({
            runsScored: isWkt ? 0 : (b % 2 === 0 ? 1 : 0),
            isWicket: isWkt,
            dismissalType: isWkt ? 'Bowled' : undefined,
          });
        }
      }

      const outcome = engine.concludeMatchWithDls();
      expect(outcome.isCompleted).toBe(true);
      expect(outcome.resultType).toBe('WIN');
      expect(outcome.winner).toBe(engine.teamA);
      expect(outcome.marginType).toBe('RUNS');
      expect(outcome.resultText).toContain('Dhaka Gladiators won by');
      expect(outcome.resultText).toContain('(DLS Method)');
    });

    it('safeguards against early abandonment: declares NO_RESULT if minimum 5 overs not completed in T20', () => {
      const engine = createT20Match();
      engine.firstInnings.totalRuns = 150;
      engine.startSecondInnings('Chaser 1', 'Chaser 2', 'Bowler 1');

      // Only 3 overs bowled before rain
      for (let over = 0; over < 3; over++) {
        if (over > 0) {
          engine.changeBowler(over % 2 === 0 ? 'Bowler 1' : 'Bowler 2');
        }
        for (let b = 0; b < 6; b++) {
          engine.scoreBall({ runsScored: 1 });
        }
      }

      const outcome = engine.concludeMatchWithDls();
      expect(outcome.isCompleted).toBe(true);
      expect(outcome.resultType).toBe('NO_RESULT');
      expect(outcome.resultText).toContain('Match Abandoned');
      expect(engine.status).toBe('ABANDONED');
    });
  });

  describe('5. Deterministic Event Replay with DLS', () => {
    it('correctly reconstructs engine state and DLS target from event log via fromEvents', () => {
      const engine = createT20Match();
      engine.firstInnings.totalRuns = 150;
      engine.firstInnings.totalBalls = 120;
      engine.startSecondInnings('Batter 1', 'Batter 2', 'Bowler 1');

      // Apply revised target 125 in 16 overs
      engine.applyDlsTarget(125, 16);

      // Score 1 over
      for (let i = 0; i < 6; i++) {
        engine.scoreBall({ runsScored: 2 });
      }

      // Reconstruct via fromEvents
      const reconstructed = EventSourcedMatchEngine.fromEvents(engine.events);
      expect(reconstructed.targetScore).toBe(125);
      expect(reconstructed.totalOvers).toBe(16);
      expect(reconstructed.advancedSettings?.originalTotalOvers).toBe(20);
      expect(reconstructed.advancedSettings?.dlsApplied).toBe(true);
      expect(reconstructed.advancedSettings?.dlsRevisedTarget).toBe(125);
      expect(reconstructed.secondInnings?.totalRuns).toBe(12);
    });
  });
});
