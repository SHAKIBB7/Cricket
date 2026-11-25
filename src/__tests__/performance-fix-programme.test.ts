/**
 * Performance fix programme 2026-11-15 — regression pins.
 *
 * Baseline (~/workspace/cricket-perf-measure/REPORT.md): every
 * route had a 140–283ms long task in the first ~300ms from the
 * shared layout/vendor bundle; New Match was worst (827ms total);
 * Home CLS was 0.137; the 281KB app icon was preloaded in the
 * layout head. These pins keep the structural fixes from
 * silently regressing:
 *  1. The icon is not preloaded; the optimised icons stay small
 *     and 512x512.
 *  2. firebase-config stays SDK-free; AuthContext/SyncContext
 *     load Firebase/SyncEngine dynamically, never statically.
 *  3. Home / New Match / Teams / Tournaments / Analytics load
 *     their repositories dynamically (no static repository ->
 *     SyncEngine -> Firebase chain in their initial chunks).
 *  4. Home renders no in-flow ongoing-match skeleton (the CLS
 *     source identified from layout-shift entries).
 *  5. CACHE_VERSION is v2.2.13 in sw.js and the manager
 *     fallbacks (standing release rule).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Fix 3 — icon preload removed, icons optimised', () => {
  it('layout does not preload the app icon but still preloads the Bengali fonts', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout).not.toContain('href="/assets/icon/cricket.png"\n          fetchPriority');
    expect(layout).not.toMatch(/rel="preload"\s+as="image"\s+href="\/assets\/icon\/cricket\.png"/);
    expect(layout).toContain('href="/fonts/NotoSansBengali-Bold.ttf"');
    expect(layout).toContain('href="/fonts/NotoSansBengali-Regular.ttf"');
    // Manifest/metadata icon references stay in place
    expect(layout).toContain("url: '/assets/icon/cricket.png'");
  });

  it.each(['cricket.png', 'cricket_foreground.png'])(
    '%s is 512x512 and under 120KB',
    (name) => {
      const buf = fs.readFileSync(path.join(root, 'public/assets/icon', name));
      expect(buf.length).toBeLessThan(120 * 1024);
      // PNG IHDR: width/height are big-endian uint32 at bytes 16/20
      expect(buf.readUInt32BE(16)).toBe(512);
      expect(buf.readUInt32BE(20)).toBe(512);
    }
  );
});

describe('Fix 1 — Firebase/Supabase lazy-load structure', () => {
  it('firebase-config is SDK-free', () => {
    const cfg = read('src/infrastructure/auth/firebase-config.ts');
    expect(cfg).not.toContain("from 'firebase/");
    expect(cfg).toContain('export function checkFirebaseConfigured');
  });

  it('firebase.ts re-exports the light helpers', () => {
    const fb = read('src/infrastructure/auth/firebase.ts');
    expect(fb).toContain("from './firebase-config'");
    expect(fb).toContain('checkFirebaseConfigured');
  });

  it('supabase.ts reads placeholders from the light module, not firebase.ts', () => {
    const sb = read('src/infrastructure/auth/supabase.ts');
    expect(sb).toContain("from './firebase-config'");
    expect(sb).not.toContain("from './firebase'");
  });

  it('AuthContext has no static Firebase service imports and loads them dynamically', () => {
    const ctx = read('src/context/AuthContext.tsx');
    expect(ctx).not.toMatch(/^import \{ FirebaseAuthService/m);
    expect(ctx).not.toMatch(/^import \{ UserProfileService/m);
    expect(ctx).not.toMatch(/^import \{ SyncEngine \}/m);
    expect(ctx).toContain("await import('@/infrastructure/auth/FirebaseAuthService')");
    expect(ctx).toContain("await import('@/infrastructure/auth/UserProfileService')");
    expect(ctx).toContain("from '@/infrastructure/auth/firebase-config'");
    // First render must stay hydration-safe: no client-only reads
    expect(ctx).not.toContain('localStorage');
    expect(ctx).not.toContain('navigator');
  });

  it('SyncContext loads SyncEngine/OfflineSetupService dynamically, deferred to idle', () => {
    const ctx = read('src/context/SyncContext.tsx');
    expect(ctx).not.toMatch(/^import \{ SyncEngine/m);
    expect(ctx).not.toMatch(/^import \{ OfflineSetupService \}/m);
    expect(ctx).toContain("import('@/infrastructure/sync/SyncEngine')");
    expect(ctx).toContain("import('@/infrastructure/offline/OfflineSetupService')");
    expect(ctx).toContain('requestIdleCallback');
  });
});

describe('Fix 1/2/5 — repositories load dynamically on data pages', () => {
  it.each([
    'src/app/page.tsx',
    'src/app/matches/new/page.tsx',
    'src/app/teams/page.tsx',
    'src/app/tournaments/page.tsx',
    'src/app/analytics/page.tsx',
  ])('%s has no static repository import', (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/^import \{ (MatchRepository|FeatureHubRepository|GroundRepository) \} from/m);
    expect(src).toContain("import('@/infrastructure/storage/");
  });

  it('careerStats loads its repositories dynamically (central chain for Teams/Players/Analytics)', () => {
    const src = read('src/features/players/careerStats.ts');
    expect(src).not.toMatch(/^import \{ (MatchRepository|FeatureHubRepository) \} from/m);
    expect(src).toContain("import('@/infrastructure/storage/MatchRepository')");
    expect(src).toContain("import('@/infrastructure/storage/FeatureHubRepository')");
  });

  it('New Match keeps the bowling limiter drawer as an inline component', () => {
    const src = read('src/app/matches/new/page.tsx');
    expect(src).toContain("import { BowlingLimiterDrawer } from '@/components/common/BowlingLimiterDrawer'");
    expect(src).toContain('<BowlingLimiterDrawer');
  });
});

describe('Fix 4 — Home CLS sources removed', () => {
  it('Home renders no in-flow ongoing-match skeleton', () => {
    const home = read('src/app/page.tsx');
    expect(home).not.toContain('home-ongoing-match-skeleton');
    expect(home).not.toContain('isDashboardLoading ? (');
  });

  it('stats skeleton tiles use the height-matched line boxes', () => {
    const home = read('src/app/page.tsx');
    expect(home).toContain('h-[25px] sm:h-[30px]');
  });
});

describe('Release rule — CACHE_VERSION v2.2.13', () => {
  it('sw.js and ServiceWorkerManager fallbacks agree', () => {
    expect(read('public/sw.js')).toContain("const CACHE_VERSION = 'v2.2.13'");
    const manager = read('src/infrastructure/pwa/ServiceWorkerManager.ts');
    expect(manager).toContain('cric-scorer-runtime-v2.2.13');
    expect(manager).toContain('cric-scorer-shell-v2.2.13');
  });
});
