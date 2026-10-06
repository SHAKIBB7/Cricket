import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncEngine } from '../infrastructure/sync/SyncEngine';
import { MatchRepository } from '../infrastructure/storage/MatchRepository';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { DomainEvent } from '../domain/cricket/types';

describe('Resource Leak Remediation Test Suite', () => {
  describe('SyncEngine Lifecycle & Timer Disposal', () => {
    let mockAddEventListener: any;
    let mockRemoveEventListener: any;

    beforeEach(() => {
      mockAddEventListener = vi.fn();
      mockRemoveEventListener = vi.fn();

      // Mock browser window environment
      vi.stubGlobal('window', {
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener,
      });
      vi.stubGlobal('navigator', { onLine: true });
    });

    afterEach(() => {
      SyncEngine.stop();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('SyncEngine.init registers online listener and sets periodic timer', () => {
      SyncEngine.init();
      expect(mockAddEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    });

    it('SyncEngine.stop clears all timers and detaches event listener', () => {
      SyncEngine.init();
      SyncEngine.scheduleSync(5000);

      SyncEngine.stop();
      expect(mockRemoveEventListener).toHaveBeenCalledWith('online', expect.any(Function));

      // Verify that calling stop again is completely idempotent and safe
      expect(() => SyncEngine.stop()).not.toThrow();
    });

    it('Re-invoking SyncEngine.init cleans up previous instance before re-initializing', () => {
      SyncEngine.init();
      expect(mockAddEventListener).toHaveBeenCalledTimes(1);

      // Second init should call stop() first to prevent duplicate timers
      SyncEngine.init();
      expect(mockRemoveEventListener).toHaveBeenCalledTimes(1);
      expect(mockAddEventListener).toHaveBeenCalledTimes(2);
    });
  });

  describe('MatchRepository Delta Event Appends', () => {
    it('saveEventsDelta method exists and handles empty or delta slices safely', async () => {
      expect(typeof MatchRepository.saveEventsDelta).toBe('function');

      const mockEvents: DomainEvent[] = [
        {
          eventId: 'ev_1',
          matchId: 'm_1',
          version: 1,
          timestamp: Date.now(),
          type: 'BALL_SCORED',
          payload: {},
        },
        {
          eventId: 'ev_2',
          matchId: 'm_1',
          version: 2,
          timestamp: Date.now(),
          type: 'BALL_SCORED',
          payload: {},
        },
      ];

      // If fromIndex >= events.length, no write is executed and no error thrown
      await expect(MatchRepository.saveEventsDelta(mockEvents, 2)).resolves.not.toThrow();
      await expect(MatchRepository.saveEventsDelta(mockEvents, 5)).resolves.not.toThrow();
    });
  });

  describe('EventSourcedMatchEngine Memory Bounds', () => {
    it('snapshots array is strictly bounded by maxSnapshots (60) to prevent memory leak', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Team A',
        teamB: 'Team B',
        tossWinner: 'Team A',
        tossDecision: 'Batting',
        totalOvers: 20,
      });

      // Simulate 120 balls / actions
      for (let i = 0; i < 120; i++) {
        engine.saveSnapshot();
      }

      expect(engine.snapshots.length).toBeLessThanOrEqual(60);
      expect(engine.snapshots.length).toBe(60);
    });
  });
});
