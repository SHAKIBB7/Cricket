import { test, expect } from '@playwright/test';
import { seedMatches, LIVE_MATCH_ID } from './seed';

/**
 * Ultimate audit Stage B — behavioural regression guards.
 *
 * F13: a same-tick double submit (both handlers running before
 * React re-renders, so the state-based isSaving guard and the
 * stale-list duplicate check both miss) must still create exactly
 * ONE team. Fixed with a synchronous ref guard; this test failed
 * with 2 records before the fix.
 *
 * F2: two tabs scoring the same match share one IndexedDB. The
 * stale tab's persist overwrites the fresh tab's balls (verified:
 * a scored single vanished, 65/1 -> stored 68/1 from the stale
 * tab's world). The shipped guard is a BroadcastChannel warning:
 * when another tab persists, this tab must surface the conflict
 * banner instead of clobbering silently.
 */

async function countByName(page: import('@playwright/test').Page, store: string, name: string) {
  return page.evaluate(
    async ([storeName, target]) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('CricScorerPro_v2');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const all = await new Promise<any[]>((resolve, reject) => {
        const req = db.transaction(storeName as string, 'readonly').objectStore(storeName as string).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return all.filter((r) => r.name === target).length;
    },
    [store, name] as const,
  );
}

test.describe('Stage B guards', () => {
  test('F13: same-tick double submit creates exactly one team', async ({ page }) => {
    await page.goto('/teams', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /create|new team|add/i }).first().click();
    await page.locator('input').first().fill('Stage B Guard XI');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form?.requestSubmit();
      form?.requestSubmit();
    });
    await page.waitForTimeout(800);
    expect(await countByName(page, 'teams', 'Stage B Guard XI')).toBe(1);
  });

  test('F2: scoring in tab A raises the cross-tab warning in tab B', async ({ context }) => {
    const pageA = await context.newPage();
    await seedMatches(pageA);
    const pageB = await context.newPage();

    await pageA.goto(`/matches/score/${LIVE_MATCH_ID}`, { waitUntil: 'networkidle' });
    await pageB.goto(`/matches/score/${LIVE_MATCH_ID}`, { waitUntil: 'networkidle' });

    // No warning before anything happens.
    await expect(pageB.getByText('updated in another tab')).toHaveCount(0);

    await pageA.getByRole('button', { name: '1 Single' }).click();

    // Tab B must be told its view of the match is stale.
    await expect(pageB.getByText('updated in another tab')).toBeVisible({ timeout: 5000 });
  });
});
