'use client';

/**
 * C-3 (bug hunt 2026-11-12): app-level error boundary.
 *
 * Before this file existed, a single render throw (e.g. a malformed
 * stored match record on the summary page) unmounted the ENTIRE app
 * to a blank screen with no recovery path. This boundary catches
 * segment-level render errors and offers a reload / go-home escape.
 *
 * Deliberately dependency-light: it must render even when the
 * failure lives inside the app providers, so it does NOT consume
 * LanguageContext / AuthContext — the copy is shown bilingually
 * (EN + BN) statically, and styling uses only global CSS-var
 * utilities, never provider state. No first-render reads of
 * localStorage / navigator / window (hydration rule); the reload
 * happens inside the click handler only.
 */
import React, { useEffect } from 'react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[AppError] Render error caught by boundary:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full text-center space-y-4 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 shadow-elev2">
        <h2 className="font-black text-h3 text-[var(--foreground)]">
          Something went wrong
        </h2>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
          The page hit an unexpected error. Your saved matches and data
          are stored on this device and are not lost.
        </p>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
          পেজটিতে একটি অপ্রত্যাশিত সমস্যা হয়েছে। আপনার সেভ করা ম্যাচ ও
          ডেটা এই ডিভাইসেই সংরক্ষিত আছে — কিছুই হারায়নি।
        </p>
        <div className="flex items-center justify-center gap-2.5 pt-1 flex-wrap">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm active:scale-95 transition-transform"
          >
            Reload / আবার চেষ্টা করুন
          </button>
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-2.5 rounded-xl bg-[var(--muted)] hover:opacity-80 text-[var(--foreground)] font-bold text-sm active:scale-95 transition-transform"
          >
            Try again
          </button>
          <a
            href="/"
            className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--foreground)] font-bold text-sm active:scale-95 transition-transform"
          >
            Go home / হোমে যান
          </a>
        </div>
      </div>
    </div>
  );
}
