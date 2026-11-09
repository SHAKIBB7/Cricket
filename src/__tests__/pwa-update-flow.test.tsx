/**
 * @vitest-environment jsdom
 *
 * PWA programme P4 — update refinements R1–R3 (Phase 2 design §10):
 *  R2: applyUpdate posts SKIP_WAITING and reloads on
 *      controllerchange (never immediately), with a timed
 *      fallback; no waiting worker → immediate reload (legacy).
 *  R1: SyncProvider's applyUpdate gates on the scoring route —
 *      mid-match it opens the ConfirmationDialog ("Update now" /
 *      "After this match") instead of the removed native confirm;
 *      off the scoring route it applies directly.
 * The native window.confirm is gone from the update path: this
 * suite never stubs it, so any regression to it would throw.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { ServiceWorkerManager } from '@/infrastructure/pwa/ServiceWorkerManager';
import { SyncEngine } from '@/infrastructure/sync/SyncEngine';
import { OfflineSetupService } from '@/infrastructure/offline/OfflineSetupService';
import { StorageManagerService } from '@/infrastructure/storage/StorageManagerService';
import { SyncProvider, useSyncStatus } from '@/context/SyncContext';

const mgr = ServiceWorkerManager as unknown as { registration: unknown };
let reloadSpy: ReturnType<typeof vi.fn>;
let swEvents: EventTarget;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function setWaitingWorker(): { postMessage: ReturnType<typeof vi.fn> } {
  const postMessage = vi.fn();
  mgr.registration = { waiting: { postMessage } };
  return { postMessage };
}

beforeEach(() => {
  reloadSpy = vi.fn();
  vi.spyOn(ServiceWorkerManager as unknown as { reloadPage: () => void }, 'reloadPage')
    .mockImplementation(() => { reloadSpy(); });
  swEvents = new EventTarget();
  Object.defineProperty(navigator, 'serviceWorker', { value: swEvents, configurable: true });
  mgr.registration = null;
  window.history.pushState({}, '', '/');
});

afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = null;
  container = null;
  mgr.registration = null;
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('R2 — applyUpdate activation semantics', () => {
  it('no waiting worker → reloads immediately (legacy behaviour)', () => {
    ServiceWorkerManager.applyUpdate();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('waiting worker → SKIP_WAITING posted; reload waits for controllerchange and fires once', () => {
    const { postMessage } = setWaitingWorker();
    ServiceWorkerManager.applyUpdate();
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reloadSpy).not.toHaveBeenCalled();
    act(() => { swEvents.dispatchEvent(new Event('controllerchange')); });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    // A second event (or the fallback timer path) must not reload again.
    act(() => { swEvents.dispatchEvent(new Event('controllerchange')); });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to a timed reload if controllerchange never comes', () => {
    vi.useFakeTimers();
    setWaitingWorker();
    ServiceWorkerManager.applyUpdate();
    expect(reloadSpy).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('isScoringRouteActive matches only the scoring route', () => {
    window.history.pushState({}, '', '/matches/score/match_1');
    expect(ServiceWorkerManager.isScoringRouteActive()).toBe(true);
    window.history.pushState({}, '', '/profile');
    expect(ServiceWorkerManager.isScoringRouteActive()).toBe(false);
  });
});

function ApplyButton() {
  const { applyUpdate } = useSyncStatus();
  return (
    <button type="button" onClick={applyUpdate}>
      apply
    </button>
  );
}

async function renderProvider() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <SyncProvider>
        <ApplyButton />
      </SyncProvider>,
    );
  });
  return container;
}

function stubProviderInfrastructure() {
  vi.spyOn(SyncEngine, 'init').mockImplementation(() => undefined);
  vi.spyOn(SyncEngine, 'subscribe').mockImplementation(() => () => undefined);
  vi.spyOn(SyncEngine, 'stop').mockImplementation(() => undefined);
  vi.spyOn(ServiceWorkerManager, 'init').mockImplementation(() => undefined);
  vi.spyOn(ServiceWorkerManager, 'subscribe').mockImplementation(() => () => undefined);
  vi.spyOn(OfflineSetupService, 'subscribe').mockImplementation(() => () => undefined);
  vi.spyOn(OfflineSetupService, 'initializeOfflineSupport').mockResolvedValue(true);
  vi.spyOn(StorageManagerService, 'getStorageEstimate').mockResolvedValue({
    supported: false, persisted: false, usageBytes: 0, quotaBytes: 0,
    usagePercent: 0, usageMB: 0, quotaMB: 0, isLowSpace: false,
  });
}

describe('R1 — the scoring-route confirmation gate', () => {
  it('off the scoring route, apply goes straight to the manager', async () => {
    stubProviderInfrastructure();
    vi.spyOn(ServiceWorkerManager, 'isScoringRouteActive').mockReturnValue(false);
    const applySpy = vi.spyOn(ServiceWorkerManager, 'applyUpdate').mockImplementation(() => undefined);
    const el = await renderProvider();
    const button = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'apply');
    await act(async () => { button?.click(); });
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('Update during a live match?');
  });

  it('on the scoring route, the dialog gates the update; "After this match" defers, "Update now" applies', async () => {
    stubProviderInfrastructure();
    vi.spyOn(ServiceWorkerManager, 'isScoringRouteActive').mockReturnValue(true);
    const applySpy = vi.spyOn(ServiceWorkerManager, 'applyUpdate').mockImplementation(() => undefined);
    const el = await renderProvider();
    const applyBtn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'apply');

    await act(async () => { applyBtn?.click(); });
    expect(applySpy).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Update during a live match?');
    expect(document.body.textContent).toContain('will not be lost');

    const deferBtn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === 'After this match');
    await act(async () => { deferBtn?.click(); });
    expect(applySpy).not.toHaveBeenCalled();
    // Let the dialog's exit animation finish before asserting closure.
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(document.body.textContent).not.toContain('Update during a live match?');

    await act(async () => { applyBtn?.click(); });
    const updateBtn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === 'Update now');
    await act(async () => { updateBtn?.click(); });
    expect(applySpy).toHaveBeenCalledTimes(1);
  });
});
