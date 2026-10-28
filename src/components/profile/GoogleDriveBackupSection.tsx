'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  GoogleDriveService,
  DriveBackupFile,
  BackupPayload,
  DriveRestoreSummary,
} from '@/infrastructure/storage/GoogleDriveService';
import { useLanguage } from '@/context/LanguageContext';
import {
  HardDrive,
  RefreshCw,
  Upload,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar,
  ShieldCheck,
  ChevronRight,
  Database,
  X,
} from 'lucide-react';

interface GoogleDriveBackupSectionProps {
  userUid?: string | null;
  onRestoreComplete?: () => void;
  onNotify?: (message: { type: 'success' | 'error' | 'info'; text: string }) => void;
}

export function GoogleDriveBackupSection({
  userUid,
  onRestoreComplete,
  onNotify,
}: GoogleDriveBackupSectionProps) {
  const { t } = useLanguage();

  const [isDriveConfigured, setIsDriveConfigured] = useState<boolean>(false);
  const [backups, setBackups] = useState<DriveBackupFile[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState<boolean>(false);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [isRestoringId, setIsRestoringId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Restore Modal State
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<DriveBackupFile | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');

  // Check configuration on mount
  useEffect(() => {
    setIsDriveConfigured(GoogleDriveService.isDriveConfigured());
  }, []);

  const handleNotify = useCallback(
    (type: 'success' | 'error' | 'info', text: string) => {
      if (type === 'error') {
        setErrorNotice(text);
      } else {
        setErrorNotice(null);
      }
      onNotify?.({ type, text });
    },
    [onNotify]
  );

  /**
   * Refreshes the list of backups stored in Google Drive.
   */
  const handleListBackups = useCallback(async () => {
    setIsLoadingBackups(true);
    setErrorNotice(null);
    try {
      const token = await GoogleDriveService.requestAccessToken();
      const files = await GoogleDriveService.listBackups(token);
      setBackups(files);
      if (files.length > 0 && files[0].createdTime) {
        setLastBackupTime(files[0].createdTime);
      }
    } catch (err: any) {
      console.warn('[GoogleDriveBackupSection] List backups error:', err);
      handleNotify('error', err?.message || 'Failed to list Google Drive backups.');
    } finally {
      setIsLoadingBackups(false);
    }
  }, [handleNotify]);

  /**
   * Creates a snapshot of all local data and uploads it to Google Drive.
   */
  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    setErrorNotice(null);
    try {
      const token = await GoogleDriveService.requestAccessToken();
      const payload: BackupPayload = await GoogleDriveService.createBackupPayload(userUid || undefined);
      const uploaded = await GoogleDriveService.uploadBackup(token, payload);

      setLastBackupTime(new Date().toISOString());
      handleNotify('success', `Backup "${uploaded.name}" successfully saved to Google Drive.`);
      // Refresh list immediately
      await handleListBackups();
    } catch (err: any) {
      console.error('[GoogleDriveBackupSection] Backup creation failed:', err);
      handleNotify('error', err?.message || 'Failed to save backup to Google Drive.');
    } finally {
      setIsBackingUp(false);
    }
  };

  /**
   * Restores data from the selected backup file into IndexedDB.
   */
  const handleConfirmRestore = async () => {
    if (!selectedBackupForRestore) return;

    setIsRestoringId(selectedBackupForRestore.id);
    setErrorNotice(null);
    try {
      const token = await GoogleDriveService.requestAccessToken();
      const backupData = await GoogleDriveService.downloadBackup(token, selectedBackupForRestore.id);

      const summary: DriveRestoreSummary = await GoogleDriveService.restoreToIndexedDb(backupData, {
        mode: restoreMode,
        expectedUserUid: userUid || undefined,
      });

      setSelectedBackupForRestore(null);
      onRestoreComplete?.();

      const details = [
        `${summary.matchesCount} matches`,
        `${summary.teamsCount} squads`,
        `${summary.tournamentsCount} tournaments`,
        `${summary.groundsCount ?? 0} venues`,
      ].join(', ');

      handleNotify('success', `Restore completed (${restoreMode === 'replace' ? 'replaced' : 'merged'}): ${details}.`);
    } catch (err: any) {
      console.error('[GoogleDriveBackupSection] Restore failed:', err);
      handleNotify('error', err?.message || 'Failed to restore backup from Google Drive.');
    } finally {
      setIsRestoringId(null);
    }
  };

  /**
   * Permanently deletes a backup file from Google Drive.
   */
  const handleDeleteBackup = async (file: DriveBackupFile) => {
    if (!confirm(`Are you sure you want to permanently delete backup "${file.name}" from Google Drive?`)) {
      return;
    }

    setIsDeletingId(file.id);
    setErrorNotice(null);
    try {
      const token = await GoogleDriveService.requestAccessToken();
      await GoogleDriveService.deleteBackup(token, file.id);
      setBackups((prev) => prev.filter((b) => b.id !== file.id));
      handleNotify('info', `Backup "${file.name}" deleted from Google Drive.`);
    } catch (err: any) {
      console.error('[GoogleDriveBackupSection] Delete failed:', err);
      handleNotify('error', err?.message || 'Failed to delete backup from Google Drive.');
    } finally {
      setIsDeletingId(null);
    }
  };

  /**
   * Helper to format file size in human-readable units.
   */
  const formatFileSize = (bytesStr?: string) => {
    if (!bytesStr) return 'JSON Archive';
    const bytes = Number(bytesStr);
    if (isNaN(bytes) || bytes <= 0) return 'JSON Archive';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  /**
   * Helper to format date strings.
   */
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Unknown date';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      data-testid="google-drive-backup-section"
      className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 shadow-xs space-y-4"
    >
      {/* ── CARD HEADER ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
            <HardDrive className="w-5 h-5 text-blue-600 dark:text-blue-400 stroke-[1.75]" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-base text-[var(--foreground)] truncate">
              {t('google_drive_backup_title', 'Google Drive Archive & Disaster Recovery')}
            </h3>
            <p className="text-caption text-[var(--muted-foreground)] mt-0.5">
              {t(
                'google_drive_backup_desc',
                'Create disaster-recovery snapshots and restore your cricket history on any device'
              )}
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="shrink-0">
          {isDriveConfigured ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
              <span>Drive Ready</span>
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
              title="Set NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable Google Drive OAuth"
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              <span>OAuth Client Notice</span>
            </span>
          )}
        </div>
      </div>

      {/* ── INLINE ERROR ALERT ── */}
      {errorNotice && (
        <div
          data-testid="drive-error-notice"
          className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-caption text-red-600 dark:text-red-400 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 text-[12px] leading-relaxed">{errorNotice}</div>
          <button
            type="button"
            onClick={() => setErrorNotice(null)}
            className="text-red-500 hover:text-red-700 transition-colors p-0.5"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── ACTION BUTTONS ── */}
      <div className="flex items-center gap-2.5 flex-wrap pt-1">
        <button
          type="button"
          data-testid="backup-now-button"
          onClick={handleCreateBackup}
          disabled={isBackingUp || isRestoringId !== null}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-semibold text-[13px] inline-flex items-center gap-2 transition-colors shadow-xs"
        >
          {isBackingUp ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Saving to Drive...</span>
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              <span>Save Snapshot to Drive</span>
            </>
          )}
        </button>

        <button
          type="button"
          data-testid="refresh-backups-button"
          onClick={handleListBackups}
          disabled={isLoadingBackups || isBackingUp}
          className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)] text-[var(--foreground)] text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBackups ? 'animate-spin' : ''}`} />
          <span>{backups.length > 0 ? 'Refresh Archives' : 'View Drive Archives'}</span>
        </button>
      </div>

      {/* ── BACKUPS LIST ── */}
      {backups.length > 0 ? (
        <div data-testid="backups-list" className="space-y-2 pt-2 border-t border-[var(--border)]">
          <div className="flex items-center justify-between text-caption text-[var(--muted-foreground)] px-1">
            <span className="font-semibold text-[12px] text-[var(--foreground)]">
              Available Drive Snapshots ({backups.length})
            </span>
            {lastBackupTime && (
              <span className="text-[11px]">Latest: {formatDate(lastBackupTime)}</span>
            )}
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {backups.map((file) => (
              <div
                key={file.id}
                data-testid={`backup-item-${file.id}`}
                className="p-3 rounded-xl bg-[var(--muted)]/40 border border-[var(--border)] flex items-center justify-between gap-3 transition-colors hover:bg-[var(--muted)]/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                    <p className="font-semibold text-[12.5px] text-[var(--foreground)] truncate">
                      {file.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-[var(--muted-foreground)] mt-1 ml-6">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-[var(--muted-foreground)]" />
                      {formatDate(file.createdTime)}
                    </span>
                    <span>•</span>
                    <span>{formatFileSize(file.size)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    data-testid={`restore-backup-button-${file.id}`}
                    onClick={() => setSelectedBackupForRestore(file)}
                    disabled={isRestoringId !== null || isDeletingId === file.id}
                    className="px-2.5 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[12px] font-semibold inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                  >
                    {isRestoringId === file.id ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Restoring...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>Restore</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    data-testid={`delete-backup-button-${file.id}`}
                    onClick={() => handleDeleteBackup(file)}
                    disabled={isDeletingId !== null || isRestoringId === file.id}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--muted-foreground)] hover:text-red-500 transition-colors disabled:opacity-50"
                    title="Delete backup from Google Drive"
                    aria-label="Delete backup"
                  >
                    {isDeletingId === file.id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-500" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-[var(--muted)]/20 rounded-xl p-3 border border-[var(--border)] text-caption text-[var(--muted-foreground)] space-y-1">
          <p className="font-medium text-[var(--foreground)] text-[12px] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0" />
            <span>Disaster Recovery &amp; Independent Snapshot Archive</span>
          </p>
          <p className="text-[11.5px] leading-relaxed">
            Google Drive backups are self-contained JSON archives stored directly in your Google Drive under least-privilege permissions. You can restore your complete database on any device or browser even without server connectivity.
          </p>
        </div>
      )}

      {/* ── RESTORE CONFIRMATION MODAL ── */}
      {selectedBackupForRestore && (
        <div
          data-testid="restore-confirmation-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-md w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Database className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-base text-[var(--foreground)]">Restore from Google Drive</h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBackupForRestore(null)}
                className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-caption text-[var(--muted-foreground)]">
              <p className="text-[12.5px] text-[var(--foreground)] font-medium">
                Restore snapshot: <span className="font-semibold">{selectedBackupForRestore.name}</span>
              </p>
              <p className="text-[12px] leading-relaxed">
                Choose how you want to restore this archive into your local IndexedDB storage:
              </p>

              {/* Mode Selection */}
              <div className="space-y-2 pt-1">
                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    restoreMode === 'merge'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)]/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="restoreMode"
                    value="merge"
                    checked={restoreMode === 'merge'}
                    onChange={() => setRestoreMode('merge')}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-bold text-[12.5px] text-[var(--foreground)] block">
                      Merge with Local Data (Recommended)
                    </span>
                    <span className="text-[11.5px] text-[var(--muted-foreground)]">
                      Upserts matches, squads, and tournaments from the backup without deleting newer local records.
                    </span>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    restoreMode === 'replace'
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)]/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="restoreMode"
                    value="replace"
                    checked={restoreMode === 'replace'}
                    onChange={() => setRestoreMode('replace')}
                    className="mt-0.5 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="font-bold text-[12.5px] text-amber-600 dark:text-amber-400 block">
                      Replace Local Data Completely
                    </span>
                    <span className="text-[11.5px] text-[var(--muted-foreground)]">
                      Clears current local database tables and replaces them entirely with the exact snapshot from this backup.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setSelectedBackupForRestore(null)}
                disabled={isRestoringId !== null}
                className="px-3.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)] text-[var(--foreground)] text-[12.5px] font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-restore-button"
                onClick={handleConfirmRestore}
                disabled={isRestoringId !== null}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[12.5px] inline-flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
              >
                {isRestoringId ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Restoring Data...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Confirm Restore</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
