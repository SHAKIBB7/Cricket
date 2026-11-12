/**
 * Shared file-delivery helper (bug hunt P-2).
 *
 * Every "download this file" flow in the app — PDF reports, CSV
 * exports, backup JSON, share-card PNGs — used to hand-roll the
 * same `blob:` + `<a download>` dance. That works in real
 * browsers but silently does nothing inside an Android WebView
 * wrapper (Capacitor), which implements neither blob downloads
 * nor `window.open(blob)`.
 *
 * downloadBlob centralises the delivery strategy:
 *  - Embedded WebView + Web Share with files available →
 *    `navigator.share({ files })` — the one file-delivery path
 *    a wrapper reliably supports (system share sheet → "Save
 *    to Files" / Drive / etc.). If the share fails for any
 *    reason other than the user cancelling, we still fall
 *    through to the anchor attempt below.
 *  - Everywhere else → the established anchor download:
 *    object URL + `<a download>` click, with the Safari/iOS
 *    `target=_blank` treatment (a plain blob navigation there
 *    hijacks the page into a black screen) and a 60 s delayed
 *    revoke so slower mobile engines finish reading the URL.
 */

import { isEmbeddedWebView } from './platform';

export type DownloadDelivery = 'share' | 'anchor' | 'none';

/**
 * Safari / iOS detection shared with the PDF generator: the
 * download attribute on blob URLs is unsupported there and a
 * same-tab navigation to the blob renders a pitch-black screen.
 */
export function isSafariOrIos(userAgent?: string): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = userAgent ?? navigator.userAgent ?? '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    /^((?!chrome|android).)*safari/i.test(ua)
  );
}

interface ShareCapableNavigator {
  canShare?: (data?: { files?: File[] }) => boolean;
  share?: (data: { files?: File[]; title?: string }) => Promise<void>;
}

/**
 * Deliver `blob` to the user as a file named `filename`.
 * Resolves with the path taken ('share' | 'anchor' | 'none');
 * never rejects — delivery is best-effort UI, callers today are
 * fire-and-forget.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<DownloadDelivery> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 'none';

  // ── Wrapper path: Web Share with files ─────────────────────
  if (isEmbeddedWebView()) {
    const nav = navigator as unknown as ShareCapableNavigator;
    if (typeof nav.share === 'function' && typeof nav.canShare === 'function') {
      try {
        const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
        if (nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], title: filename });
          return 'share';
        }
      } catch (err: any) {
        // The user dismissing the share sheet is a completed
        // delivery decision, not a failure to fall back from.
        if (err?.name === 'AbortError') return 'share';
        // Any other share failure: fall through to the anchor.
      }
    }
  }

  // ── Standard path: temporary anchor download ───────────────
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;

  if (isSafariOrIos()) {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  }

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Retain the object URL for 60 s so slower mobile engines or
  // viewers opened in a new tab finish loading before cleanup.
  setTimeout(() => {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
  }, 60000);

  return 'anchor';
}
