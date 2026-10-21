'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { triggerHapticFeedback } from '@/lib/haptics';

export interface UseLongPressOptions {
  /** Duration in milliseconds required to trigger long press (default: 1000) */
  threshold?: number;
  /** Maximum pointer movement in pixels allowed before cancelling (default: 10) */
  moveThreshold?: number;
  /** Whether to trigger haptic feedback on successful long press (default: true) */
  hapticFeedback?: boolean;
  /** Vibration pattern in ms (default: 50) */
  hapticPattern?: number | number[];
  /** Whether the long press interaction is disabled */
  disabled?: boolean;
  /** Callback fired when pressing begins */
  onStart?: () => void;
  /** Callback fired when pressing is cancelled or released before threshold */
  onCancel?: () => void;
  /** Callback fired when long press successfully triggers */
  onSuccess?: () => void;
}

export interface UseLongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onKeyUp: (e: React.KeyboardEvent) => void;
}

export interface UseLongPressReturn {
  handlers: UseLongPressHandlers;
  isPressing: boolean;
  cancel: () => void;
}

/**
 * Custom hook for cross-platform long press detection with haptic feedback.
 * Distinguishes single taps from sustained holds (default: 1000ms), cancels on pointer
 * movement or scroll, suppresses duplicate events and context menus, and safely triggers
 * device haptic feedback.
 */
export function useLongPress(
  callback: () => void,
  options: UseLongPressOptions = {}
): UseLongPressReturn {
  const {
    threshold = 1000,
    moveThreshold = 10,
    hapticFeedback = true,
    hapticPattern = 50,
    disabled = false,
    onStart,
    onCancel,
    onSuccess,
  } = options;

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;

  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const [isPressing, setIsPressing] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | number | null>(null);
  const isTriggeredRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancelPress = useCallback(() => {
    const wasPending = timerRef.current !== null && !isTriggeredRef.current;
    clearTimer();
    setIsPressing(false);
    activePointerIdRef.current = null;
    startPosRef.current = null;

    if (wasPending) {
      onCancelRef.current?.();
    }
  }, [clearTimer]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      // Only process primary click / touch (button 0)
      if (e.button !== 0) return;

      // Prevent duplicate multi-touch or synthetic events
      if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) {
        return;
      }

      clearTimer();
      isTriggeredRef.current = false;
      activePointerIdRef.current = e.pointerId;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      setIsPressing(true);
      onStartRef.current?.();

      timerRef.current = setTimeout(() => {
        isTriggeredRef.current = true;
        setIsPressing(false);

        if (hapticFeedback) {
          triggerHapticFeedback(hapticPattern);
        }

        try {
          callbackRef.current();
        } catch (err) {
          console.error('[useLongPress] Error in long press callback:', err);
        }

        onSuccessRef.current?.();
      }, threshold);
    },
    [clearTimer, disabled, hapticFeedback, hapticPattern, threshold]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerIdRef.current === null || e.pointerId !== activePointerIdRef.current) {
        return;
      }
      if (!startPosRef.current || timerRef.current === null) {
        return;
      }

      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      const distance = Math.hypot(dx, dy);

      // Cancel if pointer moved more than moveThreshold (e.g. user scrolled or dragged)
      if (distance > moveThreshold) {
        cancelPress();
      }
    },
    [cancelPress, moveThreshold]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
        return;
      }

      // If timer is still running before threshold, user released early (< 1000ms)
      if (timerRef.current !== null && !isTriggeredRef.current) {
        cancelPress();
      } else {
        clearTimer();
        setIsPressing(false);
        activePointerIdRef.current = null;
        startPosRef.current = null;
      }
    },
    [cancelPress, clearTimer]
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
        return;
      }
      cancelPress();
    },
    [cancelPress]
  );

  const onPointerLeave = useCallback(
    (e: React.PointerEvent) => {
      // If pointer leaves the element while press is pending, cancel
      if (
        activePointerIdRef.current !== null &&
        e.pointerId === activePointerIdRef.current &&
        timerRef.current !== null
      ) {
        cancelPress();
      }
    },
    [cancelPress]
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Prevent browser context menu when long pressing on mobile/desktop
      if (isTriggeredRef.current || isPressing || timerRef.current !== null) {
        e.preventDefault();
      }
    },
    [isPressing]
  );

  const onClick = useCallback((e: React.MouseEvent) => {
    // Single click / tap should never trigger the edit action!
    e.preventDefault();
    if (isTriggeredRef.current) {
      e.stopPropagation();
      // Allow current event loop to finish before clearing triggered flag
      setTimeout(() => {
        isTriggeredRef.current = false;
      }, 50);
    }
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.repeat) return;
        clearTimer();
        isTriggeredRef.current = false;
        setIsPressing(true);
        onStartRef.current?.();

        timerRef.current = setTimeout(() => {
          isTriggeredRef.current = true;
          setIsPressing(false);

          if (hapticFeedback) {
            triggerHapticFeedback(hapticPattern);
          }

          try {
            callbackRef.current();
          } catch (err) {
            console.error('[useLongPress] Error in long press callback:', err);
          }

          onSuccessRef.current?.();
        }, threshold);
      }
    },
    [clearTimer, disabled, hapticFeedback, hapticPattern, threshold]
  );

  const onKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (timerRef.current !== null && !isTriggeredRef.current) {
          cancelPress();
        } else {
          clearTimer();
          setIsPressing(false);
        }
      }
    },
    [cancelPress, clearTimer]
  );

  // Auto-cancel if window/container scrolls while pressing
  useEffect(() => {
    if (!isPressing) return;
    const handleScroll = () => {
      cancelPress();
    };
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [isPressing, cancelPress]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerUp,
      onPointerMove,
      onPointerCancel,
      onPointerLeave,
      onContextMenu,
      onClick,
      onKeyDown,
      onKeyUp,
    },
    isPressing,
    cancel: cancelPress,
  };
}
