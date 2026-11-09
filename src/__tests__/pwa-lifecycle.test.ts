import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ServiceWorkerManager } from '../infrastructure/pwa/ServiceWorkerManager';

describe('PWA & Service Worker Lifecycle Test Suite', () => {
  it('A. Verifies Web App Manifest has correct PWA standalone properties and shortcuts', () => {
    const manifestPath = path.resolve(__dirname, '../../public/manifest.json');
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw);

    expect(manifest.id).toBe('cric-scorer-pro');
    expect(manifest.name).toBe('Cricket Scorer Pro');
    expect(manifest.short_name).toBe('CricScorer');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.theme_color).toBe('#10b981');
    expect(manifest.background_color).toBe('#020617');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(3);
  });

  it('B. Verifies Service Worker excludes sensitive Supabase & Auth URLs from caching', () => {
    const swPath = path.resolve(__dirname, '../../public/sw.js');
    const swContent = fs.readFileSync(swPath, 'utf-8');

    // Security check: Must contain strict regex patterns for auth and supabase exclusion
    expect(swContent).toContain('CACHE_EXCLUSION_PATTERNS');
    expect(swContent).toContain('supabase\\.co');
    expect(swContent).toContain('auth');
    expect(swContent).toContain('token');
  });

  it('C. Verifies Service Worker supports SKIP_WAITING safe update message', () => {
    const swPath = path.resolve(__dirname, '../../public/sw.js');
    const swContent = fs.readFileSync(swPath, 'utf-8');

    expect(swContent).toContain('SKIP_WAITING');
    expect(swContent).toContain('TRIGGER_BACKGROUND_SYNC');
  });

  it('D. ServiceWorkerManager exposes the scoring route and never confirms natively (P4 R1)', () => {
    // P4 contract change (Phase 2 design §10/R1): the mid-scoring
    // confirmation moved OUT of the manager into SyncProvider's
    // ConfirmationDialog. The manager now only exposes
    // isScoringRouteActive() for that gate and never calls
    // window.confirm itself; the gate behaviour is covered by
    // pwa-update-flow.test.tsx.
    const mockConfirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal('window', {
      location: {
        pathname: '/matches/score/match_live_123',
        reload: vi.fn(),
      },
      confirm: mockConfirm,
    });

    expect(ServiceWorkerManager.isScoringRouteActive()).toBe(true);

    ServiceWorkerManager.applyUpdate();
    expect(mockConfirm).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('E. ServiceWorkerManager safely activates updates when user is outside active scoring', () => {
    const mockReload = vi.fn();
    vi.stubGlobal('window', {
      location: {
        pathname: '/matches/history',
        reload: mockReload,
      },
      confirm: vi.fn(),
    });

    ServiceWorkerManager.applyUpdate();

    expect(mockReload).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
