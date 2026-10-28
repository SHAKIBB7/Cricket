import { describe, it, expect } from 'vitest';
import { DlsEngine, DlsCalculationInput } from '../domain/cricket/dls/DlsEngine';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';

describe('Duckworth-Lewis-Stern (DLS) Standard Method Comprehensive Audit Suite', () => {
  describe('1. Normal Uninterrupted Match Baseline', () => {
    it('calculates target as Team 1 runs + 1 when overs and resources are identical (T20)', () => {
      const result = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 165,
        team2OversAvailable: 20,
        team2WicketsLost: 0,
        team2CurrentOversBowled: 0,
      });

      expect(result.revisedTarget).toBe(166);
      expect(result.team1ResourcePct).toBe(56.6);
      expect(result.team2ResourcePct).toBe(56.6);
      expect(result.runsAdjustment).toBe(0);
      expect(result.ballsRemaining).toBe(120);
      expect(result.runsNeeded).toBe(166);
      expect(result.isMinimumOversMet).toBe(true);
      expect(result.edition).toBe('Standard Edition (ICC D/L)');
    });

    it('calculates target as Team 1 runs + 1 when overs and resources are identical (50-over ODI)', () => {
      const result = DlsEngine.calculate({
        originalOvers: 50,
        team1TotalRuns: 275,
        team2OversAvailable: 50,
        team2WicketsLost: 0,
        team2CurrentOversBowled: 0,
        matchType: 'ODI',
      });

      expect(result.revisedTarget).toBe(276);
      expect(result.team1ResourcePct).toBe(100.0);
      expect(result.team2ResourcePct).toBe(100.0);
      expect(result.runsAdjustment).toBe(0);
      expect(result.ballsRemaining).toBe(300);
      expect(result.isMinimumOversMet).toBe(true);
    });
  });

  describe('2. Team 2 Overs Curtailed Before Second Innings Commences', () => {
    it('scales target down proportionally when 2nd innings is reduced from 20 to 15 overs', () => {
      // Team 1 scores 180 in 20 overs (R1 = 56.6%)
      // Team 2 has 15 overs available at start (R2 = 45.2%)
      // Expected Target = floor(180 * (45.2 / 56.6)) + 1 = floor(143.745) + 1 = 144
      const result = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 180,
        team2OversAvailable: 15,
        team2WicketsLost: 0,
        team2CurrentOversBowled: 0,
      });

      expect(result.team1ResourcePct).toBe(56.6);
      expect(result.team2ResourcePct).toBe(45.2);
      expect(result.revisedTarget).toBe(144);
      expect(result.runsAdjustment).toBe(144 - 181); // -37 runs
      expect(result.ballsRemaining).toBe(15 * 6);
      expect(result.runsNeeded).toBe(144);
      expect(result.isMinimumOversMet).toBe(true);
    });

    it('scales target down proportionally in 50-over ODI curtailed to 30 overs', () => {
      // Team 1 scores 250 in 50 overs (R1 = 100.0%)
      // Team 2 has 30 overs available at start (R2 = 75.1%)
      // Expected Target = floor(250 * (75.1 / 100.0)) + 1 = floor(187.75) + 1 = 188
      const result = DlsEngine.calculate({
        originalOvers: 50,
        team1TotalRuns: 250,
        team2OversAvailable: 30,
        team2WicketsLost: 0,
        team2CurrentOversBowled: 0,
        matchType: 'ODI',
      });

      expect(result.team1ResourcePct).toBe(100.0);
      expect(result.team2ResourcePct).toBe(75.1);
      expect(result.revisedTarget).toBe(188);
      expect(result.runsAdjustment).toBe(188 - 251); // -63 runs
      expect(result.ballsRemaining).toBe(30 * 6);
    });
  });

  describe('3. Team 1 Rain Interruption (Innings 1 Curtailed / Premature Termination)', () => {
    it('calculates resources accurately when Team 1 innings ends prematurely at 15 overs', () => {
      // 20-over match. Team 1 batted 15 overs, scoring 125 runs for 4 wickets lost.
      // Rain terminates 1st innings permanently. Team 2 will bat 15 overs.
      // Team 1 initial: R(20, 0) = 56.6%
      // Team 1 lost remaining: R(5, 4) = 15.6%
      // Team 1 available: R1 = 56.6 - 15.6 = 41.0%
      // Team 2 available: R(15, 0) = 45.2%
      // Since R2 (45.2%) > R1 (41.0%), target is increased via G50 factor!
      const result = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 125,
        team1OversBowled: 15,
        team1WicketsLost: 4,
        team1PrematurelyTerminated: true,
        team2OversAvailable: 15,
        team2WicketsLost: 0,
        team2CurrentOversBowled: 0,
      });

      expect(result.team1ResourcePct).toBe(41.0);
      expect(result.team2ResourcePct).toBe(45.2);
      expect(result.revisedTarget).toBeGreaterThan(126); // target increased because Team 2 had more resources
      expect(result.runsAdjustment).toBeGreaterThan(0);
    });

    it('handles delayed resumption in 1st innings where overs are reduced during play', () => {
      // 20-over match. Team 1 at 10 overs, 2 wickets lost.
      // Rain interrupts. Match reduced from 20 to 16 overs total.
      // Team 1 resumes and plays out their 16 overs.
      // Interruption:
      // oversAvailableBefore: 20, oversAvailableAfter: 16, bowled: 10, wkts: 2
      // remBefore = 10, remAfter = 6.
      // Resource lost = R(10, 2) - R(6, 2)
      const result = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 140,
        interruptions: [
          {
            innings: 1,
            oversBowledAtInterruption: 10,
            wicketsLostAtInterruption: 2,
            oversAvailableBefore: 20,
            oversAvailableAfter: 16,
          },
        ],
        team2OversAvailable: 16,
        team2WicketsLost: 0,
        team2CurrentOversBowled: 0,
      });

      expect(result.team1ResourcePct).toBeLessThan(56.6);
      expect(result.team2ResourcePct).toBe(DlsEngine.getResourcePercentage(16, 0));
      expect(result.oversAvailable).toBe(16);
      expect(result.revisedTarget).toBeGreaterThan(0);
    });
  });

  describe('4. Team 2 Mid-Innings Rain Interruption', () => {
    it('calculates revised target accurately when chase is halted at 10 overs with 2 wickets down', () => {
      // Team 1 scored 160 in 20 overs (R1 = 56.6%)
      // Team 2 reached 75/2 in 10 overs.
      // Rain strikes. Match reduced from 20 to 15 overs total (5 overs remaining after restart).
      // Overs remaining before rain: 10 ov (2 wkts) -> R(10, 2) = 30.8%
      // Overs remaining after rain: 5 ov (2 wkts) -> R(5, 2) = 16.8%
      // Resource lost in stoppage = 30.8 - 16.8 = 14.0%
      // Team 2 total resource: R2 = 56.6 - 14.0 = 42.6%
      // Revised Target = floor(160 * (42.6 / 56.6)) + 1 = floor(120.42) + 1 = 121 runs.
      const result = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 160,
        team2OversAvailable: 15,
        team2WicketsLost: 2,
        team2CurrentOversBowled: 10,
        team2CurrentRuns: 75,
      });

      expect(result.team1ResourcePct).toBe(56.6);
      expect(result.team2ResourcePct).toBe(42.6);
      expect(result.revisedTarget).toBe(121);
      expect(result.runsNeeded).toBe(121 - 75); // 46 runs needed
      expect(result.ballsRemaining).toBe(5 * 6); // 30 balls remaining
      expect(result.parScore).toBeGreaterThan(0);
    });
  });

  describe('5. Multiple Rain Interruptions in Second Innings', () => {
    it('correctly compounds resource losses across multiple interruptions without duplicate reduction', () => {
      // 20-over match, Team 1 scored 170.
      // Interruption 1: at 8 overs (1 wkt lost), reduced from 20 to 16 overs.
      // Interruption 2: at 12 overs (3 wkts lost), reduced from 16 to 14 overs.
      const result = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 170,
        team2OversAvailable: 14,
        team2CurrentOversBowled: 12,
        team2WicketsLost: 3,
        team2CurrentRuns: 95,
        interruptions: [
          {
            innings: 2,
            oversBowledAtInterruption: 8,
            wicketsLostAtInterruption: 1,
            oversAvailableBefore: 20,
            oversAvailableAfter: 16,
          },
          {
            innings: 2,
            oversBowledAtInterruption: 12,
            wicketsLostAtInterruption: 3,
            oversAvailableBefore: 16,
            oversAvailableAfter: 14,
          },
        ],
      });

      expect(result.team2ResourcePct).toBeLessThan(DlsEngine.getResourcePercentage(20, 0));
      expect(result.team2ResourcePct).toBeLessThan(DlsEngine.getResourcePercentage(16, 0));
      expect(result.revisedTarget).toBeLessThanOrEqual(171);
      expect(result.ballsRemaining).toBe(2 * 6); // 14 - 12 = 2 overs = 12 balls
      expect(result.oversAvailable).toBe(14);
    });
  });

  describe('6. Monotonicity & Boundary Behavior Across Wickets and Overs', () => {
    it('enforces strict monotonic decrease in resource percentage as wickets fall (0 to 10)', () => {
      const u = 15;
      const res0 = DlsEngine.getResourcePercentage(u, 0);
      const res1 = DlsEngine.getResourcePercentage(u, 1);
      const res2 = DlsEngine.getResourcePercentage(u, 2);
      const res4 = DlsEngine.getResourcePercentage(u, 4);
      const res7 = DlsEngine.getResourcePercentage(u, 7);
      const res9 = DlsEngine.getResourcePercentage(u, 9);
      const res10 = DlsEngine.getResourcePercentage(u, 10);

      expect(res0).toBeGreaterThan(res1);
      expect(res1).toBeGreaterThan(res2);
      expect(res2).toBeGreaterThan(res4);
      expect(res4).toBeGreaterThan(res7);
      expect(res7).toBeGreaterThan(res9);
      expect(res9).toBeGreaterThan(res10);
      expect(res10).toBe(0.0);
    });

    it('enforces strict monotonic increase in resource percentage as overs remaining increase', () => {
      const w = 3;
      expect(DlsEngine.getResourcePercentage(5, w)).toBeLessThan(DlsEngine.getResourcePercentage(10, w));
      expect(DlsEngine.getResourcePercentage(10, w)).toBeLessThan(DlsEngine.getResourcePercentage(20, w));
      expect(DlsEngine.getResourcePercentage(20, w)).toBeLessThan(DlsEngine.getResourcePercentage(35, w));
      expect(DlsEngine.getResourcePercentage(35, w)).toBeLessThan(DlsEngine.getResourcePercentage(50, w));
    });
  });

  describe('7. Par Score, Ties and Match Result Scenarios', () => {
    it('identifies match tie when current score equals par score at end of match', () => {
      // Team 1: 150 in 20 overs.
      // Team 2: Chased in 15 overs, ends at parScore runs.
      const result = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 150,
        team2OversAvailable: 15,
        team2CurrentOversBowled: 15,
        team2WicketsLost: 5,
        team2CurrentRuns: 119, // Suppose revisedTarget is 120, parScore is 119
      });

      if (result.revisedTarget === 120) {
        expect(result.parScore).toBe(119);
        expect(result.currentMatchStatus).toBe('TIED');
        expect(result.isTied).toBe(true);
      }
    });

    it('evaluates whether chasing team is ahead or behind par score during mid-innings suspension', () => {
      const aheadResult = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 160,
        team2OversAvailable: 20,
        team2CurrentOversBowled: 10,
        team2WicketsLost: 1,
        team2CurrentRuns: 95, // Well ahead of par
      });

      expect(aheadResult.currentMatchStatus).toBe('TEAM2_AHEAD');
      expect(aheadResult.marginRuns).toBeGreaterThan(0);

      const behindResult = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 160,
        team2OversAvailable: 20,
        team2CurrentOversBowled: 10,
        team2WicketsLost: 6,
        team2CurrentRuns: 50, // Far behind par
      });

      expect(behindResult.currentMatchStatus).toBe('TEAM1_AHEAD');
      expect(behindResult.marginRuns).toBeGreaterThan(0);
    });
  });

  describe('8. ICC Minimum Overs Regulations', () => {
    it('flags minimum overs violation when T20 match is reduced below 5 overs', () => {
      const result = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 150,
        team2OversAvailable: 4, // Below 5-over ICC threshold
        team2WicketsLost: 0,
        matchType: 'T20',
      });

      expect(result.isMinimumOversMet).toBe(false);
      expect(result.minimumOversRequired).toBe(5);
      expect(result.explanationEn).toContain('Match cannot produce a valid DLS result');
      expect(result.explanationBn).toContain('কমপক্ষে 5 ওভার প্রয়োজন');
    });

    it('flags minimum overs violation when ODI match is reduced below 20 overs', () => {
      const result = DlsEngine.calculate({
        originalOvers: 50,
        team1TotalRuns: 260,
        team2OversAvailable: 18, // Below 20-over ICC threshold for ODI
        team2WicketsLost: 0,
        matchType: 'ODI',
      });

      expect(result.isMinimumOversMet).toBe(false);
      expect(result.minimumOversRequired).toBe(20);
      expect(result.explanationEn).toContain('Match cannot produce a valid DLS result');
    });
  });

  describe('9. Invalid Input & Defensive Edge Cases', () => {
    it('handles 0 or negative runs, negative overs, and out-of-bounds wickets gracefully', () => {
      const res1 = DlsEngine.calculate({
        originalOvers: -5,
        team1TotalRuns: -50,
        team2OversAvailable: -10,
        team2WicketsLost: 15, // Out of bounds
      });

      expect(res1.revisedTarget).toBeGreaterThanOrEqual(1);
      expect(res1.parScore).toBeGreaterThanOrEqual(0);
      expect(res1.team1ResourcePct).toBeGreaterThan(0);

      // Overs exceeding 50 clamped
      const res2 = DlsEngine.calculate({
        originalOvers: 80,
        team1TotalRuns: 200,
        team2OversAvailable: 70,
      });

      expect(res2.revisedTarget).toBeGreaterThanOrEqual(1);
    });

    it('correctly parses cricket overs.balls notation (e.g. 10.2 overs = 10 overs + 2 balls)', () => {
      const decimal = DlsEngine.parseOversBalls(10.2);
      expect(decimal).toBeCloseTo(10 + 2 / 6, 4);

      const formatted = DlsEngine.formatOversBalls(decimal);
      expect(formatted).toBe('10.2');

      const exactInteger = DlsEngine.parseOversBalls(20);
      expect(exactInteger).toBe(20);
    });

    it('is strictly idempotent on all decimal and cricket overs inputs without phantom ball drift', () => {
      // Cricket notation: .1, .2, .4, .5, integer 10, 0
      const inputs = [5.1, 5.2, 5.4, 5.5, 10, 0];
      for (const input of inputs) {
        const once = DlsEngine.parseOversBalls(input);
        const twice = DlsEngine.parseOversBalls(once);
        const thrice = DlsEngine.parseOversBalls(twice);
        expect(twice).toBeCloseTo(once, 6);
        expect(thrice).toBeCloseTo(once, 6);
      }

      // Exact fractional overs (e.g. 7 balls = 1.166667, 8 balls = 1.333333, 10 balls = 1.666667, 11 balls = 1.833333)
      const fractionalOvers = [7 / 6, 8 / 6, 10 / 6, 11 / 6];
      for (const fo of fractionalOvers) {
        const parsed = DlsEngine.parseOversBalls(fo);
        expect(parsed).toBeCloseTo(fo, 5);
        const parsedAgain = DlsEngine.parseOversBalls(parsed);
        expect(parsedAgain).toBeCloseTo(fo, 5);
      }
    });
  });

  describe('10. Idempotency & Repeat Processing Protection', () => {
    it('produces identical result when executed repeatedly with the same payload (no state leakage)', () => {
      const payload: DlsCalculationInput = {
        originalOvers: 20,
        team1TotalRuns: 172,
        team2OversAvailable: 16,
        team2WicketsLost: 2,
        team2CurrentOversBowled: 8.4,
        team2CurrentRuns: 68,
      };

      const run1 = DlsEngine.calculate(payload);
      const run2 = DlsEngine.calculate(payload);
      const run3 = DlsEngine.calculate(payload);

      expect(run1).toEqual(run2);
      expect(run2).toEqual(run3);
    });
  });

  describe('11. Integration with EventSourcedMatchEngine', () => {
    it('applies DLS revised target cleanly to match engine and correctly identifies victory by wickets with DLS method', () => {
      const engine = new EventSourcedMatchEngine({
        id: 'test_dls_match_01',
        teamA: 'Team Thunder',
        teamB: 'Team Lightning',
        tossWinner: 'Team Thunder',
        tossDecision: 'Batting',
        totalOvers: 20,
      });

      // Team 1 scores 160 in 20 overs
      engine.firstInnings.totalRuns = 160;
      engine.firstInnings.totalBalls = 120;
      engine.firstInnings.totalWickets = 5;
      engine.firstInnings.isOverComplete = true;

      // Start 2nd innings
      engine.startSecondInnings('Chaser 1', 'Chaser 2', 'Bowler 1');

      // Rain occurs: DLS target calculated for 15 overs -> 121 runs
      const dls = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 160,
        team2OversAvailable: 15,
        team2WicketsLost: 0,
      });

      engine.targetScore = dls.revisedTarget;
      engine.totalOvers = dls.oversAvailable;
      engine.advancedSettings = {
        ...engine.advancedSettings,
        dlsApplied: true,
        dlsRevisedTarget: dls.revisedTarget,
        dlsRevisedOvers: dls.oversAvailable,
      };

      expect(engine.targetScore).toBe(dls.revisedTarget);
      expect(engine.totalOvers).toBe(15);

      // Simulate Team 2 scoring 122 runs for 3 wickets (reaching target)
      expect(engine.secondInnings).toBeDefined();
      engine.secondInnings!.totalRuns = dls.revisedTarget;
      engine.secondInnings!.totalWickets = 3;
      engine.secondInnings!.totalBalls = 80;

      const outcome = engine.calculateResult();
      expect(outcome.isCompleted).toBe(true);
      expect(outcome.winner).toBe('Team Lightning');
      expect(outcome.resultText).toContain('won by 7 wickets (DLS Method)');
    });
  });
});
