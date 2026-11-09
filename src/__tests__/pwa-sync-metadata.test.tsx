/**
 * @vitest-environment jsdom
 *
 * PWA programme P7 — sync metadata S (D7): every queued op is
 * stamped with schemaVersion 1, the enqueue-time user id (null
 * for guests), and this device's stable id. The metadata is
 * provenance only — execution never branches on it — and
 * coalesced ops get their provenance refreshed (a guest-queued
 * op picks up the uid after sign-in). The device id persists
 * in app_metadata and is surfaced in profile diagnostics.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { db } from '@/infrastructure/database/dexie-db';
import { SyncEngine } from '@/infrastructure/sync/SyncEngine';
import { StorageManagerService } from '@/infrastructure/storage/StorageManagerService';

const authHolder = vi.hoisted(() => ({
  currentUser: null as { uid: string } | null,
}));

vi.mock('../infrastructure/auth/firebase', async (importOriginal) => {
  const original = await importOriginal<typeof import('../infrastructure/auth/firebase')>();
  return {
    ...original,
    auth: {
      get currentUser() {
        return authHolder.currentUser;
      },
    },
  };
});

const mockSync = vi.hoisted(() => ({
  current: null as { storageEstimate: null; refreshStorage: () => Promise<void> } | null,
}));

vi.mock('@/context/SyncContext', () => ({
  useSyncStatusOptional: () => mockSync.current ?? undefined,
}));

import { StorageDiagnosticsSection } from '@/components/profile/StorageDiagnosticsSection';

beforeEach(async () => {
  await db.sync_queue.clear();
  await db.app_metadata.clear();
  (StorageManagerService as unknown as { deviceIdCache: string | null }).deviceIdCache = null;
  authHolder.currentUser = null;
  mockSync.current = { storageEstimate: null, refreshStorage: vi.fn(async () => {}) };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('P7 — device identity', () => {
  it('is generated once, persisted in app_metadata, and stable', async () => {
    const first = await StorageManagerService.getOrCreateDeviceId();
    expect(first).toMatch(/^dev_/);
    expect(await StorageManagerService.getMetadata('device_id')).toBe(first);
    (StorageManagerService as unknown as { deviceIdCache: string | null }).deviceIdCache = null;
    const second = await StorageManagerService.getOrCreateDeviceId();
    expect(second).toBe(first);
  });
});

describe('P7 — op provenance stamping', () => {
  it('a guest op carries schemaVersion 1, userId null, and the device id', async () => {
    const deviceId = await StorageManagerService.getOrCreateDeviceId();
    await SyncEngine.queueMutation('UPSERT_TEAM', { id: 't_p7_guest', name: 'Guests' }, 't_p7_guest');
    const ops = await db.sync_queue.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0].schemaVersion).toBe(1);
    expect(ops[0].userId).toBeNull();
    expect(ops[0].deviceId).toBe(deviceId);
  });

  it('a signed-in op carries the uid', async () => {
    authHolder.currentUser = { uid: 'uid_p7_1' };
    await SyncEngine.queueMutation('UPSERT_TEAM', { id: 't_p7_user', name: 'Signed' }, 't_p7_user');
    const ops = await db.sync_queue.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0].userId).toBe('uid_p7_1');
    expect(ops[0].schemaVersion).toBe(1);
  });

  it('coalescing refreshes provenance: a guest-queued op picks up the uid after sign-in', async () => {
    await SyncEngine.queueMutation('UPSERT_MATCH', { id: 'm_p7', score: 1 }, 'm_p7');
    authHolder.currentUser = { uid: 'uid_p7_2' };
    await SyncEngine.queueMutation('UPSERT_MATCH', { id: 'm_p7', score: 2 }, 'm_p7');
    const ops = await db.sync_queue.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0].userId).toBe('uid_p7_2');
    expect((ops[0].payload as { score: number }).score).toBe(2);
  });
});

describe('P7 — diagnostics surface', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    container = null;
  });

  it('the diagnostics section shows the same device id the ops carry', async () => {
    const deviceId = await StorageManagerService.getOrCreateDeviceId();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<StorageDiagnosticsSection />);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(container.textContent).toContain('Device ID:');
    expect(container.textContent).toContain(deviceId);
  });
});
