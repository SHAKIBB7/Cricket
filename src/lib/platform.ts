/**
 * Platform & capability detection (PWA programme, Phase 2 design D1).
 *
 * One shared source of truth for "where is the app running and what
 * can this browser do", consumed by the install system and any
 * platform-aware UI. Feature detection is preferred wherever a
 * capability API exists; the user agent is only used for the
 * form-factor fork (there is no capability API for "is this iOS",
 * and the install instructions genuinely differ per platform).
 *
 * The pure functions take their inputs explicitly so they can be
 * unit-tested without a DOM.
 */

export type FormFactor = 'android' | 'ios' | 'ipados' | 'windows' | 'macos' | 'other';

export type DisplayMode = 'standalone' | 'browser';

export interface PlatformInfo {
  formFactor: FormFactor;
  displayMode: DisplayMode;
  /** True when running as an installed app (standalone display). */
  isStandalone: boolean;
  capabilities: {
    serviceWorker: boolean;
    /** navigator.storage.persist is callable (grant still varies). */
    storagePersist: boolean;
    /** Background Sync API presence — diagnostics only, never relied on (iOS lacks it). */
    backgroundSync: boolean;
    /** An install prompt event can exist here (Chromium family). */
    installPromptEvent: boolean;
  };
}

/**
 * Form factor from UA signals. iPadOS 13+ reports a Macintosh UA;
 * the standard discriminator is touch points on a "Mac" UA.
 */
export function detectFormFactor(userAgent: string, maxTouchPoints: number): FormFactor {
  const ua = userAgent || '';
  if (/iPad/i.test(ua)) return 'ipados';
  if (/iPhone|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return maxTouchPoints > 1 ? 'ipados' : 'macos';
  }
  return 'other';
}

/** iOS-family devices never fire beforeinstallprompt. */
export function isAppleFormFactor(f: FormFactor): boolean {
  return f === 'ios' || f === 'ipados';
}

export interface NavigatorLike {
  userAgent: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  serviceWorker?: unknown;
  storage?: { persist?: unknown };
  userAgentData?: { platform?: string };
}

/** Reads the live browser environment. Safe to call during SSR (returns browser/other defaults). */
export function detectPlatform(): PlatformInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      formFactor: 'other',
      displayMode: 'browser',
      isStandalone: false,
      capabilities: { serviceWorker: false, storagePersist: false, backgroundSync: false, installPromptEvent: false },
    };
  }

  const nav = navigator as NavigatorLike;
  const formFactor = detectFormFactor(nav.userAgent, nav.maxTouchPoints ?? 0);

  const standaloneMq = typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = nav.standalone === true;
  const isStandalone = standaloneMq || iosStandalone;

  return {
    formFactor,
    displayMode: isStandalone ? 'standalone' : 'browser',
    isStandalone,
    capabilities: {
      serviceWorker: 'serviceWorker' in navigator,
      storagePersist: typeof nav.storage?.persist === 'function',
      backgroundSync: 'serviceWorker' in navigator && 'SyncManager' in window,
      installPromptEvent: !isAppleFormFactor(formFactor),
    },
  };
}
