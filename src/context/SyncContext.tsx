'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
      setSyncSnapshot(snapshot);
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

  return (
    <SyncContext.Provider
      value={{
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
      }}
    >
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
