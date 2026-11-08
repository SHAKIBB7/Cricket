import { defineConfig } from '@playwright/test';

/**
 * Visual regression (Phase 14).
 *
 * Screenshots the app's shell routes in the production build, across the
 * three themes (light/dark/sunlight) and two viewport classes (mobile
 * 390px, desktop 1280px), and diffs them against committed baselines in
 * e2e/__snapshots__/.
 *
 * Determinism measures:
 *  - animations disabled for screenshots (`animations: 'disabled'`) and
 *    reduced-motion emulation (the app honors prefers-reduced-motion)
 *  - fixed viewports, fresh browser context per test (empty local data —
 *    the app's deterministic empty state), theme pinned via localStorage
 *  - 1% pixel-diff tolerance for font rasterization noise
 *
 * Baselines are platform-specific (generated on Linux/Chromium). Regenerate
 * after INTENTIONAL visual changes only: `npm run test:visual:update`,
 * then eyeball every changed baseline before committing it.
 *
 * Requires a production build first: `npm run build`.
 * Specs live in e2e/ and are named *.visual.ts so Vitest never picks them up;
 * they are also excluded from the app tsconfig.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*.visual.ts', '**/*.validation.ts'],
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'Asia/Dhaka',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'desktop',
      use: {
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: 'npm run start -- -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
