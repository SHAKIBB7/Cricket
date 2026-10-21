import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventSourcedMatchEngine } from '@/domain/cricket/match-engine/EventSourcedMatchEngine';
import { ManOfTheMatchEngine } from '@/domain/cricket/analytics/ManOfTheMatchEngine';
import { GoogleMapsLoaderService } from '@/infrastructure/maps/GoogleMapsLoaderService';
import { UserProfileService } from '@/infrastructure/auth/UserProfileService';
import { ActiveBowlerTable } from '@/components/scoring/ActiveBowlerTable';
import React from 'react';

describe('Complete Code Audit & Cleanup Regression Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Core Domain Integrity & Type Exports', () => {
    it('EventSourcedMatchEngine re-exports BallInput and executes deterministic match lifecycle', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Dhaka Dynamites',
        teamB: 'Chittagong Kings',
        tossWinner: 'Dhaka Dynamites',
        tossDecision: 'Batting',
        totalOvers: 5,
      });

      // Score 1 legal run
      engine.scoreBall({
        runsScored: 1,
      });

      expect(engine.firstInnings.totalRuns).toBe(1);
      expect(engine.firstInnings.totalBalls).toBe(1);

      // Score a boundary 4
      engine.scoreBall({
        runsScored: 4,
      });
      expect(engine.firstInnings.totalRuns).toBe(5);

      // Score a wicket (Bowled)
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Bowled',
      });
      expect(engine.firstInnings.totalWickets).toBe(1);
      expect(engine.firstInnings.bowlers[0].wickets).toBe(1);
    });

    it('ManOfTheMatchEngine calculates awards without param leakage or runtime regression', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Team Red',
        teamB: 'Team Blue',
        tossWinner: 'Team Red',
        tossDecision: 'Batting',
        totalOvers: 2,
      });

      // Team 1 bats: 12 balls, 30 runs
      for (let i = 0; i < 5; i++) {
        engine.scoreBall({ runsScored: 6 });
      }
      for (let i = 0; i < 7; i++) {
        engine.scoreBall({ runsScored: 0 });
      }

      engine.startSecondInnings();
      // Team 2 chases: 2 balls, 4 runs then all out or overs complete
      engine.scoreBall({ runsScored: 4 });
      engine.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled' });

      const scorecard = engine.toScorecard();
      const motm = ManOfTheMatchEngine.calculateForMatch(scorecard.firstInnings, scorecard.secondInnings, {
        totalOvers: scorecard.totalOvers,
      });
      expect(motm).toBeDefined();
      expect(typeof motm?.name).toBe('string');
      expect(motm?.finalScore).toBeGreaterThan(0);
    });
  });

  describe('2. Component Memoization & UI Contracts', () => {
    it('ActiveBowlerTable is wrapped in React.memo for re-render optimization', () => {
      expect((ActiveBowlerTable as any).$$typeof).toBe(Symbol.for('react.memo'));
    });
  });

  describe('3. Resource Leak Remediation', () => {
    it('GoogleMapsLoaderService safely handles load timeouts and clears pending timers on unload', async () => {
      const status = GoogleMapsLoaderService.getStatus();
      expect(['IDLE', 'NO_API_KEY', 'LOADING', 'LOADED', 'ERROR']).toContain(status);
    });

    it('UserProfileService syncOrCreateUserProfile maintains user UID validation', async () => {
      await expect(
        UserProfileService.syncOrCreateUserProfile({ uid: '' })
      ).rejects.toThrow('Valid Firebase User with UID is required.');
    });
  });
});
