'use client';

/**
 * 404 page + Capacitor shell redirector (Phase 1).
 *
 * In the static export this page becomes out/404.html, and
 * Capacitor's server.errorPath points at it. The shell's local
 * server 404s on any path it has no file for — which includes
 * every dynamic-route URL carrying a REAL id (only the '_'
 * placeholder shells exist as files). On mount, when the requested
 * pathname matches one of the five dynamic patterns with a real
 * segment, this page stores the full path in sessionStorage
 * ('csp:redirect-path', consumed by useShellRouteParam) and
 * location.replace()s to the pattern's placeholder path, whose
 * shell then mounts the right page and recovers the real id.
 *
 * Loop safety: placeholder paths themselves never redirect
 * (placeholderPathForPath returns null for them), and a per-path
 * sessionStorage flag records an attempted redirect so the same
 * path can never redirect twice.
 *
 * Non-matching paths render a plain bilingual 404 in the same
 * style as src/app/error.tsx (provider-free, static EN + BN copy).
 * On the normal web build this is simply the app's 404 page —
 * real dynamic routes match their route there, so the redirector
 * branch never fires for them.
 *
 * Hydration safety: the first render reads nothing client-only;
 * the redirect decision happens entirely inside useEffect, and
 * `redirecting` starts false so server and first client render
 * agree.
 */
import React, { useEffect, useState } from 'react';
import { placeholderPathForPath } from '@/lib/shellRoutes';
import { REDIRECT_PATH_STORAGE_KEY } from '@/lib/useShellRouteParam';

const REDIRECT_ATTEMPT_KEY = 'csp:redirect-attempted';

export default function NotFound() {
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const pathname = window.location.pathname;
    const target = placeholderPathForPath(pathname);
    if (!target) return;
    try {
      if (window.sessionStorage.getItem(REDIRECT_ATTEMPT_KEY) === pathname) {
        return; // already attempted for this exact path — no loop
      }
      window.sessionStorage.setItem(REDIRECT_ATTEMPT_KEY, pathname);
      window.sessionStorage.setItem(REDIRECT_PATH_STORAGE_KEY, pathname);
    } catch {
      // Storage unavailable (hardened WebView): redirect anyway —
      // the hook's pathname fallback cannot help after a replace,
      // but a repeated 404 render still cannot loop because the
      // placeholder path itself never matches.
    }
    setRedirecting(true);
    window.location.replace(target);
  }, []);

  if (redirecting) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
        <p className="text-sm text-[var(--muted-foreground)]">
          Loading… / লোড হচ্ছে…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full text-center space-y-4 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 shadow-elev2">
        <h2 className="font-black text-h3 text-[var(--foreground)]">
          Page not found
        </h2>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
          This page does not exist, or the link may be out of date.
          Your saved matches and data are stored on this device and
          are not affected.
        </p>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
          এই পেজটি খুঁজে পাওয়া যায়নি, অথবা লিংকটি পুরোনো হতে পারে।
          আপনার সেভ করা ম্যাচ ও ডেটা এই ডিভাইসেই সংরক্ষিত আছে।
        </p>
        <div className="flex items-center justify-center gap-2.5 pt-1 flex-wrap">
          <a
            href="/"
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm active:scale-95 transition-transform"
          >
            Go home / হোমে যান
          </a>
        </div>
      </div>
    </div>
  );
}
