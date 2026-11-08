import { test, expect } from '@playwright/test';
import { seedMatches, LIVE_MATCH_ID, COMPLETED_MATCH_ID } from './seed';

/**
 * Visual regression for the data-dependent match pages, made deterministic
 * by seeding Dexie with two fixed MatchScorecard records (see e2e/seed.ts):
 *
 *   score page   — live 2nd-innings chase, 64/1 after 4.3 overs, target 150
 *   center page  — the same live match
 *   summary page — the completed version (Hungry Eleven won by 29 runs)
 *
 * Seeding happens per test on a fresh browser context, so no state leaks
 * between tests or into the shell-route suite.
 */

const PAGES: Array<{ name: string; path: string; ready: (page: any) => Promise<void> }> = [
  {
    name: 'score-live',
    path: `/matches/score/${LIVE_MATCH_ID}`,
    ready: async (page) => {
      await expect(page.getByTestId('main-score-runs')).toHaveText('64');
    },
  },
  {
    name: 'center-live',
    path: `/matches/center/${LIVE_MATCH_ID}`,
    ready: async (page) => {
      await expect(page.getByText('Thunder Storm').first()).toBeVisible();
    },
  },
  {
    name: 'summary-completed',
    path: `/matches/summary/${COMPLETED_MATCH_ID}`,
    ready: async (page) => {
      await expect(page.getByText('Hungry Eleven won by 29 runs').first()).toBeVisible();
    },
  },
];

const THEMES = ['light', 'dark'] as const;

for (const theme of THEMES) {
  test.describe(`visual seeded: ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => {
        try {
          localStorage.setItem('theme', t);
        } catch {
          /* storage unavailable — app falls back to system preference */
        }
      }, theme);
    });

    for (const p of PAGES) {
      test(`${p.name} (${theme})`, async ({ page }) => {
        await seedMatches(page);
        await page.goto(p.path, { waitUntil: 'networkidle' });
        await p.ready(page);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);
        await expect(page).toHaveScreenshot(`${p.name}-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
          maxDiffPixelRatio: 0.01,
        });
      });
    }
  });
}
