'use client';

import React, { useEffect, useState } from 'react';
import { ToastNotification } from './ToastNotification';

/**
 * Minimal app-wide toast surface (Ultimate audit F5).
 *
 * Replaces the last native alert calls. Any client code can call
 * showAppToast(message); the single <AppToastHost /> mounted in the
 * root layout renders the queue. No context/provider needed — a
 * window CustomEvent is the whole transport, and the host reuses
 * the existing ToastNotification shell and motion tokens.
 */

const TOAST_EVENT = 'csp:app-toast';
const AUTO_DISMISS_MS = 4500;
const MAX_VISIBLE = 3;

export function showAppToast(message: string): void {
  if (typeof window === 'undefined' || !message) return;
  window.dispatchEvent(new CustomEvent<string>(TOAST_EVENT, { detail: message }));
}

interface ToastItem {
  id: number;
  message: string;
}

export function AppToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    let nextId = 1;
    const timers = new Map<number, number>();
    const dismiss = (id: number) => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      const timer = timers.get(id);
      if (timer) window.clearTimeout(timer);
      timers.delete(id);
    };
    const handler = (e: Event) => {
      const message = (e as CustomEvent<string>).detail;
      if (!message) return;
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, message }]);
      timers.set(id, window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
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
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            className="pointer-events-auto max-w-md rounded-xl bg-[var(--foreground)] px-4 py-2.5 text-left text-sm font-semibold text-[var(--background)] shadow-lg"
            role="alert"
          >
            {t.message}
          </button>
        </ToastNotification>
      ))}
    </div>
  );
}
