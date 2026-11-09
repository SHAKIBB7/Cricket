'use client';

import React from 'react';
import { UnifiedModal } from './UnifiedModal';
import { useLanguage } from '@/context/LanguageContext';

export interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive confirmations take the highest (critical) z tier and a danger-styled confirm button. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The one confirmation dialog (master prompt Phases 2 & 5) — replaces
 * the native window.confirm() calls scattered through the app.
 * Destructive actions always require this explicit confirmation, above
 * whatever sheet/modal is active, and are never gesture-triggered.
 */
export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const { t } = useLanguage();
  const confirmText = confirmLabel ?? t('confirm', 'Confirm');
  const cancelText = cancelLabel ?? t('cancel', 'Cancel');
  return (
    <UnifiedModal
      open={open}
      onClose={onCancel}
      tier={destructive ? 'critical' : 'confirmation'}
      ariaLabel={title}
      dismissOnBackdrop={!destructive}
    >
      <div className="p-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-2 text-sm text-[var(--muted-foreground)]">{description}</p>}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] flex-1 rounded-xl border border-[var(--border)] px-4 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-[44px] flex-1 rounded-xl px-4 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            style={
              destructive
                ? { background: 'var(--danger)', color: '#ffffff' }
                : { background: 'var(--primary)', color: 'var(--primary-foreground)' }
            }
          >
            {confirmText}
          </button>
        </div>
      </div>
    </UnifiedModal>
  );
}
