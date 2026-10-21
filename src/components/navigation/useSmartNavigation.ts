/* eslint-disable react-hooks/rules-of-hooks */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import * as NextNav from 'next/navigation';

const SESSION_NAV_KEY = 'cric_nav_history_stack_v1';
const MAX_HISTORY_LENGTH = 30;

export interface GoBackOptions {
  /** Safe fallback URL if user accessed via direct link, bookmark, or history is empty */
  fallbackUrl?: string;
  /** Custom handler override (e.g., closing a modal or subview) */
  onCustomBack?: () => void;
  /** Optional confirmation message if user has unsaved changes */
  confirmMessage?: string;
}

/**
 * Returns current internal navigation stack from sessionStorage
 */
function getStoredHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(SESSION_NAV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Saves internal navigation stack to sessionStorage
 */
function setStoredHistory(stack: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_NAV_KEY, JSON.stringify(stack.slice(-MAX_HISTORY_LENGTH)));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Smart iOS-inspired navigation hook.
 * Handles internal route tracking, safe fallbacks, confirmation prompts,
 * modal dismissals, and prevents loops or exiting the PWA.
 * Robust against environments/mocks where usePathname might be undefined.
 */
export function useSmartNavigation() {
  let router: { back: () => void; push: (url: string) => void };
  try {
    router = typeof NextNav.useRouter === 'function' ? NextNav.useRouter() : { back: () => {}, push: () => {} };
  } catch {
    router = { back: () => {}, push: () => {} };
  }

  let pathname = '/';
  try {
    if (typeof NextNav.usePathname === 'function') {
      pathname = NextNav.usePathname() || '/';
    } else if (typeof window !== 'undefined' && window.location) {
      pathname = window.location.pathname || '/';
    }
  } catch {
    if (typeof window !== 'undefined' && window.location) {
      pathname = window.location.pathname || '/';
    }
  }

  const isNavigatingRef = useRef(false);

  // Track pathname changes in session storage
  useEffect(() => {
    if (!pathname || typeof window === 'undefined') return;

    const stack = getStoredHistory();
    const currentTop = stack[stack.length - 1];

    if (currentTop !== pathname) {
      stack.push(pathname);
      setStoredHistory(stack);
    }
  }, [pathname]);

  /**
   * Determine if we can safely go back within internal app history
   */
  const canGoBack = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    const stack = getStoredHistory();
    return stack.length > 1;
  }, []);

  /**
   * Smart goBack execution:
   * 1. Check confirm prompt if specified
   * 2. If custom callback given, execute it (for modal/sheet dismiss)
   * 3. If internal history stack has previous page, pop and call router.back()
   * 4. If direct URL access / empty history, navigate to fallbackUrl
   * 5. Includes a failsafe watchdog to navigate to fallbackUrl if router.back() didn't change page
   */
  const goBack = useCallback(
    ({ fallbackUrl = '/', onCustomBack, confirmMessage }: GoBackOptions = {}) => {
      if (confirmMessage && typeof window !== 'undefined') {
        const confirmed = window.confirm(confirmMessage);
        if (!confirmed) return;
      }

      if (onCustomBack) {
        onCustomBack();
        return;
      }

      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;

      const stack = getStoredHistory();
      const hasInternalHistory = stack.length > 1;

      if (hasInternalHistory && typeof router.back === 'function') {
        // Pop current page from our tracked stack
        stack.pop();
        setStoredHistory(stack);

        const currentPathBeforeBack = typeof window !== 'undefined' ? window.location.pathname : '';
        router.back();

        // Safety watchdog: If page didn't change (e.g. browser history was truncated or external),
        // fallback safely after 350ms so user is never stranded
        setTimeout(() => {
          isNavigatingRef.current = false;
          if (typeof window !== 'undefined' && window.location.pathname === currentPathBeforeBack && fallbackUrl) {
            router.push(fallbackUrl);
          }
        }, 350);
      } else {
        // Direct entry / new tab / refresh: Navigate directly to safe fallback
        if (typeof router.push === 'function') {
          router.push(fallbackUrl);
        }
        setTimeout(() => {
          isNavigatingRef.current = false;
        }, 350);
      }
    },
    [router]
  );

  return {
    goBack,
    canGoBack,
    currentPath: pathname,
  };
}
