'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ToastNotification } from './ToastNotification';

/**
 * Minimal app-wide toast surface (Ultimate audit F5).
 *
 * Replaces the last native alert calls. Any client code can call
 * showAppToast(message); the single <AppToastHost /> mounted in the
 * root layout renders the queue. No context/provider needed — a
 * window CustomEvent is the whole transport, and the host reuses
 * the existing ToastNotification shell and motion tokens.
 *
 * F4-16 consolidation extension: showAppToast also accepts
 * options — a visual `variant` ('default' | 'success' | 'error')
 * and an `onDismiss` callback. The callback cannot ride the DOM
 * event itself, so the host announces each dismissal on a second
 * event channel keyed by a per-toast key, and showAppToast
 * subscribes for exactly that key, exactly once. Callers passing
 * only a message string see the original behaviour unchanged.
 */

const TOAST_EVENT = 'csp:app-toast';
const TOAST_DISMISS_EVENT = 'csp:app-toast-dismiss';
const AUTO_DISMISS_MS = 4500;
const MAX_VISIBLE = 3;

export type AppToastVariant = 'default' | 'success' | 'error';

export interface AppToastOptions {
  variant?: AppToastVariant;
  /** Fired once when the toast is dismissed (click or auto-dismiss). */
  onDismiss?: () => void;
  durationMs?: number;
}

interface ToastDetail {
  key: string;
  message: string;
  variant: AppToastVariant;
  durationMs: number;
}

let toastKeyCounter = 0;

export function showAppToast(message: string, options?: AppToastOptions): void {
  if (typeof window === 'undefined' || !message) return;
  const key = `toast-${Date.now()}-${++toastKeyCounter}`;
  const detail: ToastDetail = {
    key,
    message,
    variant: options?.variant ?? 'default',
    durationMs: options?.durationMs ?? AUTO_DISMISS_MS,
  };
  if (options?.onDismiss) {
    const onDismiss = options.onDismiss;
    const listener = (e: Event) => {
      if ((e as CustomEvent<{ key: string }>).detail?.key === key) {
        window.removeEventListener(TOAST_DISMISS_EVENT, listener);
        onDismiss();
      }
    };
    window.addEventListener(TOAST_DISMISS_EVENT, listener);
  }
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail }));
}

interface ToastItem {
  id: number;
  key: string;
  message: string;
  variant: AppToastVariant;
  durationMs: number;
}

const VARIANT_CLASSES: Record<AppToastVariant, string> = {
  default: 'bg-[var(--foreground)] text-[var(--background)]',
  success: 'bg-success text-white',
  error: 'bg-red-600 text-white',
};

export function AppToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastsRef = useRef<ToastItem[]>([]);
  const dismissRef = useRef<(id: number) => void>(() => {});

  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);

  useEffect(() => {
    let nextId = 1;
    const timers = new Map<number, number>();
    const dismiss = (id: number) => {
      const item = toastsRef.current.find((t) => t.id === id);
      if (item) {
        window.dispatchEvent(
          new CustomEvent<{ key: string }>(TOAST_DISMISS_EVENT, {
            detail: { key: item.key },
          })
        );
      }
      const timer = timers.get(id);
      if (timer) window.clearTimeout(timer);
      timers.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    };
    dismissRef.current = dismiss;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ToastDetail | string>).detail;
      const normalized: ToastDetail =
        typeof detail === 'string'
          ? {
              key: `toast-legacy-${nextId}`,
              message: detail,
              variant: 'default',
              durationMs: AUTO_DISMISS_MS,
            }
          : detail;
      if (!normalized?.message) return;
      const id = nextId++;
      const item: ToastItem = { id, ...normalized };
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), item]);
      timers.set(id, window.setTimeout(() => dismiss(id), item.durationMs));
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => {
      window.removeEventListener(TOAST_EVENT, handler);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <ToastNotification key={t.id} show>
          <button
            type="button"
            onClick={() => dismissRef.current(t.id)}
            className={`pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-left text-sm font-semibold shadow-lg ${VARIANT_CLASSES[t.variant]}`}
            role="alert"
          >
            {t.message}
          </button>
        </ToastNotification>
      ))}
    </div>
  );
}
