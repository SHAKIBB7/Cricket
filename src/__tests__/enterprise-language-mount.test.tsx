// @vitest-environment jsdom
/**
 * Enterprise programme (2026-11-12) — the saved-language contract
 * after the hydration fix: LanguageProvider's first render is the
 * server language ('en'); the stored preference is applied by the
 * mount effect immediately after hydration (this test proves the
 * second half — the provider source pins prove the first).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../context/LanguageContext';

describe('LanguageProvider mount behaviour (post-hydration language)', () => {
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    document.body.innerHTML = '';
    document.documentElement.lang = 'en';
  });

  it('applies a saved bn preference after mount and syncs <html lang>', async () => {
    window.localStorage.setItem('preferred_language', 'bn');
    let seen = '';
    function Probe() {
      const { language } = useLanguage();
      seen = language;
      return null;
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <LanguageProvider>
          <Probe />
        </LanguageProvider>,
      );
    });
    expect(seen).toBe('bn');
    expect(document.documentElement.lang).toBe('bn');
    await act(async () => root.unmount());
  });

  it('stays en with no saved preference', async () => {
    let seen = '';
    function Probe() {
      const { language } = useLanguage();
      seen = language;
      return null;
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <LanguageProvider>
          <Probe />
        </LanguageProvider>,
      );
    });
    expect(seen).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    await act(async () => root.unmount());
  });
});
