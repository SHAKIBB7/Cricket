import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

// Mock SyncContext for Navigation
vi.mock('@/context/SyncContext', () => ({
  useSyncStatus: () => ({
    syncState: 'SYNCED',
    pendingCount: 0,
    lastSyncedAt: new Date('2026-10-17T12:00:00Z'),
    errorMessage: null,
    isOnline: true,
    isServerReachable: true,
    triggerSync: vi.fn(),
    storageEstimate: { persisted: true, usageMB: 12, quotaMB: 500 },
    refreshStorage: vi.fn(),
    isOfflineReady: true,
    isUpdateAvailable: false,
    applyUpdate: vi.fn(),
    offlineSetup: { status: 'completed', isOfflineReady: true, progress: 100, message: null, error: null },
    retryOfflineSetup: vi.fn(),
  }),
}));

// Mock repositories for HomePage
vi.mock('@/infrastructure/storage/MatchRepository', () => ({
  MatchRepository: {
    getLatestOngoingMatch: vi.fn().mockResolvedValue(null),
    countMatches: vi.fn().mockResolvedValue(42),
  },
}));

vi.mock('@/infrastructure/storage/FeatureHubRepository', () => ({
  FeatureHubRepository: {
    countTeams: vi.fn().mockResolvedValue(8),
    countTournaments: vi.fn().mockResolvedValue(3),
  },
}));

import {
  DEFAULT_MATCH_ENGINE_METADATA,
  getEngineMetadata,
  setEngineMetadata,
  resetEngineMetadata,
  getEngineVersion,
  getEngineVersionDisplay,
  getEngineNavigationLabel,
  isValidEngineVersion,
  parseEngineVersion,
  subscribeEngineMetadata,
} from '../domain/cricket/match-engine/engine-metadata';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import HomePage from '../app/page';
import { Navigation } from '../components/layout/Navigation';

describe('Dynamic Engine Version System', () => {
  beforeEach(() => {
    resetEngineMetadata();
  });

  afterEach(() => {
    resetEngineMetadata();
  });

  describe('1. Centralized Engine Metadata & Source of Truth', () => {
    it('provides correct default engine metadata matching the legitimate match engine', () => {
      const metadata = getEngineMetadata();
      expect(metadata.name).toBe('Match Engine');
      expect(metadata.version).toBe('2.1');
      expect(metadata.edition).toBe('Pro');
    });

    it('returns normalized engine version string', () => {
      expect(getEngineVersion()).toBe('2.1');
    });

    it('returns full display string with edition for Home Screen presentation', () => {
      expect(getEngineVersionDisplay()).toBe('v2.1 Pro');
      expect(getEngineVersionDisplay({ format: 'full' })).toBe('v2.1 Pro');
    });

    it('returns short display string when requested', () => {
      expect(getEngineVersionDisplay({ format: 'short' })).toBe('v2.1');
    });

    it('returns consistent navigation brand label', () => {
      expect(getEngineNavigationLabel()).toBe('Match Engine v2.1');
    });

    it('exposes authoritative metadata through EventSourcedMatchEngine static properties', () => {
      expect(EventSourcedMatchEngine.METADATA.version).toBe('2.1');
      expect(EventSourcedMatchEngine.METADATA.edition).toBe('Pro');
      expect(EventSourcedMatchEngine.version).toBe('2.1');
      expect(EventSourcedMatchEngine.getEngineVersion()).toBe('2.1');
      expect(EventSourcedMatchEngine.getEngineVersionDisplay()).toBe('v2.1 Pro');
    });
  });

  describe('2. Dynamic Version Updates & Reactivity', () => {
    it('updates displayed version when configured engine version changes', () => {
      setEngineMetadata({ version: '2.2' });
      expect(getEngineVersion()).toBe('2.2');
      expect(getEngineVersionDisplay()).toBe('v2.2 Pro');
      expect(getEngineNavigationLabel()).toBe('Match Engine v2.2');
    });

    it('updates version and edition together dynamically', () => {
      setEngineMetadata({ version: '3.0.0', edition: 'Enterprise' });
      expect(getEngineVersion()).toBe('3.0.0');
      expect(getEngineVersionDisplay()).toBe('v3.0.0 Enterprise');
      expect(getEngineNavigationLabel()).toBe('Match Engine v3.0.0');
    });

    it('supports version strings with inline edition tags', () => {
      setEngineMetadata({ version: 'v2.5 NextGen', edition: undefined });
      expect(getEngineVersion()).toBe('2.5');
      expect(getEngineVersionDisplay()).toBe('v2.5 NextGen');
    });

    it('notifies subscribers immediately when engine metadata is updated', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeEngineMetadata(listener);

      setEngineMetadata({ version: '2.3' });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ version: '2.3' }));

      unsubscribe();
      setEngineMetadata({ version: '2.4' });
      expect(listener).toHaveBeenCalledTimes(1); // Not called after unsubscribe
    });

    it('resets cleanly back to defaults when resetEngineMetadata is invoked', () => {
      setEngineMetadata({ version: '9.9.9', edition: 'Experimental' });
      expect(getEngineVersionDisplay()).toBe('v9.9.9 Experimental');

      resetEngineMetadata();
      expect(getEngineVersionDisplay()).toBe('v2.1 Pro');
      expect(getEngineVersion()).toBe('2.1');
    });
  });

  describe('3. Validation & Graceful Fallback for Missing/Invalid Metadata', () => {
    it('validates version strings accurately', () => {
      expect(isValidEngineVersion('2.1')).toBe(true);
      expect(isValidEngineVersion('v2.1')).toBe(true);
      expect(isValidEngineVersion('2.1.0')).toBe(true);
      expect(isValidEngineVersion('v2.1 Pro')).toBe(true);
      expect(isValidEngineVersion('2.1.0-alpha.1')).toBe(true);

      // Invalid / Missing values
      expect(isValidEngineVersion('')).toBe(false);
      expect(isValidEngineVersion('   ')).toBe(false);
      expect(isValidEngineVersion(null)).toBe(false);
      expect(isValidEngineVersion(undefined)).toBe(false);
      expect(isValidEngineVersion('unknown')).toBe(false);
      expect(isValidEngineVersion('null')).toBe(false);
      expect(isValidEngineVersion('undefined')).toBe(false);
      expect(isValidEngineVersion('NaN')).toBe(false);
      expect(isValidEngineVersion('N/A')).toBe(false);
      expect(isValidEngineVersion('invalid')).toBe(false);
      expect(isValidEngineVersion('none')).toBe(false);
    });

    it('handles empty or missing version metadata gracefully without displaying misleading values', () => {
      setEngineMetadata({ version: '' });
      expect(getEngineVersion()).toBe('');
      expect(getEngineVersionDisplay()).toBe('Unavailable');
      expect(getEngineNavigationLabel()).toBe('Match Engine');
    });

    it('handles invalid version metadata by returning non-misleading fallback', () => {
      setEngineMetadata({ version: 'unknown' as any });
      expect(getEngineVersionDisplay()).toBe('Unavailable');
      expect(getEngineVersionDisplay({ fallback: 'Unknown' })).toBe('Unknown');
      expect(getEngineNavigationLabel()).toBe('Match Engine');
    });

    it('handles whitespace-only version gracefully', () => {
      setEngineMetadata({ version: '    ' });
      expect(getEngineVersionDisplay()).toBe('Unavailable');
    });
  });

  describe('4. Home Screen & UI Consistency Verification', () => {
    it('confirms the hardcoded version string is removed from page.tsx source', () => {
      const pageFilePath = path.resolve(__dirname, '../app/page.tsx');
      const pageContent = fs.readFileSync(pageFilePath, 'utf-8');

      // The previous hardcoded string was: <p className="font-black num-font text-h2 mt-1">v2.1 Pro</p>
      expect(pageContent).not.toContain('<p className="font-black num-font text-h2 mt-1">v2.1 Pro</p>');
      // It must now use dynamic {engineVersion}
      expect(pageContent).toContain('{engineVersion}');
      // It must import the dynamic engine version hook
      expect(pageContent).toContain('useEngineVersion');
    });

    it('confirms the hardcoded version string is removed from Navigation.tsx source', () => {
      const navFilePath = path.resolve(__dirname, '../components/layout/Navigation.tsx');
      const navContent = fs.readFileSync(navFilePath, 'utf-8');

      // The previous hardcoded string was: <p className="font-medium text-caption truncate text-[var(--muted-foreground)]">Match Engine v2.1</p>
      expect(navContent).not.toContain('Match Engine v2.1</p>');
      expect(navContent).toContain('{engineNavLabel}');
      expect(navContent).toContain('useEngineNavigationLabel');
    });

    it('renders the Home Screen displaying the dynamic baseline engine version', () => {
      const html = renderToStaticMarkup(React.createElement(HomePage));

      // Home Screen contains Engine Version card
      expect(html).toContain('Engine Version');
      // Home Screen renders the dynamic version
      expect(html).toContain('v2.1 Pro');
    });

    it('renders the Home Screen with the updated version when centralized version changes', () => {
      setEngineMetadata({ version: '2.3', edition: 'Pro' });

      const html = renderToStaticMarkup(React.createElement(HomePage));
      expect(html).toContain('Engine Version');
      expect(html).toContain('v2.3 Pro');
      expect(html).not.toContain('v2.1 Pro');
    });

    it('renders the Home Screen with graceful Unavailable display when version metadata is invalid', () => {
      setEngineMetadata({ version: '' });

      const html = renderToStaticMarkup(React.createElement(HomePage));
      expect(html).toContain('Engine Version');
      expect(html).toContain('Unavailable');
      expect(html).not.toContain('v2.1 Pro');
    });

    it('renders Navigation displaying consistent engine label and updating dynamically', () => {
      const initialHtml = renderToStaticMarkup(
        React.createElement(Navigation, null, React.createElement('div', null, 'Content'))
      );
      expect(initialHtml).toContain('Match Engine v2.1');

      setEngineMetadata({ version: '3.0' });
      const updatedHtml = renderToStaticMarkup(
        React.createElement(Navigation, null, React.createElement('div', null, 'Content'))
      );
      expect(updatedHtml).toContain('Match Engine v3.0');
      expect(updatedHtml).not.toContain('Match Engine v2.1');
    });
  });
});
