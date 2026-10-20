import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { MatchScorecard } from '../domain/cricket/types';
import { HapticFeedbackService } from '../infrastructure/haptics/HapticFeedbackService';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { ActiveBowlerTable } from '../components/scoring/ActiveBowlerTable';

describe('Phase 3: Super Over Engine, Haptics & Bowler Quota Alerts Suite', () => {
  describe('1. Super Over Tie-Breaker Engine & ICC Rules Enforcement', () => {
    const parentScorecard: MatchScorecard = {
      id: 'match_tied_parent_101',
      teamA: 'Barisal Bulls',
      teamB: 'Khulna Tigers',
      tossWinner: 'Barisal Bulls',
      tossDecision: 'Batting',
      totalOvers: 20,
      status: 'COMPLETED',
      currentInnings: 2,
      targetScore: 161,
      result: 'Match Tied',
      resultType: 'TIE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      firstInnings: {
        inningsNumber: 1,
        team: 'Barisal Bulls',
        bowlingTeam: 'Khulna Tigers',
        totalRuns: 160,
        totalWickets: 8,
        totalBalls: 120,
        oversString: '20.0',
        wideRuns: 4,
        nbRuns: 2,
        byeRuns: 0,
        lbRuns: 0,
        penaltyRuns: 0,
        penaltyRunsAgainst: 0,
        pastPartnerships: [],
        currentPartnership: { batter1: '', batter2: '', runs: 0, balls: 0 },
        isFreeHit: false,
        isOverComplete: true,
        strikerIdx: 0,
        nonStrikerIdx: 1,
        currentBowlerIdx: 0,
        nextPlayerIdx: 2,
        lastCompletedOverBowlerIdx: -1,
        players: [],
        bowlers: [],
        fallOfWickets: [],
        thisOverLog: [],
      },
      secondInnings: {
        inningsNumber: 2,
        team: 'Khulna Tigers',
        bowlingTeam: 'Barisal Bulls',
        totalRuns: 160,
        totalWickets: 9,
        totalBalls: 120,
        oversString: '20.0',
        wideRuns: 2,
        nbRuns: 0,
        byeRuns: 0,
        lbRuns: 0,
        penaltyRuns: 0,
        penaltyRunsAgainst: 0,
        pastPartnerships: [],
        currentPartnership: { batter1: '', batter2: '', runs: 0, balls: 0 },
        isFreeHit: false,
        isOverComplete: true,
        strikerIdx: 0,
        nonStrikerIdx: 1,
        currentBowlerIdx: 0,
        nextPlayerIdx: 2,
        lastCompletedOverBowlerIdx: -1,
        players: [],
        bowlers: [],
        fallOfWickets: [],
        thisOverLog: [],
      },
      advancedSettings: {
        players: 11,
        noBall: true,
        noBallReball: true,
        noBallRun: 1,
        wideBall: true,
        wideReball: true,
        wideRun: 1,
        isManualLimitEnabled: true,
        manualOverLimit: 4,
        maxOversPerBowler: 4,
      },
    };

    it('initializes a Super Over match with exactly 1 over and max 2 wickets', () => {
      const superEngine = EventSourcedMatchEngine.createSuperOverMatch({
        parentMatch: parentScorecard,
        strikerName: 'Mahmudullah',
        nonStrikerName: 'Mushfiqur',
        bowlerName: 'Nasum',
      });

      expect(superEngine.totalOvers).toBe(1);
      expect(superEngine.advancedSettings.isSuperOver).toBe(true);
      expect(superEngine.advancedSettings.parentMatchId).toBe('match_tied_parent_101');
      expect(superEngine.maxWickets).toBe(2);
      expect(superEngine.teamA).toBe('Khulna Tigers'); // Team that chased bats first
      expect(superEngine.teamB).toBe('Barisal Bulls');
    });

    it('enforces 2-wicket maximum: ends Super Over 1st innings when 2 wickets fall', () => {
      const superEngine = EventSourcedMatchEngine.createSuperOverMatch({
        parentMatch: parentScorecard,
        strikerName: 'Mahmudullah',
        nonStrikerName: 'Mushfiqur',
        bowlerName: 'Nasum',
      });

      // Ball 1: 4 runs
      superEngine.scoreBall({ runsScored: 4 });
      expect(superEngine.isInningsOver).toBe(false);

      // Ball 2: Wicket 1 (Bowled)
      superEngine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Bowled',
        newBatsmanName: 'Soumya',
      });
      expect(superEngine.currentInnings.totalWickets).toBe(1);
      expect(superEngine.isInningsOver).toBe(false);

      // Ball 3: Wicket 2 (Caught) -> Should END innings immediately (2 wickets all out!)
      superEngine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Caught',
        fielderName: 'Afif',
      });

      expect(superEngine.currentInnings.totalWickets).toBe(2);
      expect(superEngine.isInningsOver).toBe(true);
    });

    it('determines the Super Over winner by wickets when chasing side exceeds target', () => {
      const superEngine = EventSourcedMatchEngine.createSuperOverMatch({
        parentMatch: parentScorecard,
        strikerName: 'Mahmudullah',
        nonStrikerName: 'Mushfiqur',
        bowlerName: 'Nasum',
      });

      // 1st Innings: Khulna scores 10 runs in 6 balls
      superEngine.scoreBall({ runsScored: 2 });
      superEngine.scoreBall({ runsScored: 1 });
      superEngine.scoreBall({ runsScored: 0 });
      superEngine.scoreBall({ runsScored: 6 });
      superEngine.scoreBall({ runsScored: 1 });
      superEngine.scoreBall({ runsScored: 0 });

      expect(superEngine.currentInnings.totalRuns).toBe(10);
      expect(superEngine.isInningsOver).toBe(true);

      // Start 2nd Innings: Barisal needs 11 runs to win
      superEngine.startSecondInnings('Shakib', 'Tamim', 'Rubel');
      expect(superEngine.targetScore).toBe(11);

      // Ball 1: 6 runs
      superEngine.scoreBall({ runsScored: 6 });
      // Ball 2: 6 runs -> 12 runs, targets exceeded!
      superEngine.scoreBall({ runsScored: 6 });

      expect(superEngine.isMatchCompleted).toBe(true);
      const result = superEngine.calculateResult();
      expect(result.winner).toBe('Barisal Bulls');
      expect(result.resultType).toBe('WIN');
      expect(result.resultText).toContain('Barisal Bulls won');
    });
  });

  describe('2. Tactile Haptic Feedback Service', () => {
    it('executes safely in headless / non-navigator environments without throwing', () => {
      expect(() => HapticFeedbackService.light()).not.toThrow();
      expect(() => HapticFeedbackService.boundaryFour()).not.toThrow();
      expect(() => HapticFeedbackService.boundarySix()).not.toThrow();
      expect(() => HapticFeedbackService.wicket()).not.toThrow();
      expect(() => HapticFeedbackService.freeHit()).not.toThrow();
      expect(() => HapticFeedbackService.warning()).not.toThrow();
    });

    it('calls navigator.vibrate when navigator.vibrate API is available', () => {
      const vibrateMock = vi.fn();
      vi.stubGlobal('navigator', { vibrate: vibrateMock });

      HapticFeedbackService.light();
      expect(vibrateMock).toHaveBeenCalledWith(15);

      HapticFeedbackService.boundaryFour();
      expect(vibrateMock).toHaveBeenCalledWith([40, 50, 40]);

      HapticFeedbackService.boundarySix();
      expect(vibrateMock).toHaveBeenCalledWith([50, 40, 50, 40, 80]);

      HapticFeedbackService.wicket();
      expect(vibrateMock).toHaveBeenCalledWith([100, 60, 140]);

      vi.unstubAllGlobals();
    });
  });

  describe('3. ActiveBowlerTable Quota & Limits Display', () => {
    const mockBowler = {
      id: 'bowler_shakib',
      name: 'Shakib Al Hasan',
      ballsBowled: 24, // 4.0 overs
      maidens: 1,
      runs: 22,
      wickets: 3,
      overHistory: [],
    };

    it('displays max quota alert badge when bowler reaches over limit', () => {
      const html = renderToStaticMarkup(
        React.createElement(ActiveBowlerTable, {
          bowler: mockBowler as any,
          maxOversLimit: 4,
          onSelectBowler: () => {},
        })
      );

      expect(html).toContain('Quota Reached');
    });

    it('displays remaining quota badge when bowler is below limit', () => {
      const html = renderToStaticMarkup(
        React.createElement(ActiveBowlerTable, {
          bowler: { ...mockBowler, ballsBowled: 12 } as any, // 2 overs bowled
          maxOversLimit: 4,
          onSelectBowler: () => {},
        })
      );

      expect(html).toContain('Max 4 ov');
      expect(html).not.toContain('Quota Reached');
    });
  });
});
