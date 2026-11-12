/**
 * Performance round pins (2026-11-11).
 *
 * The owner's phone felt 'laggy' across the whole app even
 * though all data already lives on-device. Three structural
 * costs were addressed:
 * 1. Service-worker navigations were NETWORK-FIRST — every
 *    cold PWA launch paid a full document fetch on mobile
 *    data before anything rendered. Now stale-while-revalidate:
 *    the cached document renders instantly, a background fetch
 *    refreshes it. Shipped as CACHE_VERSION v2.2.8 so clients
 *    pick it up through the existing update flow. (Bumped to
 *    v2.2.10 with the 2026-11-12 version-skew fix: the navigation
 *    handler now serves the freshest revalidated document first
 *    and refreshes the precached shell copy — see sw.js.)
 * 2. Long-list cards render/paint only near the viewport
 *    (.cv-auto content-visibility) on History/Tournaments/Teams.
 * 3. Ambient Lottie loops pause while scrolled off-screen.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('performance round', () => {
  it('SW serves navigations stale-while-revalidate at v2.2.10', () => {
    const sw = read('public/sw.js');
    expect(sw).toContain("const CACHE_VERSION = 'v2.2.10'");
    const navFn = sw.slice(sw.indexOf('async function handleNavigationRequest'));
    // Cache is consulted and returned BEFORE awaiting the network.
    expect(navFn.indexOf('caches.match(request)')).toBeLessThan(
      navFn.indexOf('await networkPromise'),
    );
    expect(navFn).toContain('event.waitUntil(networkPromise)');
    // Version-skew fix: the freshest (runtime) document is
    // consulted before any other cache.
    expect(navFn.indexOf('runtimeCache.match(request)')).toBeLessThan(
      navFn.indexOf('caches.match(request)'),
    );
    const manager = read('src/infrastructure/pwa/ServiceWorkerManager.ts');
    expect(manager).toContain('cric-scorer-runtime-v2.2.10');
    expect(manager).toContain('cric-scorer-shell-v2.2.10');
  });

  it('SW caches are bounded and quota-safe (bug hunt P-3)', () => {
    const sw = read('public/sw.js');
    // Entry limits + oldest-first eviction helper.
    expect(sw).toContain('RUNTIME_CACHE_LIMIT = 120');
    expect(sw).toContain('STATIC_CACHE_LIMIT = 200');
    expect(sw).toContain('async function trimCache');
    // Guarded put: a QuotaExceededError can never mask a good
    // network response as an offline failure.
    expect(sw).toContain('async function safeCachePut');
  });

  it('offline warm list covers /players', () => {
    expect(read('src/infrastructure/offline/OfflineSetupService.ts')).toContain("'/players',");
  });

  it('list cards opt into content-visibility', () => {
    expect(read('src/app/globals.css')).toContain('content-visibility: auto');
    expect(read('src/app/tournaments/page.tsx')).toContain('h-full cv-auto');
    expect(read('src/app/teams/page.tsx')).toContain('transition-all cv-auto');
    expect(read('src/app/matches/history/page.tsx')).toContain('shadow-elev1 cv-auto');
  });

  it('ambient Lottie loops pause off-screen', () => {
    for (const f of [
      'src/components/common/StadiumLottieAnimation.tsx',
      'src/components/common/PlaneLottieAnimation.tsx',
    ]) {
      const src = read(f);
      expect(src).toContain('new IntersectionObserver');
      expect(src).toContain('animItem.pause()');
    }
  });
});
