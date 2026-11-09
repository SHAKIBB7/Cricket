'use client';

/**
 * Install App card (PWA programme P3, design D2).
 *
 * The install system's ONLY entry point: a passive card on the
 * profile page. It never pops up, never nags — its content simply
 * follows the platform install state:
 *   prompt               → an Install button (native prompt on tap)
 *   instructions-ios     → a sheet with Add to Home Screen steps
 *   instructions-desktop → a sheet with browser-menu install steps
 *   installed            → a quiet confirmation state
 *   unsupported          → a muted note; the web app still works
 */

import React, { useState } from 'react';
import { CheckCircle2, Download, Share, Smartphone } from 'lucide-react';
import { usePlatformOptional } from '@/context/PlatformContext';
import { UnifiedSheet } from '@/components/overlay/UnifiedSheet';

function StepRow({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[12px] font-bold flex items-center justify-center shrink-0">
        {n}
      </span>
      <span className="text-[13px] leading-relaxed text-[var(--foreground)]">{children}</span>
    </li>
  );
}

export function InstallAppCard() {
  const { installState, promptInstall } = usePlatformOptional();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

  const handleInstallTap = async () => {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 shadow-xs">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-emerald-600 dark:text-emerald-400 stroke-[1.75]" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-base text-[var(--foreground)] truncate">Install App</h3>
            <p className="text-caption text-[var(--muted-foreground)] mt-0.5">
              {installState === 'installed'
                ? 'Cricket Scorer Pro is installed on this device'
                : 'Add Cricket Scorer Pro to your home screen or desktop — full offline scoring, no browser chrome'}
            </p>
          </div>
        </div>

        <div className="shrink-0">
          {installState === 'installed' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Installed</span>
            </span>
          ) : installState === 'prompt' ? (
            <button
              onClick={handleInstallTap}
              disabled={installing}
              className="inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-full text-caption font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{installing ? 'Opening…' : 'Install'}</span>
            </button>
          ) : installState === 'instructions-ios' || installState === 'instructions-desktop' ? (
            <button
              onClick={() => setSheetOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-full text-caption font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
            >
              <Download className="w-4 h-4" />
              <span>How to install</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)]">
              <span>Not supported in this browser</span>
            </span>
          )}
        </div>
      </div>

      <UnifiedSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        ariaLabel="How to install Cricket Scorer Pro"
        title="Install Cricket Scorer Pro"
        detents={[0.5, 0.92]}
        initialDetent={0}
      >
        <div className="px-4 sm:px-5 py-4">
          {installState === 'instructions-ios' ? (
            <ol className="space-y-3.5">
              <StepRow n={1}>
                Tap the <Share className="w-4 h-4 inline-block -mt-0.5" /> <strong>Share</strong> button in
                Safari&apos;s toolbar.
              </StepRow>
              <StepRow n={2}>
                Scroll down and choose <strong>Add to Home Screen</strong>.
              </StepRow>
              <StepRow n={3}>
                Tap <strong>Add</strong> — Cricket Scorer Pro now lives on your Home Screen and works fully
                offline.
              </StepRow>
            </ol>
          ) : (
            <ol className="space-y-3.5">
              <StepRow n={1}>Open your browser&apos;s menu (⋮ in Chrome, ⋯ in Edge).</StepRow>
              <StepRow n={2}>
                Choose <strong>Install Cricket Scorer Pro</strong> — in Chrome it is under “Save and share →
                Install page as app”, in Edge under “Apps → Install this site as an app”. On macOS Safari, use
                File → Add to Dock.
              </StepRow>
              <StepRow n={3}>
                Launch it from your apps or dock like any installed software — it opens in its own window and
                works fully offline.
              </StepRow>
            </ol>
          )}
        </div>
      </UnifiedSheet>
    </div>
  );
}
