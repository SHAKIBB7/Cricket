'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { SyncEngine, SyncStatusSnapshot, SyncState } from '@/infrastructure/sync/SyncEngine';
import { ServiceWorkerManager, ServiceWorkerState } from '@/infrastructure/pwa/ServiceWorkerManager';
import { ConfirmationDialog } from '@/components/overlay/ConfirmationDialog';
import { StorageManagerService, StorageEstimateResult } from '@/infrastructure/storage/StorageManagerService';
import { OfflineSetupService, OfflineSetupState } from '@/infrastructure/offline/OfflineSetupService';

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
  const [offlineSetup, setOfflineSetup] = useState<OfflineSetupState>(OfflineSetupService.getState());

  const refreshStorage = useCallback(async () => {
    const est = await StorageManagerService.getStorageEstimate();
    setStorageEstimate(est);
  }, []);

  useEffect(() => {
    // 1. Initialize SyncEngine globally
    SyncEngine.init();
    const unsubSync = SyncEngine.subscribe((snapshot) => {
      // M-1: skip the state update when every scalar field is
      // unchanged — returning `prev` keeps the snapshot (and the
      // memoized context value) referentially stable.
      setSyncSnapshot((prev) => (sameSyncSnapshot(prev, snapshot) ? prev : snapshot));
    });

    // 2. Initialize ServiceWorkerManager
    ServiceWorkerManager.init();
    const unsubSW = ServiceWorkerManager.subscribe((state) => {
      setSwState(state);
    });

    // 3. Initialize OfflineSetupService
    const unsubSetup = OfflineSetupService.subscribe((state) => {
      setOfflineSetup(state);
    });
    OfflineSetupService.initializeOfflineSupport().catch(() => {});

    // 4. Inspect initial storage
    refreshStorage();

    return () => {
      unsubSync();
      unsubSW();
      unsubSetup();
      SyncEngine.stop();
    };
  }, [refreshStorage]);

  const triggerSync = useCallback(async () => {
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
