import { describe, it, expect, beforeEach } from 'vitest';
import { BowlingLimiter } from '../domain/cricket/bowling-limiter/BowlingLimiter';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';

describe('Manual Bowling Limiter System', () => {
  describe('Rule 1: Matches Under 10 Overs', () => {
    it('automatically applies the default 4-over limit for 5, 6, 8, and 9 over matches', () => {
      // Prompt examples:
      // 5-over match -> Max 4 overs/bowler
      // 6-over match -> Max 4 overs/bowler
      // 8-over match -> Max 4 overs/bowler
      // 9-over match -> Max 4 overs/bowler
      expect(BowlingLimiter.calculateMaxOvers(5)).toBe(4);
      expect(BowlingLimiter.calculateMaxOvers(6)).toBe(4);
      expect(BowlingLimiter.calculateMaxOvers(8)).toBe(4);
      expect(BowlingLimiter.calculateMaxOvers(9)).toBe(4);
    });

    it('locks mode to "default" automatically for matches under 10 overs even if user specifies otherwise', () => {
      expect(BowlingLimiter.resolveMode(8, 'international')).toBe('default');
      expect(BowlingLimiter.resolveMode(5, 'custom')).toBe('default');
      expect(BowlingLimiter.calculateMaxOvers(8, { mode: 'custom', customMaxOvers: 2 })).toBe(4);
      expect(BowlingLimiter.calculateMaxOvers(6, { mode: 'international' })).toBe(4);
    });

    it('enforces 4-over limit in EventSourcedMatchEngine for matches under 10 overs', () => {
      const match8 = new EventSourcedMatchEngine({
        teamA: 'Team Alpha',
        teamB: 'Team Beta',
        tossWinner: 'Team Alpha',
        tossDecision: 'Batting',
        totalOvers: 8,
        bowlerName: 'Bowler One',
      });

      expect(match8.getMaxBowlerLimit()).toBe(4);
      expect(match8.advancedSettings.bowlingLimitMode).toBe('default');
      expect(match8.advancedSettings.maxOversPerBowler).toBe(4);
    });
  });

  describe('Rule 2 & 7: Boundary Condition (< 10 vs >= 10 Overs)', () => {
    it('strictly switches from automatic lock to selectable mode at 10 overs', () => {
      // 9 overs -> Locked to default (4 overs)
      expect(BowlingLimiter.resolveMode(9)).toBe('default');
      expect(BowlingLimiter.calculateMaxOvers(9)).toBe(4);

      // 10 overs -> Selectable, defaults to international rule
      expect(BowlingLimiter.resolveMode(10)).toBe('international');
      // 10 overs International -> ceil(10 / 5) = 2 overs
      expect(BowlingLimiter.calculateMaxOvers(10, { mode: 'international' })).toBe(2);

      // 11 overs -> Selectable
      expect(BowlingLimiter.resolveMode(11)).toBe('international');

      // 20 overs -> Selectable
      expect(BowlingLimiter.resolveMode(20)).toBe('international');

      // 50 overs -> Selectable
      expect(BowlingLimiter.resolveMode(50)).toBe('international');
    });
  });

  describe('Rule 3: International Rule for Matches >= 10 Overs', () => {
    it('dynamically calculates max overs per bowler as ceil(totalOvers / 5)', () => {
      // 10 overs -> 2 overs
      expect(BowlingLimiter.calculateMaxOvers(10, { mode: 'international' })).toBe(2);

      // 11 overs -> 3 overs (one additional over allowed per ICC Playing Conditions)
      expect(BowlingLimiter.calculateMaxOvers(11, { mode: 'international' })).toBe(3);

      // 15 overs -> 3 overs
      expect(BowlingLimiter.calculateMaxOvers(15, { mode: 'international' })).toBe(3);

      // 20 overs -> 4 overs (Standard T20)
      expect(BowlingLimiter.calculateMaxOvers(20, { mode: 'international' })).toBe(4);

      // 25 overs -> 5 overs
      expect(BowlingLimiter.calculateMaxOvers(25, { mode: 'international' })).toBe(5);

      // 50 overs -> 10 overs (Standard ODI)
      expect(BowlingLimiter.calculateMaxOvers(50, { mode: 'international' })).toBe(10);
    });

    it('integrates International Rule dynamically into EventSourcedMatchEngine', () => {
      const t20Match = new EventSourcedMatchEngine({
        teamA: 'Team Alpha',
        teamB: 'Team Beta',
        tossWinner: 'Team Alpha',
        tossDecision: 'Batting',
        totalOvers: 20,
        advancedSettings: { bowlingLimitMode: 'international' },
      });
      expect(t20Match.getMaxBowlerLimit()).toBe(4);
      expect(t20Match.advancedSettings.bowlingLimitMode).toBe('international');
      expect(t20Match.advancedSettings.maxOversPerBowler).toBe(4);

      const odiMatch = new EventSourcedMatchEngine({
        teamA: 'Team Alpha',
        teamB: 'Team Beta',
        tossWinner: 'Team Alpha',
        tossDecision: 'Batting',
        totalOvers: 50,
        advancedSettings: { bowlingLimitMode: 'international' },
      });
      expect(odiMatch.getMaxBowlerLimit()).toBe(10);
      expect(odiMatch.advancedSettings.maxOversPerBowler).toBe(10);

      const tenOverMatch = new EventSourcedMatchEngine({
        teamA: 'Team Alpha',
        teamB: 'Team Beta',
        tossWinner: 'Team Alpha',
        tossDecision: 'Batting',
        totalOvers: 10,
        advancedSettings: { bowlingLimitMode: 'international' },
      });
      expect(tenOverMatch.getMaxBowlerLimit()).toBe(2);
    });
  });

  describe('Rule 4: Default Rule for Matches >= 10 Overs', () => {
    it('applies application configured default of 4 overs consistently across match lengths', () => {
      expect(BowlingLimiter.calculateMaxOvers(10, { mode: 'default' })).toBe(4);
      expect(BowlingLimiter.calculateMaxOvers(20, { mode: 'default' })).toBe(4);
      expect(BowlingLimiter.calculateMaxOvers(50, { mode: 'default' })).toBe(4);
    });

    it('preserves Default Rule in EventSourcedMatchEngine', () => {
      const match = new EventSourcedMatchEngine({
        teamA: 'Team Alpha',
        teamB: 'Team Beta',
        tossWinner: 'Team Alpha',
        tossDecision: 'Batting',
        totalOvers: 20,
        advancedSettings: { bowlingLimitMode: 'default' },
      });
      expect(match.getMaxBowlerLimit()).toBe(4);
      expect(match.advancedSettings.bowlingLimitMode).toBe('default');
      expect(match.advancedSettings.maxOversPerBowler).toBe(4);
    });
  });

  describe('Rule 5: Custom / Manual Rule for Matches >= 10 Overs', () => {
    it('respects user specified maximum overs per bowler clamped to valid limits', () => {
      expect(BowlingLimiter.calculateMaxOvers(10, { mode: 'custom', customMaxOvers: 3 })).toBe(3);
      expect(BowlingLimiter.calculateMaxOvers(20, { mode: 'custom', customMaxOvers: 5 })).toBe(5);
      expect(BowlingLimiter.calculateMaxOvers(20, { mode: 'custom', customMaxOvers: 7 })).toBe(7);

      // Clamping: cannot exceed total match overs
      expect(BowlingLimiter.calculateMaxOvers(10, { mode: 'custom', customMaxOvers: 15 })).toBe(10);
      // Clamping: cannot be less than 1
      expect(BowlingLimiter.calculateMaxOvers(10, { mode: 'custom', customMaxOvers: 0 })).toBe(4);
    });

    it('enforces custom over limit in EventSourcedMatchEngine', () => {
      const match = new EventSourcedMatchEngine({
        teamA: 'Team Alpha',
        teamB: 'Team Beta',
        tossWinner: 'Team Alpha',
        tossDecision: 'Batting',
        totalOvers: 12,
        advancedSettings: {
          bowlingLimitMode: 'custom',
          manualOverLimit: 3,
        },
      });
      expect(match.getMaxBowlerLimit()).toBe(3);
      expect(match.advancedSettings.bowlingLimitMode).toBe('custom');
      expect(match.advancedSettings.maxOversPerBowler).toBe(3);
    });
  });

  describe('Rule 6: Live Match Validation & Over Quota Enforcement', () => {
    let engine: EventSourcedMatchEngine;

    beforeEach(() => {
      // 8-over match -> Automatic 4-over limit per bowler
      engine = new EventSourcedMatchEngine({
        teamA: 'Team Alpha',
        teamB: 'Team Beta',
        tossWinner: 'Team Alpha',
        tossDecision: 'Batting',
        totalOvers: 8,
        strikerName: 'Batter 1',
        nonStrikerName: 'Batter 2',
        bowlerName: 'Bowler A',
      });
    });

    it('allows a bowler to bowl within their maximum allowed limit', () => {
      expect(engine.getMaxBowlerLimit()).toBe(4);
      expect(engine.canBowlerBowl('Bowler A')).toBe(true);
      expect(engine.validateBowlerSelection('Bowler A').allowed).toBe(true);
    });

    it('blocks a bowler from bowling consecutive back-to-back overs', () => {
      // Complete Over 1 with Bowler A (6 balls)
      for (let i = 0; i < 6; i++) {
        engine.scoreBall({ runsScored: 0 });
      }

      expect(engine.currentInnings.isOverComplete).toBe(true);
      expect(engine.canBowlerBowl('Bowler A')).toBe(false);

      const validation = engine.validateBowlerSelection('Bowler A');
      expect(validation.allowed).toBe(false);
      expect(validation.reason).toContain('cannot bowl consecutive overs');
    });

    it('blocks a bowler once they have reached their maximum allowed overs', () => {
      // Bowler A bowls over 1 (balls 1-6)
      for (let i = 0; i < 6; i++) {
        engine.scoreBall({ runsScored: 0 });
      }

      // Switch to Bowler B for over 2
      expect(engine.changeBowler('Bowler B').success).toBe(true);
      for (let i = 0; i < 6; i++) {
        engine.scoreBall({ runsScored: 0 });
      }

      // Switch back to Bowler A for over 3 (now 2.0 ov bowled by Bowler A)
      expect(engine.changeBowler('Bowler A').success).toBe(true);
      for (let i = 0; i < 6; i++) {
        engine.scoreBall({ runsScored: 0 });
      }

      // Switch to Bowler B for over 4
      expect(engine.changeBowler('Bowler B').success).toBe(true);
      for (let i = 0; i < 6; i++) {
        engine.scoreBall({ runsScored: 0 });
      }

      // Switch back to Bowler A for over 5 (now 3.0 ov bowled by Bowler A)
      expect(engine.changeBowler('Bowler A').success).toBe(true);
      for (let i = 0; i < 6; i++) {
        engine.scoreBall({ runsScored: 0 });
      }

      // Switch to Bowler B for over 6
      expect(engine.changeBowler('Bowler B').success).toBe(true);
      for (let i = 0; i < 6; i++) {
        engine.scoreBall({ runsScored: 0 });
      }

      // Switch back to Bowler A for over 7 (now 4.0 ov bowled by Bowler A)
      expect(engine.changeBowler('Bowler A').success).toBe(true);
      for (let i = 0; i < 6; i++) {
        engine.scoreBall({ runsScored: 0 });
      }

      // Bowler A has now completed 4 overs (24 legal balls) = MAX LIMIT REACHED!
      const bowlerA = engine.currentInnings.bowlers.find((b) => b.name === 'Bowler A');
      expect(bowlerA?.ballsBowled).toBe(24);
      expect(Math.floor(bowlerA!.ballsBowled / 6)).toBe(4);

      // Now Bowler A must be BLOCKED
      expect(engine.canBowlerBowl('Bowler A')).toBe(false);

      const validation = engine.validateBowlerSelection('Bowler A');
      expect(validation.allowed).toBe(false);
      expect(validation.reason).toContain('maximum allowed limit');

      // Attempting to change to Bowler A must fail
      const changeRes = engine.changeBowler('Bowler A');
      expect(changeRes.success).toBe(false);
      expect(changeRes.reason).toContain('maximum allowed limit');
    });
  });

  describe('Rule 9: Data & Match Integrity', () => {
    it('persists bowlingLimitMode and maxOversPerBowler into MatchScorecard', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Team Alpha',
        teamB: 'Team Beta',
        tossWinner: 'Team Alpha',
        tossDecision: 'Batting',
        totalOvers: 20,
        advancedSettings: {
          bowlingLimitMode: 'international',
        },
      });

      const scorecard = engine.toScorecard();
      expect(scorecard.advancedSettings.bowlingLimitMode).toBe('international');
      expect(scorecard.advancedSettings.maxOversPerBowler).toBe(4);
    });

    it('reconstructs EventSourcedMatchEngine from Scorecard preserving bowling limiter configuration', () => {
      const original = new EventSourcedMatchEngine({
        teamA: 'Team Alpha',
        teamB: 'Team Beta',
        tossWinner: 'Team Alpha',
        tossDecision: 'Batting',
        totalOvers: 15,
        advancedSettings: {
          bowlingLimitMode: 'custom',
          manualOverLimit: 5,
        },
      });

      const scorecard = original.toScorecard();

      const reconstructed = new EventSourcedMatchEngine({
        id: scorecard.id,
        teamA: scorecard.teamA,
        teamB: scorecard.teamB,
        tossWinner: scorecard.tossWinner,
        tossDecision: scorecard.tossDecision,
        totalOvers: scorecard.totalOvers,
        advancedSettings: scorecard.advancedSettings,
      });

      expect(reconstructed.getMaxBowlerLimit()).toBe(5);
      expect(reconstructed.advancedSettings.bowlingLimitMode).toBe('custom');
      expect(reconstructed.advancedSettings.maxOversPerBowler).toBe(5);
    });

    it('supports backward compatibility for legacy matches without bowlingLimitMode', () => {
      // Legacy match with only isManualLimitEnabled: true and manualOverLimit: 3
      const legacyMatch = new EventSourcedMatchEngine({
        teamA: 'Team Alpha',
        teamB: 'Team Beta',
        tossWinner: 'Team Alpha',
        tossDecision: 'Batting',
        totalOvers: 20,
        advancedSettings: {
          isManualLimitEnabled: true,
          manualOverLimit: 3,
        },
      });

      expect(legacyMatch.getMaxBowlerLimit()).toBe(3);
      expect(legacyMatch.advancedSettings.bowlingLimitMode).toBe('custom');
      expect(legacyMatch.advancedSettings.maxOversPerBowler).toBe(3);
    });
  });
});
