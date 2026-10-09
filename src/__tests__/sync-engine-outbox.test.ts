import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../infrastructure/database/dexie-db';
import { SyncEngine, SyncStatusSnapshot } from '../infrastructure/sync/SyncEngine';

describe('SyncEngine Outbox Queue & Cloud Synchronization Test Suite', () => {
  beforeEach(async () => {
    SyncEngine.stop();
    await db.sync_queue.clear();
    await db.matches.clear();
  });

  afterEach(() => {
    SyncEngine.stop();
    vi.restoreAllMocks();
  });

  it('A. Queues mutations in durable IndexedDB outbox in FIFO order', async () => {
    await SyncEngine.queueMutation('UPSERT_MATCH', { id: 'm_1', teamA: 'T1' });
    await SyncEngine.queueMutation('UPSERT_TEAM', { id: 'team_1', name: 'Warriors' });
    await SyncEngine.queueMutation('DELETE_MATCH', { id: 'm_old' });

    const ops = await db.sync_queue.orderBy('createdAt').toArray();
    expect(ops.length).toBe(3);
    expect(ops[0].operationType).toBe('UPSERT_MATCH');
    expect(ops[1].operationType).toBe('UPSERT_TEAM');
    expect(ops[2].operationType).toBe('DELETE_MATCH');
    expect(ops.every((op) => op.status === 'PENDING')).toBe(true);
  });

  it('B. Coalesces rapid sequential ball scoring updates for the same match into latest state', async () => {
    const matchId = 'match_active_live';

    // Ball 1
    await SyncEngine.queueMutation(
      'UPSERT_MATCH',
      { id: matchId, score: 1, balls: 1 },
      matchId
    );

    // Ball 2
    await SyncEngine.queueMutation(
      'UPSERT_MATCH',
      { id: matchId, score: 5, balls: 2 },
      matchId
    );

    // Ball 3
    await SyncEngine.queueMutation(
      'UPSERT_MATCH',
      { id: matchId, score: 9, balls: 3 },
      matchId
    );

    // Because all 3 are pending UPSERTs on the same matchId, they coalesce into 1 pending op with the latest snapshot!
    const ops = await db.sync_queue
      .where('status')
      .equals('PENDING')
      .and((op) => op.entityId === matchId)
      .toArray();

    expect(ops.length).toBe(1);
    expect(ops[0].payload.score).toBe(9);
    expect(ops[0].payload.balls).toBe(3);
  });

  it('C. Notifies subscribers of reactive sync states (OFFLINE, PENDING, SYNCED)', async () => {
    let latestSnapshot: SyncStatusSnapshot | null = null;
    const unsubscribe = SyncEngine.subscribe((snapshot) => {
      latestSnapshot = snapshot;
    });

    expect(latestSnapshot).not.toBeNull();
    expect(latestSnapshot?.state).toBe('SYNCED'); // Empty queue initially

    // Enqueue an operation
    await SyncEngine.queueMutation('UPSERT_MATCH', { id: 'm_test' });

    // State should now reflect PENDING
    expect(latestSnapshot?.pendingCount).toBe(1);
    expect(latestSnapshot?.state).toBe('PENDING');

    unsubscribe();
  });

  it('D. Validates backend reachability check distinguishes network from server availability', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const offlineReach = await SyncEngine.checkServerReachability();
    expect(offlineReach).toBe(false);

    vi.stubGlobal('navigator', { onLine: true });
    const onlineReach = await SyncEngine.checkServerReachability();
    expect(onlineReach).toBe(true);

    vi.unstubAllGlobals();
  });

  it('E. Idempotently evicts acknowledged queue records without losing unacknowledged records', async () => {
    await db.sync_queue.bulkPut([
      {
        clientOpId: 'op_ack_1',
        operationType: 'UPSERT_MATCH',
        status: 'SYNCED',
        payload: { id: 'm1' },
        retryCount: 0,
        createdAt: new Date().toISOString(),
      },
      {
        clientOpId: 'op_ack_2',
        operationType: 'UPSERT_MATCH',
        status: 'SYNCED',
        payload: { id: 'm2' },
        retryCount: 0,
        createdAt: new Date().toISOString(),
      },
      {
        clientOpId: 'op_pending_1',
        operationType: 'UPSERT_MATCH',
        status: 'PENDING',
        payload: { id: 'm3' },
        retryCount: 0,
        createdAt: new Date().toISOString(),
      },
    ]);

    await SyncEngine.pruneCompletedQueue();

    const remaining = await db.sync_queue.toArray();
    expect(remaining.length).toBe(1);
    expect(remaining[0].clientOpId).toBe('op_pending_1');
  });
});
