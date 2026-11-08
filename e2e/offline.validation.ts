import { test, expect } from '@playwright/test';

/**
 * Phase 15 — offline-first PWA validation (functional, not screenshots).
 *
 * Verifies the app's actual offline contract in a real browser against the
 * production build:
 *  1. The service worker registers, takes control, and precaches the shell.
 *  2. With the network off, a reload still renders the app from cache and
 *     the UI communicates the offline state.
 *  3. Data created while offline is written to IndexedDB (Dexie), survives
 *     an offline reload, and is neither lost nor duplicated on reconnect.
 *
 * Deliberately NOT asserted: cloud sync draining the outbox. That needs a
 * configured Firebase backend + a signed-in user; in an unconfigured/guest
 * environment the SyncEngine correctly keeps ops PENDING and retries (see
 * PHASE15_OFFLINE_REPORT.md).
 */

const TEAM_NAME = 'Offline Validation XI';

async function waitForServiceWorker(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 })
    .toBe(true);
}

/** Offline setup warms per-route chunks in the background once online. */
async function waitForRouteAssets(page: import('@playwright/test').Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          for (const name of await caches.keys()) {
            const cache = await caches.open(name);
            const keys = await cache.keys();
            if (keys.some((k) => k.url.includes('/app/offline/page-'))) return true;
          }
          return false;
        }),
      { timeout: 45_000 }
    )
    .toBe(true);
}

async function readTeams(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const req = indexedDB.open('CricScorerPro_v2');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction('teams', 'readonly');
    return new Promise<Array<{ name: string; syncStatus?: string }>>((resolve, reject) => {
      const r = tx.objectStore('teams').getAll();
      r.onsuccess = () => resolve(r.result as Array<{ name: string; syncStatus?: string }>);
      r.onerror = () => reject(r.error);
    });
  });
}

test.describe('Phase 15: offline-first PWA', () => {
  test('service worker controls the page and precaches the app shell', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForServiceWorker(page);

    const cacheInfo = await page.evaluate(async () => {
      const names = await caches.keys();
      let entries = 0;
      for (const name of names) {
        const cache = await caches.open(name);
        entries += (await cache.keys()).length;
      }
      return { names, entries };
    });

    expect(cacheInfo.names.some((n) => n.startsWith('cric-scorer-shell-'))).toBe(true);
    expect(cacheInfo.entries).toBeGreaterThanOrEqual(20);
  });

  test('app shell renders from cache while offline, with offline status communicated', async ({ page, context }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForServiceWorker(page);
    await waitForRouteAssets(page);

    await context.setOffline(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);

    await page.reload({ waitUntil: 'domcontentloaded' });
    // "Start Match" is an <a> on desktop and a <button> on mobile — assert
    // the rendered hero text, not a specific role.
    await expect(page.getByText(/start match/i).first()).toBeVisible({ timeout: 15_000 });
    // The app must communicate the offline state. Two indicator variants
    // exist: the compact one in the mobile header (status dot + label from
    // sm up, data-testid="sync-indicator-toggle") and the full one in the
    // desktop sidebar (label on the button itself). Both open the same
    // details dialog — use whichever is visible in this form factor.
    const compactToggle = page.locator('[data-testid="sync-indicator-toggle"] >> visible=true').first();
    if (await compactToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await compactToggle.click();
      await expect(page.getByText(/working offline/i).first()).toBeVisible({ timeout: 10_000 });
    } else {
      // Desktop: the sidebar's Cloud Sync row carries an "Offline" badge.
      await expect(page.locator('span:text-is("Offline")').first()).toBeVisible({ timeout: 10_000 });
    }

    // Cold navigation to a route never visited this session. Its document
    // was precached, but the page only renders offline if its route chunk
    // was warmed too (Phase 15 regression: /offline itself rendered blank).
    await page.goto('/offline', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/offline mode active/i).first()).toBeVisible({ timeout: 15_000 });

    await context.setOffline(false);
  });

  test('offline setup warms per-route chunks (not just documents)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForServiceWorker(page);
    // The /offline route chunk must land in a cache while online, even
    // though nothing in the UI links to /offline (no prefetch ever warms it).
    await waitForRouteAssets(page);
  });

  test('team created offline persists locally and survives reconnect without duplication', async ({ page, context }) => {
    await page.goto('/teams', { waitUntil: 'networkidle' });
    await waitForServiceWorker(page);

    await context.setOffline(true);

    await page.getByRole('button', { name: /create team/i }).first().click();
    await page.getByPlaceholder('e.g. Dhaka Gladiators').fill(TEAM_NAME);
    await page.getByRole('button', { name: /save team squad/i }).click();

    // Visible in the UI and written to IndexedDB as a pending local record.
    await expect(page.getByText(TEAM_NAME).first()).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await readTeams(page)).filter((t) => t.name === TEAM_NAME).length).toBe(1);
    const [team] = (await readTeams(page)).filter((t) => t.name === TEAM_NAME);
    expect(team.syncStatus).toBeTruthy();

    // Survives a reload while still offline.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(TEAM_NAME).first()).toBeVisible({ timeout: 15_000 });

    // Reconnect: offline status clears, data intact, exactly one copy.
    await context.setOffline(false);
    await expect.poll(() => page.evaluate(() => navigator.onLine), { timeout: 10_000 }).toBe(true);
    await page.waitForTimeout(1500);
    await expect(page.getByText(TEAM_NAME).first()).toBeVisible();
    const after = (await readTeams(page)).filter((t) => t.name === TEAM_NAME);
    expect(after).toHaveLength(1);
  });
});
