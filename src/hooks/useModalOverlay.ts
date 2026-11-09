'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

// Global counter for active open modals to safely handle nested or stacked modals
let openModalsCount = 0;
let originalOverflow = '';
let originalOverscroll = '';

/**
 * Shared Escape stack (audit F4-09). Every open overlay that wants
 * Escape-to-close registers an entry here instead of attaching its own
 * window listener; a single shared listener dispatches Escape to the
 * MOST RECENTLY OPENED still-open overlay only, so one keypress closes
 * one layer (e.g. a ConfirmationDialog above a UnifiedModal) instead of
 * the whole stack at once.
 */
interface EscapeStackEntry {
  id: number;
  close: () => void;
}

const escapeStack: EscapeStackEntry[] = [];
let nextEscapeEntryId = 1;
let escapeListenerAttached = false;

function ensureEscapeListener() {
  if (escapeListenerAttached || typeof window === 'undefined') return;
  escapeListenerAttached = true;
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    const top = escapeStack[escapeStack.length - 1];
    if (!top) return;
    e.preventDefault();
    e.stopPropagation();
    top.close();
  });
}

export interface UseModalOverlayOptions {
  isOpen: boolean;
  onClose?: () => void;
  closeOnEscape?: boolean;
  lockScroll?: boolean;
}

/**
 * Enterprise hook for managing modal dialog lifecycle, body scroll locking,
 * keyboard accessibility (Escape-to-close), and reduced motion compliance.
 */
export function useModalOverlay({
  isOpen,
  onClose,
  closeOnEscape = true,
  lockScroll = true,
}: UseModalOverlayOptions) {
  const shouldReduceMotion = useReducedMotion();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Handle body scroll locking with nested modal protection
  useEffect(() => {
    if (typeof document === 'undefined' || !isOpen || !lockScroll) {
      return;
    }

    if (openModalsCount === 0) {
      originalOverflow = document.body.style.overflow;
      originalOverscroll = document.body.style.overscrollBehavior;
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'contain';
      document.body.setAttribute('data-modal-open', 'true');
      document.body.classList.add('modal-open');
    }
    openModalsCount += 1;

    return () => {
      openModalsCount = Math.max(0, openModalsCount - 1);
      if (openModalsCount === 0) {
        document.body.style.overflow = originalOverflow || '';
        document.body.style.overscrollBehavior = originalOverscroll || '';
        document.body.removeAttribute('data-modal-open');
        document.body.classList.remove('modal-open');
      }
    };
  }, [isOpen, lockScroll]);

  // Handle Escape key navigation via the shared stack (F4-09): only
  // the topmost still-open overlay responds to a given Escape press.
  useEffect(() => {
    if (!isOpen || !closeOnEscape) {
      return;
    }

    ensureEscapeListener();
    const entry: EscapeStackEntry = {
      id: nextEscapeEntryId++,
      close: () => onCloseRef.current?.(),
    };
    escapeStack.push(entry);

    return () => {
      const idx = escapeStack.indexOf(entry);
      if (idx !== -1) escapeStack.splice(idx, 1);
    };
  }, [isOpen, closeOnEscape]);

  return {
    shouldReduceMotion,
  };
}
