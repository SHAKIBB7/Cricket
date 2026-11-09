/**
 * @vitest-environment jsdom
 *
 * PWA programme P5 (D5) — storage surfacing + silent persistence:
 *  1. The first locally-saved match triggers exactly one silent
 *     requestPersistence(); later saves do not repeat it.
 *  2. StorageDiagnosticsSection renders the live estimate in
 *     plain language (usage, protection state, low-space
 *     warning) and offers the Protect action only while storage
 *     is best-effort; the action requests persistence and
 *     refreshes the estimate.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { db } from '@/infrastructure/database/dexie-db';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { StorageManagerService, type StorageEstimateResult } from '@/infrastructure/storage/StorageManagerService';
import type { MatchScorecard } from '@/domain/cricket/types';

const mockSync = vi.hoisted(() => ({
  current: null as { storageEstimate: StorageEstimateResult | null; refreshStorage: () => Promise<void> } | null,
}));

vi.mock('@/context/SyncContext', () => ({
  useSyncStatusOptional: () => mockSync.current ?? undefined,
}));

import { StorageDiagnosticsSection } from '@/components/profile/StorageDiagnosticsSection';

function scorecard(id: string): MatchScorecard {
  return {
    id,
    status: 'ONGOING',
    updatedAt: new Date().toISOString(),
  } as unknown as MatchScorecard;
}

describe('P5 — first-save persistence request', () => {
  beforeEach(async () => {
    await db.matches.clear();
    await db.sync_queue.clear();
    (MatchRepository as unknown as { firstSavePersistenceHandled: boolean }).firstSavePersistenceHandled = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fires once when the first match is saved, and never again', async () => {
    const spy = vi.spyOn(StorageManagerService, 'requestPersistence').mockResolvedValue(true);
    await MatchRepository.saveMatch(scorecard('m_p5_first'));
    expect(spy).toHaveBeenCalledTimes(1);
    await MatchRepository.saveMatch(scorecard('m_p5_second'));
    await MatchRepository.saveMatchWithEvents(scorecard('m_p5_third'), [], 0);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a failed persistence request never breaks the save', async () => {
    vi.spyOn(StorageManagerService, 'requestPersistence').mockRejectedValue(new Error('denied'));
    await expect(MatchRepository.saveMatch(scorecard('m_p5_resilient'))).resolves.toBeUndefined();
    expect(await db.matches.get('m_p5_resilient')).toBeTruthy();
  });
});

function estimate(overrides: Partial<StorageEstimateResult>): StorageEstimateResult {
  return {
    supported: true,
    persisted: false,
    usageBytes: 12.5 * 1024 * 1024,
    quotaBytes: 500 * 1024 * 1024,
    usagePercent: 2.5,
    usageMB: 12.5,
    quotaMB: 500,
    isLowSpace: false,
    ...overrides,
  };
}

describe('P5 — StorageDiagnosticsSection', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  async function render() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<StorageDiagnosticsSection />);
    });
    return container;
  }

  beforeEach(() => {
    mockSync.current = null;
  });

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    container = null;
    vi.clearAllMocks();
  });

  it('without an estimate yet, shows the measuring state and no action', async () => {
    mockSync.current = { storageEstimate: null, refreshStorage: vi.fn(async () => {}) };
    const el = await render();
    expect(el.textContent).toContain('Device Storage:');
    expect(el.textContent).toContain('Measuring…');
    expect(el.textContent).not.toContain('Protect storage');
  });

  it('best-effort storage: usage in plain language + Protect action that requests and refreshes', async () => {
    const refreshStorage = vi.fn(async () => {});
    mockSync.current = { storageEstimate: estimate({}), refreshStorage };
    const persistSpy = vi.spyOn(StorageManagerService, 'requestPersistence').mockResolvedValue(true);
    const el = await render();
    expect(el.textContent).toContain('12.5 MB of 500 MB used (2.5%)');
    expect(el.textContent).toContain('Best-effort — the browser may clear this data under storage pressure');
    const button = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Protect storage'));
    expect(button).toBeTruthy();
    await act(async () => { button?.click(); });
    expect(persistSpy).toHaveBeenCalledTimes(1);
    expect(refreshStorage).toHaveBeenCalledTimes(1);
  });

  it('persistent storage: protection stated, no Protect action', async () => {
    mockSync.current = { storageEstimate: estimate({ persisted: true }), refreshStorage: vi.fn(async () => {}) };
    const el = await render();
    expect(el.textContent).toContain('Persistent — the browser will not clear this data automatically');
    expect(el.textContent).not.toContain('Protect storage');
  });

  it('low space surfaces the warning with the backup pointer', async () => {
    mockSync.current = { storageEstimate: estimate({ isLowSpace: true }), refreshStorage: vi.fn(async () => {}) };
    const el = await render();
    expect(el.textContent).toContain('Low space:');
    expect(el.textContent).toContain('Google Drive section');
  });
});
