'use client';

import React, { useState } from 'react';
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
    isUpdateAvailable,
    applyUpdate,
  } = useSyncStatus();

  const [showModal, setShowModal] = useState(false);
  const [syncingManual, setSyncingManual] = useState(false);

  const handleManualSync = async () => {
    setSyncingManual(true);
    try {
      await triggerSync();
    } finally {
      setSyncingManual(false);
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
      description: 'Working offline. Changes are saved locally and will sync when connected.',
    },
    SYNCING: {
      label: 'Syncing Changes...',
      dotColor: 'bg-blue-500 animate-pulse',
      textColor: 'text-blue-500 dark:text-blue-400',
      bgColor: 'bg-blue-500/10 border-blue-500/20',
      icon: <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />,
      description: 'Synchronizing pending match updates with the cloud.',
    },
    PENDING: {
      label: pendingCount === 1 ? '1 Change Pending' : `${pendingCount} Changes Pending`,
      dotColor: 'bg-amber-500 animate-ping',
      textColor: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/20',
      icon: <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />,
      description: `${pendingCount} operation(s) queued in local outbox waiting for synchronization.`,
    },
    SYNCED: {
      label: 'Cloud Synced',
      dotColor: 'bg-emerald-500',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-500/10 border-emerald-500/20',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />,
      description: 'All local scoring data and match records are backed up in the cloud.',
    },
    ERROR: {
      label: 'Sync Retrying',
      dotColor: 'bg-rose-500',
      textColor: 'text-rose-500 dark:text-rose-400',
      bgColor: 'bg-rose-500/10 border-rose-500/20',
      icon: <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />,
      description: errorMessage || 'Transient network error. Automatic retry scheduled.',
    },
  };

  const current = statusConfig[syncState];

  if (variant === 'compact') {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          suppressHydrationWarning
          className={`relative flex items-center gap-1.5 px-2 py-1 rounded-lg border text-caption font-semibold transition-all cursor-pointer ${current.bgColor} ${current.textColor}`}
          title={`${current.label} — Click for details`}
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
          onClick={() => setShowModal(true)}
          suppressHydrationWarning
          className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg border text-caption font-semibold transition-all hover:opacity-90 cursor-pointer ${current.bgColor} ${current.textColor}`}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-2xl space-y-4 text-left"
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
                  onClick={() => setShowModal(false)}
                  className="p-1 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] transition-colors cursor-pointer"
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
              </div>

              {/* Actions */}
              <div className="pt-2 space-y-2">
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
