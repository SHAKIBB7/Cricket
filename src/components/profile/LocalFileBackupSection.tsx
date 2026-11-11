'use client';

import React, { useRef, useState } from 'react';
import { FileJson, Download, Upload, AlertCircle, X, RefreshCw } from 'lucide-react';
import { StorageManagerService } from '@/infrastructure/storage/StorageManagerService';
import { useLanguage } from '@/context/LanguageContext';
import { Entrance } from '@/components/motion/Entrance';

interface LocalFileBackupSectionProps {
  onRestoreComplete?: () => void;
  onNotify?: (message: { type: 'success' | 'error' | 'info'; text: string }) => void;
}

/** Blob.text() is not universal (older Safari); FileReader is. */
async function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}

interface PendingImport {
  jsonString: string;
  fileName: string;
  exportedAt?: string;
  counts: { matches: number; matchEvents: number; teams: number; tournaments: number; grounds: number };
}

/**
 * PWA programme P6 — local file backup & restore. The service
 * (exportDatabase/importDatabase) existed and was tested long
 * before any screen exposed it; this section is that screen.
 * It mirrors the Google Drive section's idioms: a restore
 * dialog showing the file's record counts with a mode choice
 * (merge default / replace), and — per D6 — a replace restore
 * first downloads a snapshot of the data it is about to erase,
 * aborting if the snapshot cannot be created.
 */
export function LocalFileBackupSection({ onRestoreComplete, onNotify }: LocalFileBackupSectionProps) {
  const { t } = useLanguage();
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNotify = (type: 'success' | 'error' | 'info', text: string) => {
    onNotify?.({ type, text });
    if (type === 'error') setErrorNotice(text);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setErrorNotice(null);
    try {
      const { ok, stats } = await StorageManagerService.downloadBackupSnapshot('cricket-scorer-backup');
      if (!ok || !stats) {
        handleNotify('error', t('fb_err_create', 'Could not create the backup file on this device.'));
        return;
      }
      handleNotify(
        'success',
        `${t('fb_backup_downloaded', 'Backup downloaded:')} ${stats.matches} ${t('fb_matches', 'matches')}, ${stats.teams} ${t('fb_squads', 'squads')}, ${stats.tournaments} ${t('fb_tournaments', 'tournaments')}, ${stats.grounds} ${t('fb_venues', 'venues')}`,
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleFilePicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow picking the same file again
    if (!file) return;
    setErrorNotice(null);
    let text: string;
    try {
      text = await readFileText(file);
    } catch {
      handleNotify('error', t('fb_err_read', 'Could not read that file.'));
      return;
    }
    const peek = StorageManagerService.peekBackupEnvelope(text);
    if (!peek.ok || !peek.counts) {
      handleNotify('error', peek.error || t('fb_err_invalid', 'That file is not a valid Cric Scorer Pro backup.'));
      return;
    }
    setRestoreMode('merge');
    setPendingImport({
      jsonString: text,
      fileName: file.name,
      exportedAt: peek.exportedAt,
      counts: peek.counts,
    });
  };

  const handleConfirmRestore = async () => {
    if (!pendingImport) return;
    setIsImporting(true);
    try {
      // D6: never erase the only copy unprotected.
      if (restoreMode === 'replace') {
        const snapshot = await StorageManagerService.downloadBackupSnapshot('pre-restore-snapshot');
        if (!snapshot.ok) {
          handleNotify(
            'error',
            t('fb_err_snapshot', 'Could not download a safety snapshot of your current data, so the replace restore was cancelled. Your local data was not changed.'),
          );
          setPendingImport(null);
          return;
        }
      }
      const result = await StorageManagerService.importDatabase(pendingImport.jsonString, restoreMode);
      if (!result.success) {
        handleNotify('error', result.error || t('fb_err_restore', 'Failed to restore that backup file.'));
        return;
      }
      const { restored, detail } = result;
      const countsText = `${restored.matches} ${t('fb_matches', 'matches')}, ${restored.teams} ${t('fb_squads', 'squads')}, ${restored.tournaments} ${t('fb_tournaments', 'tournaments')}, ${restored.grounds} ${t('fb_venues', 'venues')}`;
      handleNotify(
        'success',
        restoreMode === 'replace'
          ? `${t('fb_restore_replaced', 'Restore completed (replaced):')} ${countsText}. ${t('fb_restore_replaced_suffix', 'A snapshot of your previous data was downloaded to this device first.')}`
          : `${t('fb_restore_merged', 'Restore completed (merged):')} ${countsText} — ${detail.added} ${t('fb_added', 'added')}, ${detail.updated} ${t('fb_updated', 'updated')}, ${detail.skipped} ${t('fb_kept_newer', 'kept as newer local copies')}`,
      );
      setPendingImport(null);
      onRestoreComplete?.();
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      data-testid="local-file-backup-section"
      className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 shadow-elev1 space-y-4"
    >
      {/* ── CARD HEADER ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <FileJson className="w-5 h-5 text-emerald-600 dark:text-emerald-400 stroke-[1.75]" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-base text-[var(--foreground)] truncate">{t('fb_title', 'Backup & Restore (File)')}</h3>
            <p className="text-[12px] text-[var(--muted-foreground)] leading-snug">
              {t('fb_desc', 'A portable JSON backup saved on this device — no account or cloud needed.')}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            {t('fb_local_file', 'Local File')}
          </span>
        </div>
      </div>

      {/* ── INLINE ERROR ALERT ── */}
      {errorNotice && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-caption text-red-600 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 text-[12px] leading-relaxed">{errorNotice}</div>
          <button
            type="button"
            onClick={() => setErrorNotice(null)}
            className="text-red-500 hover:text-red-700 transition-colors p-0.5"
            aria-label={t('dismiss_error', 'Dismiss error')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── ACTION BUTTONS ── */}
      <div className="flex items-center gap-2.5 flex-wrap pt-1">
        <button
          type="button"
          data-testid="file-backup-download-button"
          onClick={handleExport}
          disabled={isExporting || isImporting}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-semibold text-[13px] inline-flex items-center gap-2 transition-colors shadow-elev2"
        >
          {isExporting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{t('fb_preparing', 'Preparing…')}</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>{t('fb_download_backup', 'Download backup')}</span>
            </>
          )}
        </button>
        <button
          type="button"
          data-testid="file-backup-restore-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isExporting || isImporting}
          className="px-4 py-2 rounded-xl bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] disabled:opacity-50 text-[var(--foreground)] font-semibold text-[13px] inline-flex items-center gap-2 transition-colors shadow-elev1"
        >
          <Upload className="w-4 h-4" />
          <span>{t('fb_restore_from_file', 'Restore from file…')}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleFilePicked}
          aria-label={t('fb_choose_file_aria', 'Choose a Cric Scorer Pro backup file')}
        />
      </div>

      {/* ── RESTORE CONFIRMATION MODAL (mirrors the Drive section) ── */}
      {pendingImport && (
        <Entrance fadeOnly
          data-testid="file-restore-confirmation-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-md w-full p-5 shadow-elev3 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <FileJson className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-base text-[var(--foreground)]">{t('fb_restore_title', 'Restore from Backup File')}</h4>
              </div>
              <button
                type="button"
                onClick={() => !isImporting && setPendingImport(null)}
                className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                aria-label={t('close_dialog', 'Close dialog')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-caption text-[var(--muted-foreground)]">
              <p className="text-[12.5px] text-[var(--foreground)] font-medium">
                {t('fb_backup_file_label', 'Backup file:')} <span className="font-semibold">{pendingImport.fileName}</span>
                {pendingImport.exportedAt && (
                  <span className="block text-[11.5px] font-normal text-[var(--muted-foreground)]">
                    {t('fb_exported', 'Exported')} {new Date(pendingImport.exportedAt).toLocaleString()}
                  </span>
                )}
              </p>
              <p className="text-[12px] leading-relaxed">
                {pendingImport.counts.matches} {t('fb_matches', 'matches')} · {pendingImport.counts.matchEvents} {t('fb_ball_events', 'ball-by-ball events')} ·{' '}
                {pendingImport.counts.teams} {t('fb_squads', 'squads')} · {pendingImport.counts.tournaments} {t('fb_tournaments', 'tournaments')} ·{' '}
                {pendingImport.counts.grounds} {t('fb_venues', 'venues')}
              </p>
              <p className="text-[12px] leading-relaxed">
                {t('fb_choose_restore', 'Choose how you want to restore this archive into your local IndexedDB storage:')}
              </p>

              {/* Mode Selection */}
              <div className="space-y-2 pt-1">
                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    restoreMode === 'merge'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-[var(--border)] bg-[var(--background)] hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="fileRestoreMode"
                    value="merge"
                    checked={restoreMode === 'merge'}
                    onChange={() => setRestoreMode('merge')}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-bold text-[12.5px] text-[var(--foreground)] block">
                      {t('fb_merge_title', 'Merge with Local Data (Recommended)')}
                    </span>
                    <span className="text-[11.5px] text-[var(--muted-foreground)]">
                      {t('fb_merge_desc', 'Adds new records and updates only where the file copy is newer — newer local records are never overwritten.')}
                    </span>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    restoreMode === 'replace'
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-[var(--border)] bg-[var(--background)] hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="fileRestoreMode"
                    value="replace"
                    checked={restoreMode === 'replace'}
                    onChange={() => setRestoreMode('replace')}
                    className="mt-0.5 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="font-bold text-[12.5px] text-amber-600 dark:text-amber-400 block">
                      {t('fb_replace_title', 'Replace Local Data Completely')}
                    </span>
                    <span className="text-[11.5px] text-[var(--muted-foreground)]">
                      {t('fb_replace_desc', 'Clears current local database tables and replaces them entirely with this file. A snapshot of your current data is downloaded to this device before anything is erased.')}
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                disabled={isImporting}
                className="px-3.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)] text-[var(--foreground)] text-[12.5px] font-medium transition-colors"
              >
                {t('cancel', 'Cancel')}
              </button>
              <button
                type="button"
                data-testid="file-confirm-restore-button"
                onClick={handleConfirmRestore}
                disabled={isImporting}
                className={`px-4 py-1.5 rounded-xl text-white font-semibold text-[12.5px] inline-flex items-center gap-1.5 transition-colors shadow-elev2 disabled:opacity-50 ${
                  restoreMode === 'replace'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('fb_restoring', 'Restoring…')}</span>
                  </>
                ) : (
                  <span>{restoreMode === 'replace' ? t('fb_replace_restore', 'Replace & Restore') : t('fb_restore_merge', 'Restore (Merge)')}</span>
                )}
              </button>
            </div>
          </div>
        </Entrance>
      )}
    </div>
  );
}
