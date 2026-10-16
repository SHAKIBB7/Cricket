'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  HardDrive,
  Download,
  X,
  Sparkles,
  ArrowUpCircle,
} from 'lucide-react';
import { useSyncStatus } from '@/context/SyncContext';
import { motion, AnimatePresence } from 'framer-motion';

interface SyncIndicatorProps {
  variant?: 'full' | 'compact';
}

export function SyncIndicator({ variant = 'full' }: SyncIndicatorProps) {
  const {
    syncState,
    pendingCount,
    lastSyncedAt,
    errorMessage,
    isOnline,
    isServerReachable,
    triggerSync,
    storageEstimate,
    isOfflineReady,
    isUpdateAvailable,
    applyUpdate,
    offlineSetup,
    retryOfflineSetup,
  } = useSyncStatus();

  const [showModal, setShowModal] = useState(false);
  const [syncingManual, setSyncingManual] = useState(false);
  const [retryingSetup, setRetryingSetup] = useState(false);

  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);

  const toggleModal = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setShowModal((prev) => !prev);
  };

  useEffect(() => {
    if (!showModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showModal]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartY.current = e.touches[0].clientY;
      touchStartX.current = e.touches[0].clientX;
      touchStartTime.current = Date.now();
    }
  };

  const handleTouchMove = (_e: React.TouchEvent) => {
    // Keep touch tracking active
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null || touchStartX.current === null) {
      return;
    }
    const endY = e.changedTouches[0].clientY;
    const endX = e.changedTouches[0].clientX;
    const deltaY = endY - touchStartY.current;
    const deltaX = endX - touchStartX.current;
    const deltaTime = Date.now() - touchStartTime.current;

    touchStartY.current = null;
    touchStartX.current = null;

    // Guard against scrolling down inside the modal
    const targetElement = e.currentTarget as HTMLElement;
    if (targetElement && targetElement.scrollTop > 5) {
      return;
    }

    // Swipe-Up gesture validation:
    // - Upward displacement: deltaY is negative (finger moved up towards top of screen)
    // - Minimum distance: moved up at least 40px, or 25px with fast flick (deltaTime < 300ms)
    // - Predominantly vertical: |deltaY| > |deltaX| * 1.3 to avoid mistaking horizontal gestures
    // - Tap rejection: taps have negligible displacement (|deltaY| < 10px) and won't satisfy distance threshold
    const isUpward = deltaY < -40 || (deltaY < -25 && deltaTime < 300);
    const isVertical = Math.abs(deltaY) > Math.abs(deltaX) * 1.3;

    if (isUpward && isVertical) {
      setShowModal(false);
    }
  };

  const handleManualSync = async () => {
    setSyncingManual(true);
    try {
      await triggerSync();
    } finally {
      setSyncingManual(false);
    }
  };

  const handleRetryOfflineSetup = async () => {
    setRetryingSetup(true);
    try {
      await retryOfflineSetup();
    } finally {
      setRetryingSetup(false);
    }
  };

  // Status configuration mapping
  const statusConfig = {
    OFFLINE: {
      label: 'Offline (Saved Locally)',
      dotColor: 'bg-amber-500',
      textColor: 'text-amber-500 dark:text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/20',
      icon: <WifiOff className="w-3.5 h-3.5 text-amber-500 shrink-0" />,
      description: 'Working offline. Scoring and match events are saved immediately to IndexedDB and will sync automatically when connected.',
    },
    SYNCING: {
      label: 'Syncing Changes...',
      dotColor: 'bg-blue-500 animate-pulse',
      textColor: 'text-blue-500 dark:text-blue-400',
      bgColor: 'bg-blue-500/10 border-blue-500/20',
      icon: <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />,
      description: 'Synchronizing pending match updates and scorecards with the cloud backend.',
    },
    PENDING: {
      label: pendingCount === 1 ? '1 Change Pending' : `${pendingCount} Changes Pending`,
      dotColor: 'bg-amber-500 animate-ping',
      textColor: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/20',
      icon: <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />,
      description: `${pendingCount} scoring operation(s) queued safely in local outbox waiting for server acknowledgment.`,
    },
    SYNCED: {
      label: isOfflineReady ? 'Offline Ready • Synced' : 'Cloud Synced',
      dotColor: 'bg-emerald-500',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-500/10 border-emerald-500/20',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />,
      description: isOfflineReady
        ? 'Application is 100% prepared for offline scoring. All data is backed up.'
        : 'All local scoring data and match records are backed up in the cloud.',
    },
    ERROR: {
      label: 'Sync Retrying',
      dotColor: 'bg-rose-500',
      textColor: 'text-rose-500 dark:text-rose-400',
      bgColor: 'bg-rose-500/10 border-rose-500/20',
      icon: <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />,
      description: errorMessage || 'Transient network error. Automatic retry scheduled with backoff.',
    },
  };

  // If offline setup is in progress, adjust label
  const isSetupInProgress = offlineSetup.status === 'in_progress';
  const isSetupFailed = offlineSetup.status === 'failed';

  let current = statusConfig[syncState];
  if (isSetupInProgress && isOnline) {
    current = {
      ...current,
      label: `Preparing Offline (${offlineSetup.progress}%)`,
      description: offlineSetup.message || 'Caching application shell and storing starter squads for offline use.',
    };
  } else if (isSetupFailed && isOnline && syncState === 'SYNCED') {
    current = {
      ...current,
      label: 'Offline Setup Incomplete',
      textColor: 'text-amber-500 dark:text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/20',
      icon: <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />,
      description: offlineSetup.error || 'Essential offline resources could not be cached. Click to retry setup.',
    };
  }

  if (variant === 'compact') {
    return (
      <>
        <button
          type="button"
          onClick={toggleModal}
          aria-expanded={showModal}
          aria-haspopup="dialog"
          suppressHydrationWarning
          className={`relative flex items-center gap-1.5 px-2 py-1 rounded-lg border text-caption font-semibold transition-all cursor-pointer ${current.bgColor} ${current.textColor} ${showModal ? 'z-[60]' : ''}`}
          title={`${current.label} — Click to toggle details`}
          data-testid="sync-indicator-toggle"
        >
          {syncState === 'SYNCING' || syncingManual ? (
            <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
          ) : (
            <span className={`w-2 h-2 rounded-full shrink-0 ${current.dotColor}`} />
          )}
          <span className="hidden sm:inline text-[11px] truncate" suppressHydrationWarning>{current.label}</span>
          {isUpdateAvailable && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce ml-0.5" />
          )}
        </button>

        {renderModal()}
      </>
    );
  }

  return (
    <>
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={toggleModal}
          aria-expanded={showModal}
          aria-haspopup="dialog"
          suppressHydrationWarning
          className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg border text-caption font-semibold transition-all hover:opacity-90 cursor-pointer ${current.bgColor} ${current.textColor} ${showModal ? 'z-[60] relative' : ''}`}
        >
          <span className="flex items-center gap-1.5 truncate">
            <span className={`w-2 h-2 rounded-full shrink-0 ${current.dotColor}`} />
            <span className="truncate" suppressHydrationWarning>{current.label}</span>
          </span>
          {current.icon}
        </button>

        {isUpdateAvailable && (
          <button
            type="button"
            onClick={applyUpdate}
            className="flex items-center justify-between w-full px-2 py-1 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
          >
            <span className="flex items-center gap-1">
              <ArrowUpCircle className="w-3 h-3 text-emerald-500" />
              <span>Update Ready</span>
            </span>
            <span className="underline">Apply</span>
          </button>
        )}
      </div>

      {renderModal()}
    </>
  );

  function renderModal() {
    return (
      <AnimatePresence>
        {showModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none"
            onClick={() => setShowModal(false)}
            data-testid="sync-modal-backdrop"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 0 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -40 }}
              transition={{ duration: 0.2, ease: [0.0, 0.0, 0.2, 1] }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.6, bottom: 0.05 }}
              onDragEnd={(_, info) => {
                // Swipe-up threshold on drag release: at least 40px upward or velocity < -250
                if (info.offset.y < -40 || (info.offset.y < -20 && info.velocity.y < -250)) {
                  setShowModal(false);
                }
              }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm max-h-[90vh] overflow-y-auto bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-2xl space-y-4 text-left touch-pan-y"
              data-testid="sync-modal-content"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${current.bgColor}`}>{current.icon}</div>
                  <div>
                    <h3 className="font-bold text-sm text-[var(--foreground)]">Sync & Storage Status</h3>
                    <p className="text-xs text-[var(--muted-foreground)]">Enterprise Offline-First</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="p-1 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] transition-colors cursor-pointer"
                  aria-label="Close Information Panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status Banner */}
              <div className={`p-3 rounded-xl border ${current.bgColor} space-y-1`}>
                <div className="flex items-center gap-2 font-bold text-xs">
                  <span className={`w-2 h-2 rounded-full ${current.dotColor}`} />
                  <span className={current.textColor}>{current.label}</span>
                </div>
                <p className="text-xs text-[var(--muted-foreground)] leading-snug">
                  {current.description}
                </p>
              </div>

              {/* Diagnostic Grid */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--muted)]/50">
                  <span className="text-[var(--muted-foreground)]">Network Adapter:</span>
                  <span className="font-semibold flex items-center gap-1">
                    {isOnline ? (
                      <>
                        <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-500">Connected</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-amber-500">Disconnected</span>
                      </>
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--muted)]/50">
                  <span className="text-[var(--muted-foreground)]">Pending Outbox:</span>
                  <span className="font-bold text-[var(--foreground)]">
                    {pendingCount} operation{pendingCount === 1 ? '' : 's'}
                  </span>
                </div>

                {lastSyncedAt && (
                  <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--muted)]/50">
                    <span className="text-[var(--muted-foreground)]">Last Acknowledged:</span>
                    <span className="text-[var(--foreground)] font-mono text-[11px]" suppressHydrationWarning>
                      {lastSyncedAt.toLocaleTimeString()}
                    </span>
                  </div>
                )}

                {storageEstimate && (
                  <div className="p-2 rounded-lg bg-[var(--muted)]/50 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--muted-foreground)] flex items-center gap-1">
                        <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                        IndexedDB Storage:
                      </span>
                      <span className="font-semibold text-[var(--foreground)]">
                        {storageEstimate.persisted ? 'Persisted' : 'Best-Effort'}
                      </span>
                    </div>
                    {storageEstimate.quotaMB > 0 && (
                      <div className="text-[11px] text-[var(--muted-foreground)]">
                        {storageEstimate.usageMB} MB used of {storageEstimate.quotaMB} MB limit
                      </div>
                    )}
                  </div>
                )}

                <div className="p-2 rounded-lg bg-[var(--muted)]/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--muted-foreground)] flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                      Offline Readiness:
                    </span>
                    <span className={`font-semibold ${isOfflineReady ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {isOfflineReady ? 'Verified & Ready' : isSetupInProgress ? `${offlineSetup.progress}%` : 'Incomplete'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    {isOfflineReady
                      ? 'App shell, starter squads, and match engine are locally stored for offline use.'
                      : offlineSetup.message || 'Connecting to prepare offline resources.'}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 space-y-2">
                {isSetupFailed && isOnline && (
                  <button
                    type="button"
                    onClick={handleRetryOfflineSetup}
                    disabled={retryingSetup}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${retryingSetup ? 'animate-spin' : ''}`} />
                    <span>{retryingSetup ? 'Retrying Setup...' : 'Retry Offline Setup'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={!isOnline || syncingManual}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingManual ? 'animate-spin' : ''}`} />
                  <span>{syncingManual ? 'Syncing...' : 'Sync Now'}</span>
                </button>

                {isUpdateAvailable && (
                  <button
                    type="button"
                    onClick={applyUpdate}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    <ArrowUpCircle className="w-3.5 h-3.5" />
                    <span>Apply App Update</span>
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }
}
