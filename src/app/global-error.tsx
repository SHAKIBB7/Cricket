'use client';

/**
 * C-3 (bug hunt 2026-11-12): root-level error boundary.
 *
 * Catches failures in the root layout itself (where error.tsx
 * cannot reach). Must render its own <html>/<body> and cannot rely
 * on global CSS or any app provider, so styling is inline-only and
 * the copy is static bilingual (EN + BN). The reload happens inside
 * the click handler only — no window reads during render.
 */
import React, { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError] Root render error caught:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          backgroundColor: '#0b0e1a',
          color: '#f1f5f9',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 12px' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.8, margin: '0 0 8px' }}>
            The app hit an unexpected error. Your saved matches and data
            are stored on this device and are not lost.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.8, margin: '0 0 20px' }}>
            অ্যাপটিতে একটি অপ্রত্যাশিত সমস্যা হয়েছে। আপনার সেভ করা ম্যাচ ও
            ডেটা এই ডিভাইসেই সংরক্ষিত আছে — কিছুই হারায়নি।
          </p>
          <div
            style={{
              display: 'flex',
              gap: 10,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 18px',
                borderRadius: 12,
                border: 'none',
                backgroundColor: '#059669',
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Reload / আবার চেষ্টা করুন
            </button>
            <a
              href="/"
              style={{
                padding: '10px 18px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.35)',
                color: '#f1f5f9',
                fontWeight: 700,
                fontSize: 14,
                textDecoration: 'none',
              }}
            >
              Go home / হোমে যান
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
