'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { SyncStatusSnapshot, SyncState } from '@/infrastructure/sync/SyncEngine';
import { ServiceWorkerManager, ServiceWorkerState } from '@/infrastructure/pwa/ServiceWorkerManager';
import { ConfirmationDialog } from '@/components/overlay/ConfirmationDialog';
import { StorageManagerService, StorageEstimateResult } from '@/infrastructure/storage/StorageManagerService';
import type { OfflineSetupState } from '@/infrastructure/offline/OfflineSetupService';

/**
 * Performance fix programme 2026-11-15 (Fix 1 + Fix 5):
 * SyncEngine and OfflineSetupService are NO LONGER statically
 * imported here. Their static chain (SyncEngine -> firebase.ts +
 * supabase.ts, OfflineSetupService -> SyncEngine) put the
 * Firebase and Supabase SDKs into the shared layout bundle, where
 * they parsed and ran on every cold page load. Both modules are
 * now loaded with dynamic import() inside the mount effect,
 * deferred until after first paint (requestIdleCallback with a
 * setTimeout fallback), and the loaded classes are kept in refs
 * for triggerSync / retryOfflineSetup / cleanup.
 *
 * Behaviour preserved: SyncEngine.init/subscribe/stop,
 * OfflineSetupService.subscribe/initializeOfflineSupport and
 * ServiceWorkerManager init/subscribe all still run on mount —
 * just after the first paint instead of during it. Sync
 * semantics (outbox, FIFO, retry) live inside SyncEngine and
 * are untouched. The initial offlineSetup snapshot below is the
 * exact initial state OfflineSetupService itself starts from;
 * its subscribe() replays the live state the moment the module
 * loads, so the value converges immediately.
 */
const INITIAL_OFFLINE_SETUP_STATE: OfflineSetupState = {
  status: 'idle',
  progress: 0,
  message: 'Offline setup not started',
  isOfflineReady: false,
  essentialAssetsCached: false,
  initialDataStored: false,
  error: null,
};

type SyncEngineModule = typeof import('@/infrastructure/sync/SyncEngine');
type OfflineSetupModule = typeof import('@/infrastructure/offline/OfflineSetupService');

interface SyncContextType {
  syncState: SyncState;
  pendingCount: number;
  lastSyncedAt: Date | null;
  errorMessage: string | null;
  isOnline: boolean;
  isServerReachable: boolean;
  triggerSync: () => Promise<void>;
  storageEstimate: StorageEstimateResult | null;
  refreshStorage: () => Promise<void>;
  isOfflineReady: boolean;
  isUpdateAvailable: boolean;
  applyUpdate: () => void;
  offlineSetup: OfflineSetupState;
  retryOfflineSetup: () => Promise<boolean>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

/**
 * Jank fix M-1: SyncEngine notifies are chatty and rebuild the
 * snapshot object every time, even when nothing actually changed.
 * Comparing the scalar fields lets the provider bail out of the
 * state update entirely for no-op notifies, so consumers (header
 * SyncIndicator, sidebar panel) don't re-render mid-transition.
 */
function sameSyncSnapshot(a: SyncStatusSnapshot, b: SyncStatusSnapshot): boolean {
  return (
    a.state === b.state &&
    a.pendingCount === b.pendingCount &&
    a.failedCount === b.failedCount &&
    a.failedError === b.failedError &&
    a.heldCount === b.heldCount &&
    (a.lastSyncedAt?.getTime() ?? null) === (b.lastSyncedAt?.getTime() ?? null) &&
    a.errorMessage === b.errorMessage &&
    a.isOnline === b.isOnline &&
    a.isServerReachable === b.isServerReachable
  );
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [syncSnapshot, setSyncSnapshot] = useState<SyncStatusSnapshot>({
    state: 'SYNCED',
    pendingCount: 0,
    failedCount: 0,
    failedError: null,
    heldCount: 0,
    lastSyncedAt: null,
    errorMessage: null,
    isOnline: true,
    isServerReachable: false,
  });

  const [swState, setSwState] = useState<ServiceWorkerState>({
    isRegistered: false,
    isOfflineReady: false,
    isUpdateAvailable: false,
    registration: null,
  });

  const [storageEstimate, setStorageEstimate] = useState<StorageEstimateResult | null>(null);
  const [offlineSetup, setOfflineSetup] = useState<OfflineSetupState>(INITIAL_OFFLINE_SETUP_STATE);

  const syncEngineRef = useRef<SyncEngineModule['SyncEngine'] | null>(null);
  const offlineSetupRef = useRef<OfflineSetupModule['OfflineSetupService'] | null>(null);

  const refreshStorage = useCallback(async () => {
    const est = await StorageManagerService.getStorageEstimate();
    setStorageEstimate(est);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubSync: (() => void) | undefined;
    let unsubSetup: (() => void) | undefined;

    // 2. Initialize ServiceWorkerManager (light: no Firebase /
    // Supabase in its chain, timing unchanged)
    ServiceWorkerManager.init();
    const unsubSW = ServiceWorkerManager.subscribe((state) => {
      setSwState(state);
    });

    // 4. Inspect initial storage
    refreshStorage();

    // 1 + 3. Load SyncEngine / OfflineSetupService after first
    // paint, then initialize them exactly as before.
    const startSyncStack = async () => {
      try {
        const [syncMod, setupMod] = await Promise.all([
          import('@/infrastructure/sync/SyncEngine'),
          import('@/infrastructure/offline/OfflineSetupService'),
        ]);
        if (cancelled) return;
        syncEngineRef.current = syncMod.SyncEngine;
        offlineSetupRef.current = setupMod.OfflineSetupService;

        syncMod.SyncEngine.init();
        unsubSync = syncMod.SyncEngine.subscribe((snapshot) => {
          // M-1: skip the state update when every scalar field is
          // unchanged — returning `prev` keeps the snapshot (and the
          // memoized context value) referentially stable.
          setSyncSnapshot((prev) => (sameSyncSnapshot(prev, snapshot) ? prev : snapshot));
        });

        unsubSetup = setupMod.OfflineSetupService.subscribe((state) => {
          setOfflineSetup(state);
        });
        setupMod.OfflineSetupService.initializeOfflineSupport().catch(() => {});
      } catch {
        // Chunk load failed (offline first visit): sync simply
        // starts on a later mount/visit; local data is unaffected.
      }
    };

    let idleId: number | undefined;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    if (typeof ric === 'function') {
      idleId = ric(() => { void startSyncStack(); }, { timeout: 1200 });
    } else {
      timerId = setTimeout(() => { void startSyncStack(); }, 0);
    }

    return () => {
      cancelled = true;
      if (idleId !== undefined && typeof (window as any).cancelIdleCallback === 'function') {
        (window as any).cancelIdleCallback(idleId);
      }
      if (timerId !== undefined) clearTimeout(timerId);
      unsubSync?.();
      unsubSW();
      unsubSetup?.();
      syncEngineRef.current?.stop();
    };
  }, [refreshStorage]);

  const triggerSync = useCallback(async () => {
    const SyncEngine =
      syncEngineRef.current ?? (await import('@/infrastructure/sync/SyncEngine')).SyncEngine;
    syncEngineRef.current = SyncEngine;
    await SyncEngine.syncNow();
    await refreshStorage();
  }, [refreshStorage]);

  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);

  // P4 (R1): applying an update mid-scoring asks first — through the
  // app's ConfirmationDialog, never a native confirm. Off the
  // scoring route the update applies immediately, as before.
  const applyUpdate = useCallback(() => {
    if (ServiceWorkerManager.isScoringRouteActive()) {
      setUpdateConfirmOpen(true);
      return;
    }
    ServiceWorkerManager.applyUpdate();
  }, []);

  const confirmApplyUpdate = useCallback(() => {
    setUpdateConfirmOpen(false);
    ServiceWorkerManager.applyUpdate();
  }, []);

  const cancelApplyUpdate = useCallback(() => {
    setUpdateConfirmOpen(false);
  }, []);

  const retryOfflineSetup = useCallback(async () => {
    const OfflineSetupService =
      offlineSetupRef.current ??
      (await import('@/infrastructure/offline/OfflineSetupService')).OfflineSetupService;
    offlineSetupRef.current = OfflineSetupService;
    return OfflineSetupService.retry();
  }, []);

  // M-1: memoized like every other provider in the tree — the
  // value identity now changes only when an input actually does.
  const value = useMemo<SyncContextType>(
    () => ({
      syncState: syncSnapshot.state,
      pendingCount: syncSnapshot.pendingCount,
      lastSyncedAt: syncSnapshot.lastSyncedAt,
      errorMessage: syncSnapshot.errorMessage,
      isOnline: syncSnapshot.isOnline,
      isServerReachable: syncSnapshot.isServerReachable,
      triggerSync,
      storageEstimate,
      refreshStorage,
      isOfflineReady: swState.isOfflineReady || offlineSetup.isOfflineReady,
      isUpdateAvailable: swState.isUpdateAvailable,
      applyUpdate,
      offlineSetup,
      retryOfflineSetup,
    }),
    [syncSnapshot, swState, offlineSetup, storageEstimate, triggerSync, refreshStorage, applyUpdate, retryOfflineSetup]
  );

  return (
    <SyncContext.Provider value={value}>
      {children}
      <ConfirmationDialog
        open={updateConfirmOpen}
        title="Update during a live match?"
        description="A new version of Cricket Scorer Pro is ready. Your match data is safely saved on this device and will not be lost. Updating reloads the app — you can also wait and apply the update after this match."
        confirmLabel="Update now"
        cancelLabel="After this match"
        onConfirm={confirmApplyUpdate}
        onCancel={cancelApplyUpdate}
      />
    </SyncContext.Provider>
  );
}

export function useSyncStatus(): SyncContextType {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSyncStatus must be used within a SyncProvider');
  }
  return context;
}

/** Non-throwing variant for surfaces rendered outside the provider (isolated tests/previews). */
export function useSyncStatusOptional(): SyncContextType | undefined {
  return useContext(SyncContext);
}
