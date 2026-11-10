'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BACKDROP_VARIANTS, MODAL_VARIANTS } from '@/lib/animations';
import { OVERLAY_Z_INDEX, type OverlayTier } from '@/lib/overlay';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useOverlaySlot } from './OverlayProvider';
import { cn } from '@/lib/utils';

export interface UnifiedModalProps {
  open: boolean;
  /** Dismissal funnel: backdrop, Escape and the close affordance all call this. Owners wrap it with useDismissGuard for unsaved-changes protection. */
  onClose: () => void;
  /** Priority tier (default 'modal'). Confirmations use 'confirmation' / 'critical'. */
  tier?: Extract<OverlayTier, 'modal' | 'confirmation' | 'critical'>;
  /** Registers with OverlayProvider so another primary overlay supersedes this one. */
  overlayId?: string;
  ariaLabel: string;
  dismissOnBackdrop?: boolean;
  dismissOnEscape?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * The one centered-dialog primitive (master prompt Phases 2, 8, 10).
 * Portal-rendered, refcounted body scroll lock + Escape via the
 * existing useModalOverlay hook, focus trap with restoration,
 * role="dialog" + aria-modal, shared animation variants, tier z-index.
 */
export function UnifiedModal({
  open,
  onClose,
  tier = 'modal',
  overlayId,
  ariaLabel,
  dismissOnBackdrop = true,
  dismissOnEscape = true,
  children,
  className = '',
}: UnifiedModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useModalOverlay({ isOpen: open, onClose, closeOnEscape: dismissOnEscape, lockScroll: true });
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const { isSuperseded } = useOverlaySlot(overlayId, open);

  useEffect(() => {
    if (isSuperseded) onClose();
  }, [isSuperseded, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: OVERLAY_Z_INDEX[tier] }}
        >
          <motion.div
            className="absolute inset-0 bg-slate-950/60"
            variants={BACKDROP_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={dismissOnBackdrop ? onClose : undefined}
            aria-hidden="true"
          />
          <motion.div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            tabIndex={-1}
            className={cn('relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-elev3 outline-none max-h-[calc(100dvh-2rem)] overflow-y-auto', className)}
            variants={MODAL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
