import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../infrastructure/database/dexie-db';
import { SyncEngine, SyncStatusSnapshot } from '../infrastructure/sync/SyncEngine';

describe('SyncEngine Outbox Queue & Cloud Synchronization Test Suite', () => {
  const TEST_BACKEND_URL = 'https://supabase-test.cricketscorer.pro';

  beforeEach(async () => {
    SyncEngine.stop();
    await db.sync_queue.clear();
    await db.matches.clear();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', TEST_BACKEND_URL);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });

  afterEach(() => {
    SyncEngine.stop();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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
    expect((latestSnapshot as SyncStatusSnapshot | null)?.state).toBe('SYNCED'); // Empty queue initially

    // Enqueue an operation
    await SyncEngine.queueMutation('UPSERT_MATCH', { id: 'm_test' });

    // State should now reflect PENDING
    expect((latestSnapshot as SyncStatusSnapshot | null)?.pendingCount).toBe(1);
    expect((latestSnapshot as SyncStatusSnapshot | null)?.state).toBe('PENDING');

    unsubscribe();
  });

  it('D. Validates backend reachability check distinguishes network from server availability', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    // 1. Browser offline state: returns false immediately without making network calls
    vi.stubGlobal('navigator', { onLine: false });
    const offlineReach = await SyncEngine.checkServerReachability();
    expect(offlineReach).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();

    // 2. Browser online state with a reachable backend: returns true
    vi.stubGlobal('navigator', { onLine: true });
    const onlineReach = await SyncEngine.checkServerReachability();
    expect(onlineReach).toBe(true);
    expect(mockFetch).toHaveBeenCalled();

    // 3. Browser online state with an unreachable backend (network-level transport failure)
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch (Network connection refused)'));
    const networkFailReach = await SyncEngine.checkServerReachability();
    expect(networkFailReach).toBe(false);

    // 4. HTTP error responses: client-level error (e.g. 401 Unauthorized) means server is reached & operational
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const clientErrorReach = await SyncEngine.checkServerReachability();
    expect(clientErrorReach).toBe(true);

    // 5. HTTP error responses: server-level outage (e.g. 503 Service Unavailable / 500) means server is unavailable
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const serverDownReach = await SyncEngine.checkServerReachability();
    expect(serverDownReach).toBe(false);

    // 6. Request timeout: AbortError simulation returns false
    mockFetch.mockImplementationOnce(() => new Promise((_, reject) => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      reject(abortErr);
    }));
    const timeoutReach = await SyncEngine.checkServerReachability(50);
    expect(timeoutReach).toBe(false);

    // 7. Missing or invalid configuration: returns false
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const missingConfigReach = await SyncEngine.checkServerReachability();
    expect(missingConfigReach).toBe(false);

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'not-a-valid-url');
    const invalidConfigReach = await SyncEngine.checkServerReachability();
    expect(invalidConfigReach).toBe(false);

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://your-project-id.supabase.co');
    const placeholderConfigReach = await SyncEngine.checkServerReachability();
    expect(placeholderConfigReach).toBe(false);

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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
