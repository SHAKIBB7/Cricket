'use client';

/**
 * PlatformProvider (PWA programme, Phase 2 design D1–D3).
 *
 * Owns the app-wide platform snapshot and the PWA install
 * lifecycle: captures `beforeinstallprompt` (it must be captured
 * when it fires or it is lost), tracks `appinstalled`, honours a
 * 30-day no-renag cooldown after a dismissed prompt, and derives
 * the single install state every UI surface renders from:
 *
 *   installed           — running standalone, or install completed
 *   prompt              — a deferred native prompt is available
 *   instructions-ios    — Apple devices: Share → Add to Home Screen
 *   instructions-desktop— Chromium/Safari desktop: menu-based install
 *   unsupported         — this browser cannot install the app
 *
 * Nothing here ever SHOWS a prompt on its own: the native prompt
 * fires only from promptInstall(), called by a user tap.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { detectPlatform, isAppleFormFactor, type PlatformInfo } from '@/lib/platform';
import { StorageManagerService } from '@/infrastructure/storage/StorageManagerService';

export type InstallState = 'installed' | 'prompt' | 'instructions-ios' | 'instructions-desktop' | 'unsupported';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISSED_AT_KEY = 'install_prompt_dismissed_at';
export const INSTALL_DISMISSAL_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export interface PlatformContextValue {
  platform: PlatformInfo;
  installState: InstallState;
  /** Fires the deferred native prompt. Returns the outcome, or 'unavailable'. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

const PlatformContext = createContext<PlatformContextValue | undefined>(undefined);

function deriveInstallState(args: {
  platform: PlatformInfo;
  installed: boolean;
  hasDeferredPrompt: boolean;
  cooldownActive: boolean;
  userAgent: string;
}): InstallState {
  const { platform, installed, hasDeferredPrompt, cooldownActive, userAgent } = args;
  if (installed || platform.isStandalone) return 'installed';
  if (isAppleFormFactor(platform.formFactor)) return 'instructions-ios';
  if (hasDeferredPrompt && !cooldownActive) return 'prompt';
  // Chromium (prompt event may still arrive, or cooldown is running)
  // and desktop Safari (Add to Dock) both install via browser menus.
  if (/Chrome|Chromium|Edg\//.test(userAgent) || platform.formFactor === 'macos') {
    return 'instructions-desktop';
  }
  return 'unsupported';
}

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [platform, setPlatform] = useState<PlatformInfo>(() => detectPlatform());
  const [installed, setInstalled] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [hasDeferredPrompt, setHasDeferredPrompt] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());

    let cancelled = false;
    StorageManagerService.getMetadata<number>(DISMISSED_AT_KEY)
      .then((value) => {
        if (!cancelled && typeof value === 'number') setDismissedAt(value);
      })
      .catch(() => {});

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setHasDeferredPrompt(true);
    };
    const onAppInstalled = () => {
      deferredPromptRef.current = null;
      setHasDeferredPrompt(false);
      setInstalled(true);
    };
    const mq = window.matchMedia('(display-mode: standalone)');
    const onDisplayModeChange = () => setPlatform(detectPlatform());

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    mq.addEventListener?.('change', onDisplayModeChange);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      mq.removeEventListener?.('change', onDisplayModeChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const deferred = deferredPromptRef.current;
    if (!deferred) return 'unavailable';
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      deferredPromptRef.current = null;
      setHasDeferredPrompt(false);
      if (choice.outcome === 'dismissed') {
        const now = Date.now();
        setDismissedAt(now);
        StorageManagerService.setMetadata(DISMISSED_AT_KEY, now).catch(() => {});
        return 'dismissed';
      }
      return 'accepted';
    } catch {
      return 'unavailable';
    }
  }, []);

  const value = useMemo<PlatformContextValue>(() => {
    const cooldownActive = dismissedAt !== null && Date.now() - dismissedAt < INSTALL_DISMISSAL_COOLDOWN_MS;
    return {
      platform,
      installState: deriveInstallState({
        platform,
        installed,
        hasDeferredPrompt,
        cooldownActive,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      }),
      promptInstall,
    };
  }, [platform, installed, hasDeferredPrompt, dismissedAt, promptInstall]);

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used within PlatformProvider');
  return ctx;
}

/**
 * Stateless fallback for surfaces rendered outside the provider
 * (isolated component tests, static previews): detection still
 * works, but there is no captured prompt, so install resolves to
 * the instruction states. Production always mounts the provider
 * in the root layout.
 */
export function usePlatformOptional(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (ctx) return ctx;
  const platform = detectPlatform();
  return {
    platform,
    installState: deriveInstallState({
      platform,
      installed: platform.isStandalone,
      hasDeferredPrompt: false,
      cooldownActive: false,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    }),
    promptInstall: async () => 'unavailable',
  };
}
