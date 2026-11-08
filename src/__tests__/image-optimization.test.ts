import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Image optimization regression guard.
 *
 * Before this pass, public/assets weighed 8.4 MB — including 1024x1024 PNGs
 * of 1.3–1.7 MB displayed at 16–80 px — and the service worker precached ALL
 * of it at install. The files were optimized IN PLACE (same paths, so stored
 * avatar photoURLs and every reference keep working): illustrations capped
 * at 512px + palette-quantized, app icons capped at 512px.
 *
 * This test fails if (a) a precached file goes missing, (b) asset weight
 * regresses, or (c) someone re-disables the Next image optimizer.
 */

const publicDir = path.resolve(process.cwd(), 'public');
const swSrc = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf-8');
const configSrc = fs.readFileSync(path.resolve(process.cwd(), 'next.config.mjs'), 'utf-8');

function dirBytes(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirBytes(p) : fs.statSync(p).size;
  }
  return total;
}

describe('image optimization (Phase 7)', () => {
  it('every file in the SW precache list actually exists in public/', () => {
    const block = swSrc.slice(swSrc.indexOf('PRECACHE_RESOURCES'), swSrc.indexOf(']', swSrc.indexOf('PRECACHE_RESOURCES')));
    const entries = [...block.matchAll(/'(\/[^']+\.[a-z0-9]+)'/gi)].map((m) => m[1]);
    expect(entries.length).toBeGreaterThan(10);
    for (const entry of entries) {
      expect(fs.existsSync(path.join(publicDir, entry)), `precached ${entry} exists`).toBe(true);
    }
  });

  it('SW precache no longer references the deleted public animation duplicates', () => {
    const block = swSrc.slice(swSrc.indexOf('PRECACHE_RESOURCES'), swSrc.indexOf(']', swSrc.indexOf('PRECACHE_RESOURCES')));
    const entries = [...block.matchAll(/'(\/[^']+)'/g)].map((m) => m[1]);
    expect(entries.some((e) => e.startsWith('/assets/animations/'))).toBe(false);
  });

  it('total public/assets weight stays under 1 MB (was 8.4 MB)', () => {
    expect(dirBytes(path.join(publicDir, 'assets'))).toBeLessThan(1024 * 1024);
  });

  it('no single illustration exceeds 100 KB (largest was 1.7 MB)', () => {
    const dir = path.join(publicDir, 'assets/illustrations');
    for (const f of fs.readdirSync(dir)) {
      expect(fs.statSync(path.join(dir, f)).size, f).toBeLessThan(100 * 1024);
    }
  });

  it('avatar preset paths referenced by EditProfileModal still exist on disk', () => {
    const modalSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/profile/EditProfileModal.tsx'),
      'utf-8'
    );
    const urls = [...modalSrc.matchAll(/url: '(\/assets\/[^']+)'/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThanOrEqual(8);
    for (const url of urls) {
      expect(fs.existsSync(path.join(publicDir, url)), `${url} exists`).toBe(true);
    }
  });

  it('Next image optimizer is not disabled in next.config', () => {
    // Matches the actual setting, not prose mentions of it in comments.
    expect(configSrc).not.toMatch(/unoptimized\s*:\s*true/);
  });
});
