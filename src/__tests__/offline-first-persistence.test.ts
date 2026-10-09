import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../infrastructure/database/dexie-db';
import { MatchRepository } from '../infrastructure/storage/MatchRepository';
import { StorageManagerService } from '../infrastructure/storage/StorageManagerService';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { MatchScorecard, DomainEvent } from '../domain/cricket/types';

describe('Offline-First Durable Persistence Test Suite', () => {
  beforeEach(async () => {
    await db.matches.clear();
    await db.match_events.clear();
    await db.app_metadata.clear();
    await db.sync_queue.clear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('A. Commits match and events to IndexedDB transactionally', async () => {
    const engine = new EventSourcedMatchEngine({
      teamA: 'Mumbai Stars',
      teamB: 'Chennai Kings',
      tossWinner: 'Mumbai Stars',
      tossDecision: 'Batting',
      totalOvers: 5,
      strikerName: 'Rohit',
      nonStrikerName: 'Surya',
      bowlerName: 'Deepak',
    });

    // Score a couple of deliveries
    engine.scoreBall({ runsScored: 4 });
    engine.scoreBall({ runsScored: 1 });
    engine.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled', newBatsmanName: 'Tilak' });

    const scorecard = engine.toScorecard();
    await MatchRepository.saveMatchWithEvents(scorecard, engine.events, 0);

    // Verify stored match
    const storedMatch = await MatchRepository.getMatch(engine.id);
    expect(storedMatch).toBeDefined();
    expect(storedMatch?.id).toBe(engine.id);
    expect(storedMatch?.syncStatus).toBe('PENDING');
    expect(storedMatch?.firstInnings?.totalRuns).toBe(5);
    expect(storedMatch?.firstInnings?.totalWickets).toBe(1);

    // Verify stored events
    const storedEvents = await MatchRepository.getEventsForMatch(engine.id);
    expect(storedEvents.length).toBe(engine.events.length);
    expect(storedEvents[0].type).toBe('MATCH_CREATED');
    expect(storedEvents.some((e) => e.type === 'BALL_SCORED')).toBe(true);
  });

  it('B. Recovers latest active match on application restart / reopening', async () => {
    const engine1 = new EventSourcedMatchEngine({
      id: 'match_completed_1',
      teamA: 'Delhi',
      teamB: 'Punjab',
      tossWinner: 'Delhi',
      tossDecision: 'Batting',
      totalOvers: 2,
    });
    engine1.status = 'COMPLETED';
    await MatchRepository.saveMatch(engine1.toScorecard());

    const engine2 = new EventSourcedMatchEngine({
      id: 'match_ongoing_2',
      teamA: 'Kolkata',
      teamB: 'Bangalore',
      tossWinner: 'Kolkata',
      tossDecision: 'Batting',
      totalOvers: 20,
      strikerName: 'Shreyas',
      nonStrikerName: 'Rinku',
      bowlerName: 'Siraj',
    });
    engine2.status = 'ONGOING';
    engine2.scoreBall({ runsScored: 6 });
    await MatchRepository.saveMatch(engine2.toScorecard());

    // Reopen application: simulate restart and restore latest active match
    const restoredMatch = await MatchRepository.getLastActiveMatch();
    expect(restoredMatch).toBeDefined();
    expect(restoredMatch?.id).toBe('match_ongoing_2');
    expect(restoredMatch?.firstInnings?.totalRuns).toBe(6);
    expect(restoredMatch?.status).toBe('ONGOING');
  });

  it('C. StorageManagerService requests persistent browser storage and handles quota', async () => {
    // Mock navigator.storage
    const mockPersist = vi.fn().mockResolvedValue(true);
    const mockPersisted = vi.fn().mockResolvedValue(true);
    const mockEstimate = vi.fn().mockResolvedValue({
      usage: 5 * 1024 * 1024, // 5MB
      quota: 100 * 1024 * 1024, // 100MB
    });

    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {
      storage: {
        persist: mockPersist,
        persisted: mockPersisted,
        estimate: mockEstimate,
      },
    });

    const isPersisted = await StorageManagerService.requestPersistence();
    expect(isPersisted).toBe(true);

    const estimate = await StorageManagerService.getStorageEstimate();
    expect(estimate.supported).toBe(true);
    expect(estimate.persisted).toBe(true);
    expect(estimate.usageMB).toBe(5);
    expect(estimate.quotaMB).toBe(100);
    expect(estimate.isLowSpace).toBe(false);

    // Verify storage health check
    const health = await StorageManagerService.verifyStorageHealth();
    expect(health.healthy).toBe(true);

    vi.unstubAllGlobals();
  });

  it('D. Quota exhaustion cleanup prunes SYNCED records without touching PENDING records', async () => {
    // Insert 2 SYNCED records and 2 PENDING records
    await db.sync_queue.bulkPut([
      {
        clientOpId: 'op_old_1',
        operationType: 'UPSERT_MATCH',
        status: 'SYNCED',
        payload: {},
        retryCount: 0,
        createdAt: '2026-10-01T00:00:00Z',
      },
      {
        clientOpId: 'op_old_2',
        operationType: 'UPSERT_MATCH',
        status: 'SYNCED',
        payload: {},
        retryCount: 0,
        createdAt: '2026-10-02T00:00:00Z',
      },
      {
        clientOpId: 'op_pending_1',
        operationType: 'UPSERT_MATCH',
        status: 'PENDING',
        payload: { id: 'm_active' },
        retryCount: 0,
        createdAt: '2026-10-09T00:00:00Z',
      },
    ]);

    const result = await StorageManagerService.handleQuotaExhaustion();
    expect(result.cleanedItems).toBe(2);

    const remaining = await db.sync_queue.toArray();
    expect(remaining.length).toBe(1);
    expect(remaining[0].clientOpId).toBe('op_pending_1');
    expect(remaining[0].status).toBe('PENDING');
  });

  it('E. Dexie schema versioning supports app_metadata key-value storage', async () => {
    await StorageManagerService.setMetadata('user_preference_theme', 'dark');
    const val = await StorageManagerService.getMetadata<string>('user_preference_theme');
    expect(val).toBe('dark');

    const nonExistent = await StorageManagerService.getMetadata('random_key');
    expect(nonExistent).toBeUndefined();
  });
});
