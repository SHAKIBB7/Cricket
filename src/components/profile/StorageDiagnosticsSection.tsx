'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useSyncStatusOptional } from '@/context/SyncContext';
import { useLanguage } from '@/context/LanguageContext';
import { StorageManagerService } from '@/infrastructure/storage/StorageManagerService';

/**
 * P5 (D5) — live device-storage surfacing inside the profile's
 * System & Developer Diagnostics block. The StorageManagerService
 * always had the numbers; nothing showed them. Renders the usage,
 * the persistence (eviction-protection) state in plain language,
 * a low-space warning when the estimate says space is tight, and
 * — while storage is still best-effort — a button that asks the
 * browser to protect it. Outside a SyncProvider (isolated
 * renders) it degrades to a "measuring" state instead of
 * throwing.
 */
export function StorageDiagnosticsSection() {
  const sync = useSyncStatusOptional();
  const { t } = useLanguage();
  const estimate = sync?.storageEstimate ?? null;
  const [protecting, setProtecting] = useState(false);
  // P7: the device identity stamped onto every sync op.
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    StorageManagerService.getOrCreateDeviceId()
      .then((id) => {
        if (live) setDeviceId(id);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const handleProtect = async () => {
    setProtecting(true);
    try {
      await StorageManagerService.requestPersistence();
      await sync?.refreshStorage();
    } finally {
      setProtecting(false);
    }
  };

  return (
    <div className="space-y-1.5 text-[var(--muted-foreground)]">
      <p>
        <strong>{t('storage_device_label', 'Device Storage:')}</strong>{' '}
        {estimate && estimate.supported
          ? `${estimate.usageMB} ${t('storage_mb_of', 'MB of')} ${estimate.quotaMB} ${t('storage_mb_used', 'MB used')} (${estimate.usagePercent.toFixed(1)}%)`
          : t('storage_measuring', 'Measuring…')}
      </p>
      <p>
        <strong>{t('storage_protection_label', 'Storage Protection:')}</strong>{' '}
        {!estimate
          ? t('storage_measuring', 'Measuring…')
          : estimate.persisted
            ? t('storage_persistent_desc', 'Persistent — the browser will not clear this data automatically')
            : t('storage_best_effort_desc', 'Best-effort — the browser may clear this data under storage pressure')}
      </p>
      <p>
        <strong>{t('device_id_label', 'Device ID:')}</strong> {deviceId ?? '…'}
      </p>
      {estimate?.isLowSpace && (
        <p className="text-amber-500">
          <strong>{t('storage_low_space', 'Low space:')}</strong> {t('storage_low_space_desc', 'less than 20 MB of storage quota remains. Consider exporting a backup from the Google Drive section above.')}
        </p>
      )}
      {estimate && !estimate.persisted && (
        <button
          type="button"
          onClick={handleProtect}
          disabled={protecting}
          className="inline-flex items-center gap-1.5 mt-1 bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] px-2.5 py-1.5 rounded-lg font-semibold text-caption text-[var(--foreground)] shadow-elev1 active:scale-95 cursor-pointer disabled:opacity-50"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>{protecting ? t('storage_requesting', 'Requesting…') : t('protect_storage', 'Protect storage')}</span>
        </button>
      )}
    </div>
  );
}
