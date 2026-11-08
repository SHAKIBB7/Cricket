'use client';

import { useCallback, useRef } from 'react';
import { shouldInterceptDismiss } from '@/lib/overlay';

/**
 * Unsaved-changes protection for overlay surfaces (master prompt
 * Phase 5). Wrap a surface's dismiss function:
 *
 *   const requestDismiss = useDismissGuard(isDirty, () => setShowDiscardConfirm(true));
 *   <UnifiedSheet onClose={requestDismiss} ... />
 *
 * Backdrop clicks, Escape and swipe dismissal all funnel through
 * onClose, so a dirty surface intercepts them in one place and can ask
 * "Continue editing / Discard changes?" instead of silently losing
 * input. Explicit in-UI choices call the raw close function directly
 * and are never intercepted.
 */
export function useDismissGuard(isDirty: boolean, onIntercept: () => void) {
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;
  const interceptRef = useRef(onIntercept);
  interceptRef.current = onIntercept;

  return useCallback((dismiss: () => void) => {
    if (shouldInterceptDismiss(dirtyRef.current, false)) {
      interceptRef.current();
    } else {
      dismiss();
    }
  }, []);
}
