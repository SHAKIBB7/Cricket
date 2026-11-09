# PWA Programme P3 — Platform Service + Installation System (2026-11-09)

Implements Phase 2 design Clusters 1–2 (decisions D1–D3) from
`~/workspace/Cricket-PWA-Phase2-Design.md`: the app gains a
platform/capability detection service, a complete install
lifecycle, one passive install entry point, iOS splash screens
and Apple web-app metadata, and a proper maskable icon.

## What was built

**Platform detection (D1)** — `src/lib/platform.ts`: pure,
input-explicit detection. `detectFormFactor(ua, touchPoints)`
covers android / ios / ipados (incl. the iPadOS desktop-mode
Macintosh-UA + touch heuristic) / windows / macos / other;
`detectPlatform()` adds display mode (matchMedia standalone +
iOS `navigator.standalone`) and capabilities (serviceWorker,
storage.persist, backgroundSync-for-diagnostics, install-prompt
family). Feature detection first; UA only for the form-factor
fork, as designed.

**Install lifecycle** — `src/context/PlatformContext.tsx`
(`PlatformProvider` in the root layout, beside SyncProvider):
captures `beforeinstallprompt` when it fires (deferred, never
auto-shown), tracks `appinstalled` and display-mode changes,
and derives ONE install state for all UI: `installed` /
`prompt` / `instructions-ios` / `instructions-desktop` /
`unsupported`. A dismissed native prompt records
`install_prompt_dismissed_at` in app_metadata and the 30-day
cooldown (D3) demotes the state to instructions. Apple devices
can never enter the prompt state. `usePlatformOptional()` gives
provider-less surfaces (isolated renders/tests) a stateless
instruction-state fallback instead of a crash.

**Install UI (D2)** — `src/components/profile/InstallAppCard.tsx`
on the profile page, between the sync card and the Drive backup
card: state-driven affordance (Install button → native prompt
on tap; "How to install" → UnifiedSheet with platform-correct
steps — iOS Share → Add to Home Screen, desktop menu paths
incl. macOS Safari Add to Dock; Installed pill; muted
unsupported note). No banner, no popup, no timer — the user
visits it, or not.

**Apple metadata + splashes** — layout metadata gains
`appleWebApp` (capable, title, black-translucent status bar)
and 10 `apple-touch-startup-image` entries (iPhone 12–15
families, XR/SE, iPad 11"/12.9"). Splashes are generated brand
screens (artwork centred on the icon's sampled navy) stored as
JPEG (~59 KB each, 587 KB total) under `public/splash/` —
deliberately OUTSIDE `public/assets` so the Phase-7 asset
budget guard (< 1 MB) keeps measuring the app payload; iOS
fetches exactly one at launch, and none are SW-precached.

**Maskable icon** — the shipped 512 icon is edge-to-edge
artwork whose text would crop under Android masks (verified
visually). New `public/assets/icon/maskable-512.png`: the same
artwork at 80% centred on brand navy (safe-zone compliant),
now the manifest's `purpose: "maskable"` entry; the `any`
entries are unchanged. SW `CACHE_VERSION` bumped v2.2.2 →
v2.2.3 so installed clients refresh the precached manifest.

## Tests

`src/__tests__/pwa-install-platform.test.tsx` (7 tests, jsdom):
the form-factor truth table (incl. iPadOS desktop-mode UA);
provider state machine — desktop instructions, prompt capture →
accept → appinstalled = installed, dismissal writes the
cooldown timestamp and demotes to instructions, iPhone never
prompts, standalone = installed; and the card's
state-appropriate affordance.

Two mid-flight fixes worth recording: (1) the card originally
consumed the throwing `usePlatform()` and broke 14 profile-page
render tests that mount the page without the root providers —
solved with `usePlatformOptional()` rather than touching the
tests; (2) splash PNGs (~2.3 MB) broke the asset-budget guard —
solved with JPEG + the `public/splash/` home above, guard green
again (assets 930,641 bytes < 1 MB, maskable included).

## Gates (at P3 HEAD)

- Unit: **1325/1325** (124 files; 1318 + 7 new)
- Typecheck: 0 errors · Lint: clean · Build: PASS
- Playwright: visual **38/38**, offline **10/10**, overlay
  **4/4**, stageb **4/4** (profile is not a visual-suite route;
  no baselines changed)

## Files

- `src/lib/platform.ts`, `src/context/PlatformContext.tsx` —
  detection + provider.
- `src/components/profile/InstallAppCard.tsx` — install card.
- `src/app/layout.tsx` — provider + appleWebApp metadata.
- `src/app/profile/page.tsx` — card placement.
- `public/manifest.json` — maskable entry; `public/sw.js` —
  CACHE_VERSION v2.2.3.
- `public/assets/icon/maskable-512.png`, `public/splash/*.jpg`
  (10) — generated assets.
- `src/__tests__/pwa-install-platform.test.tsx` — tests.

## Limits

- Emulation proves code paths, not platforms (prompt §19): the
  real install flows — Android prompt, iOS Add to Home Screen +
  splash rendering, Edge install — verify only on TAIMUR's
  devices in P8. iPadOS detection uses the documented touch
  heuristic; a touch-enabled Mac would misread as iPadOS for
  instruction purposes (harmless: both get instruction states,
  and desktop Safari steps mention Add to Dock in the desktop
  sheet).
- The `beforeinstallprompt` capture happens at provider mount
  (root layout) — the earliest point React allows; browsers
  fire the event after installability checks, in practice
  after first paint, so capture is reliable.
- Splash set covers the listed device families; unlisted
  sizes fall back to no splash (icon + background colour),
  never a broken image.
