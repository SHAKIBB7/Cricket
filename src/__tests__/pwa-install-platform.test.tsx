// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { detectFormFactor, isAppleFormFactor } from '../lib/platform';
import {
  PlatformProvider,
  usePlatform,
  type PlatformContextValue,
} from '../context/PlatformContext';
import { InstallAppCard } from '../components/profile/InstallAppCard';
import { StorageManagerService } from '../infrastructure/storage/StorageManagerService';
import { db } from '../infrastructure/database/dexie-db';

/**
 * PWA programme P3 — platform detection + install state machine.
 *
 * Pins the design decisions: feature/UA detection truth table, the
 * deferred-prompt lifecycle (capture → prompt → accepted/dismissed),
 * the 30-day dismissal cooldown landing in app_metadata, Apple
 * devices NEVER seeing a prompt state, and standalone = installed.
 */

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ipad:
    'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ipadosDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  firefoxDesktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
};

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

function stubMatchMedia(standalone: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === '(display-mode: standalone)' ? standalone : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as typeof window.matchMedia;
}

let latest: PlatformContextValue | null = null;
function Probe() {
  latest = usePlatform();
  return null;
}

let container: HTMLDivElement;
let root: Root;

async function renderApp(children: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<PlatformProvider>{children}</PlatformProvider>);
  });
}

function fakePromptEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt');
  Object.assign(event, {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  });
  return event;
}

describe('detectFormFactor', () => {
  it('classifies the platform truth table', () => {
    expect(detectFormFactor(UA.iphone, 5)).toBe('ios');
    expect(detectFormFactor(UA.ipad, 5)).toBe('ipados');
    expect(detectFormFactor(UA.ipadosDesktopMode, 5)).toBe('ipados'); // touch Mac UA
    expect(detectFormFactor(UA.macSafari, 0)).toBe('macos');
    expect(detectFormFactor(UA.androidChrome, 5)).toBe('android');
    expect(detectFormFactor(UA.windowsChrome, 0)).toBe('windows');
    expect(detectFormFactor(UA.firefoxDesktop, 0)).toBe('windows');
    expect(detectFormFactor('', 0)).toBe('other');
    expect(isAppleFormFactor('ios')).toBe(true);
    expect(isAppleFormFactor('ipados')).toBe(true);
    expect(isAppleFormFactor('android')).toBe(false);
  });
});

describe('PlatformProvider install state machine', () => {
  beforeEach(async () => {
    latest = null;
    await db.app_metadata.clear();
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    container?.remove();
  });

  it('desktop Chrome without a captured prompt shows menu instructions', async () => {
    setUserAgent(UA.windowsChrome);
    stubMatchMedia(false);
    await renderApp(<Probe />);
    expect(latest?.installState).toBe('instructions-desktop');
    expect(latest?.platform.formFactor).toBe('windows');
  });

  it('captures beforeinstallprompt, accepts, then appinstalled flips to installed', async () => {
    setUserAgent(UA.androidChrome);
    stubMatchMedia(false);
    await renderApp(<Probe />);
    await act(async () => {
      window.dispatchEvent(fakePromptEvent('accepted'));
    });
    expect(latest?.installState).toBe('prompt');

    let outcome: string | undefined;
    await act(async () => {
      outcome = await latest!.promptInstall();
    });
    expect(outcome).toBe('accepted');

    await act(async () => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(latest?.installState).toBe('installed');
  });

  it('a dismissed prompt records the cooldown and falls back to instructions', async () => {
    setUserAgent(UA.windowsChrome);
    stubMatchMedia(false);
    await renderApp(<Probe />);
    await act(async () => {
      window.dispatchEvent(fakePromptEvent('dismissed'));
    });
    expect(latest?.installState).toBe('prompt');

    let outcome: string | undefined;
    await act(async () => {
      outcome = await latest!.promptInstall();
    });
    expect(outcome).toBe('dismissed');
    expect(latest?.installState).toBe('instructions-desktop');

    const stored = await StorageManagerService.getMetadata<number>('install_prompt_dismissed_at');
    expect(typeof stored).toBe('number');
    expect(Math.abs(Date.now() - (stored as number))).toBeLessThan(60_000);
  });

  it('iPhone never enters the prompt state, even if a prompt event fires', async () => {
    setUserAgent(UA.iphone);
    stubMatchMedia(false);
    await renderApp(<Probe />);
    await act(async () => {
      window.dispatchEvent(fakePromptEvent('accepted'));
    });
    expect(latest?.installState).toBe('instructions-ios');
    expect(latest?.platform.formFactor).toBe('ios');
  });

  it('standalone display mode reads as installed', async () => {
    setUserAgent(UA.androidChrome);
    stubMatchMedia(true);
    await renderApp(<Probe />);
    expect(latest?.installState).toBe('installed');
    expect(latest?.platform.isStandalone).toBe(true);
  });

  it('the profile card renders the state-appropriate affordance', async () => {
    setUserAgent(UA.iphone);
    stubMatchMedia(false);
    await renderApp(<InstallAppCard />);
    expect(container.textContent).toContain('Install App');
    expect(container.textContent).toContain('How to install');
  });
});
