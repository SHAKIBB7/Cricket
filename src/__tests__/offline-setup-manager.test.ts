import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../infrastructure/database/dexie-db';
import { OfflineSetupService } from '../infrastructure/offline/OfflineSetupService';
import { StorageManagerService } from '../infrastructure/storage/StorageManagerService';
import { ServiceWorkerManager } from '../infrastructure/pwa/ServiceWorkerManager';

describe('OfflineSetupService & First-Load Readiness Test Suite', () => {
  beforeEach(async () => {
    await db.matches.clear();
    await db.match_events.clear();
    await db.teams.clear();
    await db.tournaments.clear();
    await db.app_metadata.clear();
    await db.sync_queue.clear();
    ServiceWorkerManager.setOfflineReady(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('A. Does NOT seed starter cricket squads into IndexedDB; leaves teams empty for user creation', async () => {
    const initialCount = await db.teams.count();
    expect(initialCount).toBe(0);

    const success = await OfflineSetupService.initializeOfflineSupport();
    expect(success).toBe(true);

    const seededCount = await db.teams.count();
    expect(seededCount).toBe(0);
  });

  it('B. Purges legacy starter demo teams while strictly preserving user-created teams', async () => {
    // Pre-insert legacy starter teams and a custom user team
    await db.teams.bulkPut([
      {
        id: 'team_starter_mumbai',
        name: 'Mumbai Champions',
        captain: 'Rohit Sharma',
        manager: 'Coach M',
        players: ['Player 1'],
        createdAt: new Date().toISOString(),
        syncStatus: 'SYNCED',
      },
      {
        id: 'team_user_custom_1',
        name: 'Custom XI',
        captain: 'Custom Captain',
        manager: 'Custom Manager',
        players: ['Player A', 'Player B'],
        createdAt: new Date().toISOString(),
        syncStatus: 'LOCAL_ONLY',
      },
    ]);

    const success = await OfflineSetupService.initializeOfflineSupport();
    expect(success).toBe(true);

    const teams = await db.teams.toArray();
    expect(teams.length).toBe(1);
    expect(teams[0].id).toBe('team_user_custom_1');
    expect(teams[0].name).toBe('Custom XI');

    const legacyMumbai = await db.teams.get('team_starter_mumbai');
    expect(legacyMumbai).toBeUndefined();
  });

  it('C. Sets default cricket rules and records offline_setup_complete in app_metadata', async () => {
    await OfflineSetupService.initializeOfflineSupport();

    const rules = await StorageManagerService.getMetadata<any>('default_scoring_rules');
    expect(rules).toBeDefined();
    expect(rules?.overs).toBe(6);
    expect(rules?.wideRun).toBe(1);
    expect(rules?.noBallRun).toBe(1);

    const setupMeta = await StorageManagerService.getMetadata<{ complete: boolean; version: string }>(
      'offline_setup_complete'
    );
    expect(setupMeta).toBeDefined();
    expect(setupMeta?.complete).toBe(true);
    expect(setupMeta?.version).toBe('v2.2.0');
  });

  it('D. Emits progressive setup states to subscribers', async () => {
    const states: string[] = [];
    const unsub = OfflineSetupService.subscribe((state) => {
      states.push(`${state.status}:${state.progress}`);
    });

    await OfflineSetupService.initializeOfflineSupport();
    unsub();

    expect(states.some((s) => s.startsWith('in_progress'))).toBe(true);
    expect(states.some((s) => s.startsWith('complete:100'))).toBe(true);

    const finalState = OfflineSetupService.getState();
    expect(finalState.isOfflineReady).toBe(true);
    expect(finalState.initialDataStored).toBe(true);
    expect(finalState.status).toBe('complete');
  });

  it('E. Handles verification probe failure safely without falsely reporting offline readiness', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } });
    vi.stubGlobal('caches', {
      open: vi.fn(),
      keys: vi.fn().mockResolvedValue(['cric-scorer-shell-v2.2.0']),
    });

    // Force cache verification to fail
    vi.spyOn(ServiceWorkerManager, 'verifyCachesReady').mockResolvedValue({
      verified: false,
      cachedCount: 0,
      total: 9,
      missing: ['/matches/new'],
    });

    // In non-development mock, verification failure triggers error
    const origEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production';

    try {
      // Clear setup metadata to force fresh run
      await db.app_metadata.delete('offline_setup_complete');

      const result = await OfflineSetupService.retry();
      expect(result).toBe(false);

      const state = OfflineSetupService.getState();
      expect(state.status).toBe('failed');
      expect(state.isOfflineReady).toBe(false);
      expect(state.error).toBeDefined();
    } finally {
      (process.env as any).NODE_ENV = origEnv;
      vi.unstubAllGlobals();
    }
  });

  it('F. ServiceWorkerManager verifyCachesReady probes Cache Storage', async () => {
    const mockMatch = vi.fn().mockResolvedValue(new Response('OK'));
    const mockOpen = vi.fn().mockResolvedValue({ match: mockMatch });
    const mockKeys = vi.fn().mockResolvedValue(['cric-scorer-shell-v2.2.0']);

    vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } });
    vi.stubGlobal('caches', {
      open: mockOpen,
      keys: mockKeys,
    });

    const check = await ServiceWorkerManager.verifyCachesReady();
    expect(check.verified).toBe(true);
    expect(check.cachedCount).toBe(check.total);
    expect(check.missing.length).toBe(0);

    vi.unstubAllGlobals();
  });
});
