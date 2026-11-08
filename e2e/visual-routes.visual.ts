import { test, expect } from '@playwright/test';

/**
 * Visual regression baselines for the app's shell routes.
 *
 * Data-dependent screens (live score page, match center/summary) need a
 * seeded match and are intentionally NOT covered yet — see
 * VISUAL_REGRESSION.md. Everything here renders in the app's deterministic
 * empty state with no account and no network data.
 */

const ROUTES: Array<{ path: string; name: string }> = [
  { path: '/', name: 'dashboard' },
  { path: '/teams', name: 'teams' },
  { path: '/tournaments', name: 'tournaments' },
  { path: '/analytics', name: 'analytics' },
  { path: '/matches/new', name: 'new-match' },
  { path: '/offline', name: 'offline' },
];

const THEMES = ['light', 'dark'] as const;

for (const theme of THEMES) {
  test.describe(`visual: ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      // The app reads localStorage 'theme' in an inline script before first
      // paint (see src/app/layout.tsx), so this pins the theme with no flash.
      await page.addInitScript((t) => {
        try {
          localStorage.setItem('theme', t);
        } catch {
          /* storage unavailable — app falls back to system preference */
        }
      }, theme);
    });

    for (const route of ROUTES) {
      test(`${route.name} (${theme})`, async ({ page }) => {
        await page.goto(route.path, { waitUntil: 'networkidle' });
        // Let webfonts and the optimized public images settle.
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);
        await expect(page).toHaveScreenshot(`${route.name}-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
          maxDiffPixelRatio: 0.01,
        });
      });
    }
  });
}

// The third theme (sunlight/outdoor) gets dashboard coverage — it is the
// Phase 17 high-contrast mode and the most likely to regress silently.
test.describe('visual: sunlight theme', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('theme', 'sunlight');
      } catch {
        /* ignore */
      }
    });
  });

  test('dashboard (sunlight)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot('dashboard-sunlight.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
  });
});
