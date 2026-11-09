'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { GitBranch, Cloud, Smartphone } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { ConfirmationDialog } from '@/components/overlay/ConfirmationDialog';
import {
  SyncEngine,
  type SyncConflictChoice,
  type SyncConflictEntityType,
  type SyncConflictItem,
} from '@/infrastructure/sync/SyncEngine';

interface SyncConflictsSectionProps {
  /** Called after a successful resolution so the page can refresh its stats. */
  onRestoreComplete?: () => void;
  /** Routes feedback through the profile page's banner, like the backup sections. */
  onNotify?: (message: { type: 'success' | 'error' | 'info'; text: string }) => void;
}

/**
 * Pick-a-version UI for sync conflicts.
 *
 * When a cloud pull would overwrite a record that still has
 * unsynced local work, SyncEngine preserves the local copy as a
 * CONFLICT branch record instead of discarding it. This section
 * lists those branches and lets the user decide, per item,
 * which version wins:
 *  - "Keep my version"  → the preserved copy on THIS device
 *    replaces the cloud version (uploaded on the next sync).
 *  - "Keep cloud version" → the preserved copy is discarded;
 *    the cloud version that won the pull stays.
 *
 * Renders nothing while loading or when there are no conflicts.
 */
export function SyncConflictsSection({ onRestoreComplete, onNotify }: SyncConflictsSectionProps) {
  const { t } = useLanguage();
  const [conflicts, setConflicts] = useState<SyncConflictItem[] | null>(null);
  const [pending, setPending] = useState<{
    item: SyncConflictItem;
    choice: SyncConflictChoice;
  } | null>(null);
  const [resolving, setResolving] = useState(false);

  const load = useCallback(async () => {
    try {
      setConflicts(await SyncEngine.listConflicts());
    } catch {
      setConflicts([]);
    }
  }, []);

  useEffect(() => {
    let live = true;
    SyncEngine.listConflicts()
      .then((items) => {
        if (live) setConflicts(items);
      })
      .catch(() => {
        if (live) setConflicts([]);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!conflicts || conflicts.length === 0) return null;

  const entityLabel = (entityType: SyncConflictEntityType): string => {
    switch (entityType) {
      case 'match':
        return t('sync_conflict_entity_match', 'Match');
      case 'team':
        return t('sync_conflict_entity_team', 'Team');
      case 'tournament':
        return t('sync_conflict_entity_tournament', 'Tournament');
      case 'ground':
        return t('sync_conflict_entity_ground', 'Ground');
    }
  };

  const handleConfirm = async () => {
    if (!pending || resolving) return;
    setResolving(true);
    try {
      const ok = await SyncEngine.resolveConflict(
        pending.item.branchId,
        pending.item.entityType,
        pending.choice
      );
      if (ok) {
        onNotify?.({
          type: 'success',
          text:
            pending.choice === 'keep-local'
              ? t(
                  'sync_conflict_resolved_local',
                  'Your version was kept. It will upload on the next sync.'
                )
              : t(
                  'sync_conflict_resolved_remote',
                  'Cloud version kept. Your preserved copy was removed.'
                ),
        });
        setPending(null);
        await load();
        onRestoreComplete?.();
      } else {
        onNotify?.({
          type: 'error',
          text: t(
            'sync_conflict_resolve_error',
            'Could not resolve that conflict. Please try again.'
          ),
        });
        setPending(null);
      }
    } finally {
      setResolving(false);
    }
  };

  return (
    <div
      className="bg-[var(--card)] rounded-2xl border border-amber-500/40 p-4 sm:p-5 shadow-xs space-y-4"
      data-testid="sync-conflicts-section"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <GitBranch className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-[var(--foreground)] text-body leading-tight">
              {t('sync_conflicts_title', 'Sync Conflicts')}
            </h3>
            <p className="text-caption text-[var(--muted-foreground)] mt-0.5">
              {t(
                'sync_conflicts_desc',
                'The cloud saved a different version of these items while this device had unsynced changes. Your version on this device was kept safe — pick which version to keep for each item.'
              )}
            </p>
          </div>
        </div>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0">
          {conflicts.length}
        </span>
      </div>

      <div className="space-y-2.5">
        {conflicts.map((item) => (
          <div
            key={item.branchId}
            className="border border-[var(--border)] rounded-xl p-3 space-y-2.5 bg-muted/30"
            data-testid={`sync-conflict-${item.branchId}`}
          >
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--muted)] border border-[var(--border)] text-[var(--muted-foreground)]">
                {entityLabel(item.entityType)}
              </span>
              <span className="font-semibold text-body-small text-[var(--foreground)] truncate">
                {item.name}
              </span>
              {item.updatedAt && (
                <span className="text-[11px] text-[var(--muted-foreground)]">
                  {t('sync_conflict_updated', 'Changed')}{' '}
                  {new Date(item.updatedAt).toLocaleString()}
                </span>
              )}
            </div>

            <p className="text-caption text-[var(--muted-foreground)] flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
              <span>
                {t('sync_conflicts_this_device', 'This device')} ={' '}
                {t('sync_conflicts_your_copy', 'your preserved copy')}
              </span>
              <span aria-hidden="true">·</span>
              <Cloud className="w-3.5 h-3.5 shrink-0" />
              <span>
                {t('sync_conflicts_cloud', 'Cloud')} ={' '}
                {t('sync_conflicts_cloud_won', 'the version now saved')}
              </span>
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={resolving}
                onClick={() => setPending({ item, choice: 'keep-local' })}
                data-testid={`sync-conflict-keep-local-${item.primaryId}`}
                className="bg-success hover:bg-success/90 text-white font-bold py-1.5 px-3 rounded-lg text-caption shadow-xs disabled:opacity-50 active:scale-98 transition-all"
              >
                {t('sync_conflict_keep_local', 'Keep my version')}
              </button>
              <button
                type="button"
                disabled={resolving}
                onClick={() => setPending({ item, choice: 'keep-remote' })}
                data-testid={`sync-conflict-keep-remote-${item.primaryId}`}
                className="bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)] border border-[var(--border)] font-semibold py-1.5 px-3 rounded-lg text-caption disabled:opacity-50 active:scale-98 transition-all"
              >
                {t('sync_conflict_keep_remote', 'Keep cloud version')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmationDialog
        open={!!pending}
        destructive
        title={
          pending
            ? `${t('sync_conflict_resolve_title', 'Resolve conflict')} — ${pending.item.name}`
            : ''
        }
        description={
          pending?.choice === 'keep-local'
            ? t(
                'sync_conflict_keep_local_desc',
                'Your version from this device will replace the cloud version and upload automatically the next time you are online. The cloud version will be overwritten.'
              )
            : t(
                'sync_conflict_keep_remote_desc',
                'The cloud version stays. Your preserved copy from this device will be deleted and cannot be recovered.'
              )
        }
        confirmLabel={
          pending?.choice === 'keep-local'
            ? t('sync_conflict_keep_local', 'Keep my version')
            : t('sync_conflict_keep_remote', 'Keep cloud version')
        }
        cancelLabel={t('sync_conflict_cancel', 'Cancel')}
        onConfirm={handleConfirm}
        onCancel={() => {
          if (!resolving) setPending(null);
        }}
      />
    </div>
  );
}
