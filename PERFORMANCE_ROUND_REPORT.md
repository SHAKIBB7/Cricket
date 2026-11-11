# Performance Round — Report (2026-11-11)

Owner brief: the doubling bug is fixed on device, but the whole
site still feels "laggy" on the phone; the owner asked that all
data live offline on the device so the lag goes away.

## What was already true

Data was never the bottleneck: matches, teams and tournaments
live in on-device IndexedDB (Dexie, local-first); screens never
read from the network; cloud sync is a background outbox. The
app shell and route assets are service-worker cached, with an
offline warm pass over the primary routes.

## Measured baseline (393 px, Chromium, 4x CPU throttle)

Scroll probe (`rigs/scrollperf.cjs`, 40 seeded history matches):
every primary page already scrolled at 60 fps — p95 frame gap
17 ms everywhere; history had ONE 57 ms long task and a 67 ms
worst gap. Rendering weight was not the main cost in Chromium.
The structural cost that DOES scale with a real phone on real
mobile data is the service worker's navigation strategy.

## Fixes

1. **SW navigations: network-first → stale-while-revalidate**
   (`public/sw.js`, CACHE_VERSION v2.2.6 → **v2.2.7**;
   ServiceWorkerManager fallback cache names follow). Every
   cold PWA launch previously paid a full document fetch before
   first paint; iOS evicts PWAs from memory constantly, so most
   launches are cold. Now the cached document renders instantly
   and a background fetch (kept alive via `event.waitUntil`)
   refreshes it. App freshness still flows through the SW
   update mechanism (Update Ready → Apply). Offline fallback
   chain (root shell → /offline → 503) unchanged for the
   nothing-cached case.
2. **content-visibility for list cards** — `.cv-auto` utility
   (content-visibility: auto; contain-intrinsic-size: auto
   180px) on the History match card, Tournament card and Team
   card roots: off-screen cards skip layout/paint. Verified at
   depth: deep-scrolled cards materialise at their true 186 px
   height, fully rendered.
3. **Ambient Lottie pauses off-screen** — Stadium and Plane
   animations gain an IntersectionObserver (threshold 0.05)
   that pauses the loop when the hero leaves the viewport and
   resumes on return; observer disconnected on unmount.
4. **Offline warm coverage** — `/players` added to the
   OfflineSetupService warm list (documents + route assets).

## Verification

- Baseline vs after (scrollperf): history worst gap 67 → 33 ms,
  long tasks 1×57 ms → 0; all pages p95 17 ms, zero gaps > 50 ms.
- Unit 1690/1690 (155 files; +4 pins in
  `src/__tests__/performance-round.test.ts`), tsc 0, lint 0,
  build PASS.
- **Offline e2e suite: 10/10 passed** — the navigation-strategy
  change preserves the offline contract (cold offline
  navigation, /offline route, outbox behaviour).
- 393 px visual: archive deep-scroll screenshot — cards intact
  (winner tint, venue, actions), no collapsed/blank cards.

## Honest limit

Chromium in this VM cannot reproduce the owner's carrier path
to production; the launch win is architectural (zero network
wait on cached launches), not a locally measured delta. The
decisive surface remains the owner's phone.
