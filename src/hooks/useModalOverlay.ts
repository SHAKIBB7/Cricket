'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

// Global counter for active open modals to safely handle nested or stacked modals
let openModalsCount = 0;
let originalOverflow = '';
let originalOverscroll = '';

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
    }
    openModalsCount += 1;

    return () => {
      openModalsCount = Math.max(0, openModalsCount - 1);
      if (openModalsCount === 0) {
        document.body.style.overflow = originalOverflow || '';
        document.body.style.overscrollBehavior = originalOverscroll || '';
      }
    };
  }, [isOpen, lockScroll]);

  // Handle Escape key navigation
  useEffect(() => {
    if (!isOpen || !closeOnEscape) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Prevent default browser behavior and stop propagation
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeOnEscape]);

  return {
    shouldReduceMotion,
  };
}
