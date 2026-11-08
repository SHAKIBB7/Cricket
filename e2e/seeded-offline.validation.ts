import { test, expect } from '@playwright/test';
import { seedMatches, readSeededMatch, LIVE_MATCH_ID } from './seed';

/**
 * Seeded offline scoring journey (functional, not screenshots).
 *
 * Extends the Phase 15 offline validation from shell routes to a real
 * scoring session:
 *  1. Seed a live match (64/1, 4.3 overs, target 150) into Dexie.
 *  2. Open its score page online so the service worker runtime-caches the
 *     route, then cut the network.
 *  3. Reload offline — the chase renders from cache + IndexedDB.
 *  4. Score a run offline with the keyboard shortcut (the score page maps
 *     keys 0/1/2/3/4/6 to runs) and reload offline again — the new score
 *     must have persisted in Dexie, proving offline scoring writes are
 *     durable, not just displayed.
 */

async function waitForServiceWorker(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 })
    .toBe(true);
}

test('seeded live match scores and persists fully offline', async ({ page, context }) => {
  await seedMatches(page);
  await page.goto(`/matches/score/${LIVE_MATCH_ID}`, { waitUntil: 'networkidle' });
  await waitForServiceWorker(page);
  await expect(page.getByTestId('main-score-runs')).toHaveText('64');
  await expect(page.getByTestId('main-score-wickets')).toHaveText('1');

  await context.setOffline(true);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('main-score-runs')).toHaveText('64');

  // Score one run while offline, then wait for the engine to persist it.
  await page.keyboard.press('1');
  await expect(page.getByTestId('main-score-runs')).toHaveText('65');
  await expect
    .poll(async () => (await readSeededMatch(page, LIVE_MATCH_ID))?.secondInnings?.totalRuns, {
      timeout: 10_000,
    })
    .toBe(65);

  // The run must survive another offline reload (Dexie, not memory).
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('main-score-runs')).toHaveText('65');
  await expect(page.getByTestId('main-score-wickets')).toHaveText('1');

  await context.setOffline(false);
});
