// @vitest-environment jsdom
/**
 * Deploy version-skew recovery pins (2026-11-12).
 *
 * Reproduced owner report: after a deploy, a returning PWA
 * client kept running the previous build's JS from the SW
 * shell; chunk loads against the new build failed ("Failed to
 * fetch RSC payload … reading 'call'", 31 times in simulation)
 * and navigation looked dead. The fix has three pinned parts:
 * 1. CACHE_VERSION bumped to v2.2.9 in sw.js AND the manager
 *    fallbacks, so this release reaches clients through the
 *    designed Update Ready flow with a full cache purge.
 * 2. The SW navigation handler serves the freshest revalidated
 *    document (runtime cache) before the install-time shell
 *    copy, and refreshes the shell copy on each fetch, so a
 *    reload always converges.
 * 3. A client guard reloads the page (capped, spaced) when a
 *    chunk-skew error escapes to the window.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { attemptChunkRecovery, installChunkRecovery, isChunkSkewError } from '../lib/chunk-recovery';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

function chunkError(): Error {
  const err = new Error('Loading chunk 123 failed (error: chunk-load)');
  err.name = 'ChunkLoadError';
  return err;
}

function webpackModuleMiss(): TypeError {
  const err = new TypeError("Cannot read properties of undefined (reading 'call')");
  err.stack =
    "TypeError: Cannot read properties of undefined (reading 'call')\n" +
    '    at s (https://example.test/_next/static/chunks/webpack-abc.js:1:100)';
  return err;
}

describe('isChunkSkewError', () => {
  it('accepts ChunkLoadError by name', () => {
    expect(isChunkSkewError(chunkError())).toBe(true);
  });

  it('accepts dynamic-import failure messages', () => {
    expect(isChunkSkewError(new Error('Failed to fetch dynamically resolved module'))).toBe(true);
    expect(isChunkSkewError('Loading chunk 42 failed')).toBe(true);
  });

  it('accepts the webpack module-miss TypeError only with a build-chunk stack', () => {
    expect(isChunkSkewError(webpackModuleMiss())).toBe(true);
    const noStack = new TypeError("Cannot read properties of undefined (reading 'call')");
    noStack.stack = 'TypeError\n    at onClick (https://example.test/app-code.js:1:1)';
    expect(isChunkSkewError(noStack)).toBe(false);
  });

  it('rejects unrelated errors', () => {
    expect(isChunkSkewError(new Error('Network request failed'))).toBe(false);
    expect(isChunkSkewError(new TypeError("Cannot read properties of null (reading 'name')"))).toBe(false);
    expect(isChunkSkewError(null)).toBe(false);
    expect(isChunkSkewError(undefined)).toBe(false);
    expect(isChunkSkewError({})).toBe(false);
  });
});

describe('installChunkRecovery', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('reloads once on a chunk error, then enforces the gap', () => {
    const reload = vi.fn();
    let clock = 100000;
    const uninstall = installChunkRecovery({ reload, now: () => clock });
    window.dispatchEvent(new ErrorEvent('error', { error: chunkError() }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('csp_chunk_recovery_v1')).toContain('"count":1');
    // A burst of further chunk errors inside the gap does not reload again.
    window.dispatchEvent(new ErrorEvent('error', { error: chunkError() }));
    expect(reload).toHaveBeenCalledTimes(1);
    // After the gap it may recover again.
    clock += 9000;
    window.dispatchEvent(new ErrorEvent('error', { error: webpackModuleMiss() }));
    expect(reload).toHaveBeenCalledTimes(2);
    uninstall();
  });

  it('reloads on unhandled rejection with a chunk error', () => {
    // jsdom does not deliver synthetic unhandledrejection events
    // to window listeners, so the rejection path is exercised
    // through the same handler the listener calls.
    const reload = vi.fn();
    expect(attemptChunkRecovery(chunkError(), { reload, now: () => 5000 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    // …and the installer really wires that listener.
    expect(read('src/lib/chunk-recovery.ts')).toContain("addEventListener('unhandledrejection'");
  });

  it('ignores non-chunk errors and stops after uninstall', () => {
    const reload = vi.fn();
    const uninstall = installChunkRecovery({ reload, now: () => 5000 });
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom') }));
    expect(reload).not.toHaveBeenCalled();
    uninstall();
    window.dispatchEvent(new ErrorEvent('error', { error: chunkError() }));
    expect(reload).not.toHaveBeenCalled();
  });

  it('caps total recovery reloads per session', () => {
    const reload = vi.fn();
    let clock = 0;
    const uninstall = installChunkRecovery({ reload, now: () => clock });
    for (let i = 0; i < 5; i++) {
      clock += 10000;
      window.dispatchEvent(new ErrorEvent('error', { error: chunkError() }));
    }
    expect(reload).toHaveBeenCalledTimes(3);
    uninstall();
  });
});

describe('version-skew fix wiring', () => {
  it('SW is at v2.2.9 and serves the freshest document first', () => {
    const sw = read('public/sw.js');
    expect(sw).toContain("const CACHE_VERSION = 'v2.2.9'");
    const navFn = sw.slice(sw.indexOf('async function handleNavigationRequest'));
    expect(navFn.indexOf('runtimeCache.match(request)')).toBeGreaterThanOrEqual(0);
    expect(navFn.indexOf('runtimeCache.match(request)')).toBeLessThan(
      navFn.indexOf('caches.match(request)'),
    );
    // Shell copies of precached routes are refreshed on fetch.
    expect(navFn).toContain('PRECACHE_RESOURCES.includes');
    expect(navFn).toContain('SHELL_CACHE');
  });

  it('manager fallbacks move with the SW version', () => {
    const manager = read('src/infrastructure/pwa/ServiceWorkerManager.ts');
    expect(manager).toContain('cric-scorer-runtime-v2.2.9');
    expect(manager).toContain('cric-scorer-shell-v2.2.9');
  });

  it('the recovery guard is mounted in the root layout', () => {
    expect(read('src/app/layout.tsx')).toContain('<ChunkRecoveryMount />');
    const mount = read('src/components/ChunkRecoveryMount.tsx');
    expect(mount).toContain('installChunkRecovery');
    // First-render safety: listeners live in a mount effect only.
    expect(mount).toContain('useEffect');
  });
});
