# Motion Unification Report — ONE system (framer-motion)

Date: 2026-11-11 · Owner pick: Option A (audit:
`~/workspace/Cricket-Motion-Navigation-Audit.md`)
Scope: the unification + the tab slide + the image-entrance
programme + the preceding performance cleanup, in one bundle.

## 1. Performance cleanup (done first, per owner's order)

- **Bengali dictionary lazy split**: `LanguageContext` was
  168 KB with both dictionaries inline. Now `src/i18n/en.ts`
  (static) + `src/i18n/bn.ts` (dynamic chunk, loaded only when
  Bengali is active; `t()` serves English during the load) +
  `src/i18n/index.ts` (`TRANSLATIONS` for tests). LanguageContext
  168 KB → 2.9 KB. **Home First Load 470 → 449 kB.**
- `PAGE_TRANSITION_VARIANTS` retired (already dead since
  Phase 2); the premium suite now pins the live variants.
- NOT done (documented in the audit): lazy-loading the
  Firebase/Supabase stack out of the 496K layout chunk — auth/
  sync surgery that cannot be verified without a Firebase env;
  proposed as its own programme.

## 2. One motion system — what was retired

From `src/lib/animations.ts` (grep-verified dead/zombie):
DURATIONS, TRANSITIONS (CompactDropdown now inlines its one
transition), BOTTOM_SHEET_VARIANTS, DROPDOWN_MENU_VARIANTS,
CONTENT_FADE_UP_VARIANTS, ACCORDION_VARIANTS,
NUMBER_COUNTER_VARIANTS, TAP_SCALE / HOVER_SCALE /
ICON_TAP_SCALE / ICON_HOVER_SCALE, and the waterDrop /
liquidSpring / springBouncy / springSnappy easings. MODAL /
BACKDROP transitions inlined from the same values.

Duplicated systems collapsed into the framer system:
- **Entrance ×3 → 1**: AdvancedAnalyticsPanel's orphaned
  STAGGER_CONTAINER/FADE_UP_ITEM stagger now uses the Reveal
  variants. The CSS entrance classes (animate-fade-in/fadeIn/
  fade-up/fade-down/scale-in, ~20 sites) and the
  tailwind-animate dialect (animate-in/fade-in/zoom-in-95 —
  partially no-op: slide-in-from-bottom-4 and zoom-in-95 were
  never defined) are replaced by a new **`Entrance`** primitive
  (Reveal curve: scale 0.97→1 + fade, 0.28 s iOS ease;
  `fadeOnly` for backdrops) across Teams/Tournaments/New Match
  modals and banners, the Grounds card, the match-center toast,
  DLS modal banners, both backup restore modals and the
  MatchesPanel empty state. Page/skeleton roots simply dropped
  the class (the page slide is their entrance).
- **Skeleton pulse ×2 → 1**: `skeleton-pulse` keyframes
  deleted; shimmer is the only skeleton engine.
- **FadeInUp component deleted** (production-dead since the
  jank programme) and the **`ui/Skeleton.tsx` re-export shim
  deleted** — its 4 importers now use `common/Skeleton`
  directly.
- globals.css: the fade/scale keyframes, the animate-in
  fallback classes and skeleton-pulse are gone; a comment
  records where entrances live now.
- The premium animation suite was rewritten to pin the
  SURVIVING system and to assert the retired exports stay
  deleted (absence pins), instead of keeping zombies alive.

What deliberately stays (not rival architectures): CSS
transitions for hover/press state, Lottie as ambient
illustration, the hold-ring's JS interval (hold timing),
the bottom-nav indicator's CSS transform on the shared iOS
bezier, MotionNumber's inline digit variants.

## 3. Tab slide (owner's app-wide slide request)

Tab switches now use the same slide-over as push: entering
page slides from the side of travel (±64 px by signed tab
delta, 260 ms iOS ease) over the static, popped exiting page.
The round-3 rules that killed the doubling bug are untouched
(forwardRef + popLayout + exit x = 0); the round-3 test's
tab-cut pin was updated with the supersession recorded.
Geometry probe after: pairs overlapping 1, **stacked 0**;
mid-slide frame at 393 px shows a single clean layer.

## 4. Image entrance (owner's idea, in the one system's language)

- **`RevealImg`** (`src/components/motion/MediaReveal.tsx`):
  a shimmer skeleton holds the image's exact box while it
  loads; on load the image enters with the Reveal curve,
  staggered by index (45 ms, capped). Cached images render
  plainly (complete-on-mount check). Wired into: analytics
  (×3), match center MoM, opening-players slots (×3), score
  chase tile, summary MoM. Decorative home watermarks use
  `watermark` mode — fade via an inline-opacity handoff back
  to the CSS class, so group-hover opacity still works; no
  skeleton/scale. Inline icons ≤ 20 px stay plain (they are
  SW-warmed; a skeleton there would be noise).
- **Stadium poster crossfade**: `StadiumLottieAnimation`
  gained `onReady`; Home wraps it in **`MediaReveal`** — a
  static poster (a real rendered frame of the animation,
  10 KB) fills the tile until the Lottie is rendering, then
  crossfades. The empty-tile pop is gone.
- **Preload**: OfflineSetupService now warms all 9
  illustrations + the poster with the shell, so placeholders
  are the exception. `public/assets` total 952 KB < 1 MB
  guard (margin ~72 KB — the icon folder is the bulk).

## 5. Gates (all on the final tree)

- Unit **1694/1694** (156 files; +5 media-entrance tests,
  premium suite rewritten, round-3 tab pin updated)
- typecheck 0 · lint 0 · build PASS (Home First Load 449 kB)
- navqa **16/16** · popprobe tab slide: overlapping, 0 stacked
- Offline e2e **10/10** · scrollperf: p95 17 ms everywhere,
  worst gap 33 ms, **0 long tasks** (no regression)
- 393 px visuals: Home settled (poster → Lottie, watermarks
  faded), tab mid-slide frame (single layer), New Match form.
  Opening-players/analytics RevealImg cards need real match
  data to render — same component verified on Home + in unit
  tests; the owner's phone is the final surface.

## 6. Push note

The snapshot mechanism (GitHub API) cannot express file
deletions: `FadeInUp.tsx` and `ui/Skeleton.tsx` will remain
on the remote as unreferenced orphans after this push (nothing
imports them; zero runtime effect). A future direct push from
the owner's machine can remove them for good.
