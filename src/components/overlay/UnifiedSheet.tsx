'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useDragControls, useMotionValue, type PanInfo } from 'framer-motion';
import { X } from 'lucide-react';
import { BACKDROP_VARIANTS, EASINGS } from '@/lib/animations';
import {
  OVERLAY_Z_INDEX,
  detentHeights,
  resolveSnapTarget,
  type SheetDetent,
} from '@/lib/overlay';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useViewportMetrics } from '@/hooks/useViewportMetrics';
import { useOverlaySlot } from './OverlayProvider';
import { useLanguage } from '@/context/LanguageContext';

export interface UnifiedSheetProps {
  open: boolean;
  /** Dismissal funnel for backdrop, Escape, handle flick-down and the close button. Owners wrap with useDismissGuard for unsaved-changes protection. */
  onClose: () => void;
  /** 1–3 detents as viewport-height fractions, any order. Default HALF + FULL. */
  detents?: readonly SheetDetent[];
  /** Index into the ascending detent list. Default 0 (lowest). */
  initialDetent?: number;
  /** Allow flick/drag below the lowest detent to dismiss. Default true. */
  dismissible?: boolean;
  /** Backdrop click dismisses. Default true. Required-step flows (e.g. player selection mid-scoring) pass false to preserve their no-backdrop-dismiss semantics. */
  dismissOnBackdrop?: boolean;
  /** 'sheet' (default) is the bottom sheet. 'page' takes over the full visual viewport as a page: no backdrop, no drag handle, no detents or drag gestures — same portal, focus trap, scroll lock, Escape and supersede plumbing. */
  presentation?: 'sheet' | 'page';
  /** Custom header content rendered in the drag region under the handle, replacing the default title row. */
  header?: React.ReactNode;
  /** Registers with OverlayProvider so another primary overlay supersedes this one. */
  overlayId?: string;
  ariaLabel: string;
  title?: string;
  children: React.ReactNode;
}

/**
 * The one bottom-sheet primitive (master prompt Phases 2–4, 7, 8, 10).
 *
 * Detent model: the panel is laid out at the FULL detent height and
 * translated down by (full − current) px, so only the top slice shows —
 * the same model iOS sheets use. Dragging happens ONLY from the header
 * region (drag handle + title bar) via drag controls; content scrolls
 * freely and can never drag the sheet, which makes scroll arbitration
 * absolute and guarantees sheet gestures can never reach scoring
 * controls. On release, resolveSnapTarget settles the sheet at a
 * configured detent or dismisses it — never an arbitrary position.
 * The handle is also a keyboard control (ArrowUp/ArrowDown change
 * detent), so detents are not drag-only (WCAG).
 */
export function UnifiedSheet({
  open,
  onClose,
  detents = [0.5, 0.92],
  initialDetent = 0,
  dismissible = true,
  dismissOnBackdrop = true,
  presentation = 'sheet',
  header,
  overlayId,
  ariaLabel,
  title,
  children,
}: UnifiedSheetProps) {
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const { height: viewportHeight, offsetTop: viewportOffsetTop } = useViewportMetrics();
  const isPage = presentation === 'page';
  // A page is exactly one full-viewport detent; the entrance/settle math
  // below then rests it at y = 0 with no snap behaviour.
  const heights = useMemo(
    () => detentHeights(isPage ? [1] : detents, viewportHeight),
    [isPage, detents, viewportHeight],
  );
  const fullHeight = heights.length ? heights[heights.length - 1] : 0;

  const y = useMotionValue(0);
  const controls = useDragControls();
  const enteredRef = useRef(false);

  /** Animate the sheet off-screen, then notify the owner. Every dismissal path funnels through here. */
  const requestClose = useCallback(() => {
    if (!fullHeight) {
      onCloseRef.current();
      return;
    }
    animate(y, fullHeight, { duration: 0.18 }).then(() => onCloseRef.current());
  }, [fullHeight, y]);

  const { shouldReduceMotion } = useModalOverlay({
    isOpen: open,
    onClose: requestClose,
    closeOnEscape: true,
    lockScroll: true,
  });
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const { isSuperseded } = useOverlaySlot(overlayId, open);
  useEffect(() => {
    if (isSuperseded) requestClose();
  }, [isSuperseded, requestClose]);

  const [detentIndex, setDetentIndex] = useState(initialDetent);
  const detentIndexRef = useRef(detentIndex);
  detentIndexRef.current = detentIndex;

  useEffect(() => {
    if (!open) {
      enteredRef.current = false;
      return;
    }
    setDetentIndex((i) => Math.min(Math.max(i, 0), Math.max(0, heights.length - 1)));
  }, [open, heights.length]);

  // Entrance + settle: on open, start below the screen, then spring to
  // the active detent. Re-runs when the detent or viewport changes
  // (rotation, keyboard) so the sheet always rests exactly on a detent.
  useEffect(() => {
    if (!open || !fullHeight) return;
    if (!enteredRef.current) {
      y.set(fullHeight);
      enteredRef.current = true;
    }
    const target = fullHeight - (heights[detentIndex] ?? fullHeight);
    const anim = animate(y, target, shouldReduceMotion ? { duration: 0.12 } : EASINGS.springGentle);
    return anim.stop;
  }, [open, fullHeight, heights, detentIndex, y, shouldReduceMotion]);

  if (!mounted) return null;

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const current = heights[detentIndexRef.current] ?? fullHeight;
    const startY = fullHeight - current;
    const resolution = resolveSnapTarget({
      heights,
      currentHeight: current,
      offsetY: y.get() - startY,
      velocityY: info.velocity.y,
      dismissible,
    });
    if (resolution.dismiss) {
      requestClose();
    } else {
      setDetentIndex(resolution.index);
    }
  };

  const stepDetent = (dir: 1 | -1) => {
    setDetentIndex((i) => Math.min(heights.length - 1, Math.max(0, i + dir)));
  };

  // The layer below is sized and positioned to the VISUAL viewport, not
  // the layout viewport: on iOS the keyboard leaves fixed layers
  // anchored to the layout bottom (hidden under the keyboard) while the
  // visual viewport pans up by offsetTop. Tracking top + height from
  // useViewportMetrics keeps the sheet — and any input inside it —
  // inside the visible region at all times (bug report 2026-11-10).
  return createPortal(
    <AnimatePresence>
      {open && fullHeight > 0 && (
        <div
          className="fixed inset-x-0"
          style={{ zIndex: OVERLAY_Z_INDEX.sheet, top: viewportOffsetTop, height: viewportHeight }}
        >
          {!isPage && (
            <motion.div
              className="absolute inset-0 bg-slate-950/60"
              variants={BACKDROP_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={dismissOnBackdrop ? requestClose : undefined}
              aria-hidden="true"
            />
          )}
          <motion.div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            tabIndex={-1}
            className={
              isPage
                ? 'absolute inset-x-0 bottom-0 flex w-full flex-col overflow-hidden bg-[var(--card)] text-[var(--foreground)] outline-none'
                : 'absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border-t border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-elev3 outline-none'
            }
            style={{ y, height: fullHeight, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            drag={isPage ? false : 'y'}
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: fullHeight }}
            dragElastic={{ top: 0, bottom: 0.12 }}
            onDragEnd={handleDragEnd}
          >
            <div
              className={isPage ? 'flex shrink-0 flex-col' : 'flex shrink-0 touch-none flex-col'}
              onPointerDown={isPage ? undefined : (e) => controls.start(e)}
            >
              {!isPage && (
                <div className="flex justify-center pt-2.5 pb-1">
                  <button
                    type="button"
                    aria-label={`${ariaLabel}: drag or use arrow keys to resize, detent ${detentIndex + 1} of ${heights.length}`}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') stepDetent(1);
                      if (e.key === 'ArrowDown') stepDetent(-1);
                    }}
                    className="flex h-6 w-16 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                  >
                    <span className="h-1.5 w-10 rounded-full bg-[var(--border)]" aria-hidden="true" />
                  </button>
                </div>
              )}
              {header ?? (
                <div className="flex items-center justify-between px-4 pb-2">
                  <h2 className="text-base font-semibold">{title}</h2>
                  <button
                    type="button"
                    onClick={requestClose}
                    aria-label={t('hbe_close', 'Close')}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
