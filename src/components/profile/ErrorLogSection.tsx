'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Bug, ClipboardCopy, Check, Trash2 } from 'lucide-react';
import {
  clearErrorLog,
  getErrorLog,
  type ErrorLogEntry,
} from '@/lib/errorReporter';

/**
 * Diagnostics-style section listing the errors captured by the
 * in-house error reporter (src/lib/errorReporter.ts). Everything
 * stays on the device — the user can copy the log to share it
 * with support, or clear it. Intended mount point: inside the
 * profile page's "System & Developer Diagnostics" block, next to
 * StorageDiagnosticsSection (the coordinator mounts it).
 */
export function ErrorLogSection() {
  const [entries, setEntries] = useState<ErrorLogEntry[]>([]);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    setEntries(getErrorLog());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions/insecure context) — the
      // entries remain visible on screen to transcribe manually.
    }
  };

  const handleClear = () => {
    clearErrorLog();
    refresh();
  };

  return (
    <div className="pt-2 mt-2 border-t border-[var(--border)] space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold">
          <Bug className="w-3.5 h-3.5 text-red-500" />
          Error Log ({entries.length})
        </span>
        {entries.length > 0 && (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 font-semibold hover:bg-[var(--muted)] transition-colors"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-500" />
              ) : (
                <ClipboardCopy className="w-3 h-3" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 font-semibold text-red-500 hover:bg-[var(--muted)] transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-[var(--muted-foreground)]">
          No errors captured on this device. Any app error is recorded here
          automatically.
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {entries.slice(0, 10).map((entry, i) => (
            <li
              key={`${entry.ts}-${i}`}
              className="rounded-lg bg-muted/60 px-2.5 py-1.5"
            >
              <span className="block font-mono text-[10px] text-[var(--muted-foreground)]">
                {entry.ts} · {entry.source}
              </span>
              <span className="block break-words font-medium">
                {entry.message}
              </span>
            </li>
          ))}
        </ul>
      )}
      {entries.length > 10 && (
        <p className="text-[var(--muted-foreground)]">
          Showing the 10 most recent of {entries.length} — Copy includes all.
        </p>
      )}
    </div>
  );
}
