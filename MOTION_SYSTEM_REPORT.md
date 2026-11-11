# Motion System + WebKit Ghost Fix (2026-11-11)

Owner brief: "Skeleton Loading + Staggered Scale-In + Smooth
Page Transition (iOS-inspired)" at every place a page loads.
Approved for build 2026-11-11 18:00 +06. This bundle also
carries the round-2 diagnosis of the residual on-device jerk
reported after the smoothness programme.

## Round-2 diagnosis (WebKit probe, rigs/scrollslice.cjs)

The owner reported the smoothness programme "not fixed" on
his iPhone, worst during swipe navigation. A Playwright
WebKit (Safari engine) probe measured tap/swipe/push
transitions from scrolled pages:

- The suspected scroll-slice teleport (audit H-1) does NOT
  reproduce in either engine: the exiting page's visible
  slice stays pixel-exact and window scrollY holds until the
  exiting layer unmounts. The relative-anchor fix holds.
- What DOES reproduce, WebKit-only: mid-transition the
  entering page is painted TWICE at two x offsets (torn
  raster tiles — doubled buttons, medallions and text in
  captured frames; push ~110px offset, swipe ~30px).
  Chromium frames are clean, which is why desktop QA never
  saw it. On device this double-paint is the visible jerk.

## Ghost fix (PageTransition)

- The sliding wrapper now carries the app's opaque
  background (bg-[var(--background)]): the compositor moves
  one opaque layer instead of re-blending a transparent
  full-page subtree every frame.
- The enter animation is started by per-instance animation
  controls after two animation frames at the initial offset,
  so the browser completes the new page's first raster at
  rest before the layer has to move. Exit stays
  variant-driven; direction classification, durations and
  variants are unchanged.
- Re-verified with the same WebKit rig: swipe/tab and
  scrolled-click mid-transition frames are now clean single
  paints (before/after captures in ~/workspace/audit-nav).
  Desktop regression rig (navqa) still 16/16 incl. scroll
  restore. Caveat: the VM's WebKit is CPU-starved, so frame
  timing there is not device-representative; the owner's
  phone remains the decisive surface for feel.

## Motion system

Primitives:
- src/hooks/useLoadReveal.ts — the anti-jank gate: content
  arriving within 150ms of mount renders plainly (no
  skeleton flash, no stagger); loading past 150ms shows a
  skeleton; on arrival the reveal is armed but never starts
  before mount+290ms (after the <=280ms page slide), and
  fires exactly once per mount.
- src/components/motion/Reveal.tsx — RevealGroup/RevealItem
  (framer-motion variants: scale 0.97 -> 1 + fade, 0.28s,
  45ms stagger, first 8 items, iOS easing, transform +
  opacity only; plain divs under reduced motion). Once a
  group's reveal completes it is "settled": items mounted
  later under it (tab returns, appended groups) render
  straight at rest — the stagger is a first-load ceremony.
- src/lib/animations.ts — REVEAL_PARENT_VARIANTS /
  REVEAL_CHILD_VARIANTS (additive only).
- src/components/common/Skeleton.tsx — TeamCardSkeleton
  rebuilt as a Matchday mirror; new DetailsHeroSkeleton,
  ProfileSkeleton, ScorePageSkeleton, PlayerProfileSkeleton;
  src/components/ui/Skeleton.tsx re-export shim.

Pages wired: Home (ongoing card, hero cards, stat tiles;
slow loads swap "0" counters for skeleton tiles), Teams,
Tournaments, History (day groups; observer-appended groups
never animate), Tournament Details (hero block + first 7
fixture cards), Profile (one-shot initial load; sync
refreshes never re-trigger), Score page (skeleton on slow
restores; the whole scoreboard reveals as ONE block — no
per-row stagger on a live surface), Players profile, and
New Match (a real pop fixed: the saved-teams card flashed
its empty state on every mount before Dexie answered; now
gated, with skeleton strip + single-item reveal).

## Verification

- Unit 1682/1682 (153 files; +11 motion-reveal tests),
  typecheck 0, lint 0, production build PASS.
- navqa 16/16; WebKit scrollslice re-run clean.
- Known behaviour: after a load ERROR, the Retry cycle
  shows the plain gate area rather than re-showing the
  skeleton (the hook's one-shot contract); errors themselves
  surface with retry as before.

---

## Addendum — Round 3: the doubled-page regression and its fix (2026-11-11, ~21:10 +06)

**Owner evidence:** a screen recording on the real iPhone showed whole
pages doubled during tab transitions on the round-2 build; a walk of the
production site in the desktop browser reproduced the same doubling
(Matches / Tournaments / Teams, transient, clearing on settle).

**Root cause (measured, `rigs/popprobe.cjs`):** the round-2 ghost fix
wrapped the motion.div in a `TransitionPage` component that did not
forward its ref. AnimatePresence `popLayout` mode pops the exiting child
through that ref — without it the exiting page was NEVER lifted out of
flow. Probe on the broken build: both wrappers `position: relative`
through the whole transition, 14 sampled pairs, ALL stacked vertically,
ZERO overlapping. The earlier WebKit "clean frames" verdict was a
CPU-starved-rig timing artifact (frames landed after the exit had
completed); the geometry probe is the reliable instrument.

**Fix:**
1. `TransitionPage` is now `React.forwardRef` and passes `ref` to the
   motion.div. Probe after: exiting wrapper `position: absolute`,
   pairs overlapping, ZERO stacked.
2. Tab switches are cuts (native iOS tab-bar behaviour): tab enter
   x = 0, exit completes in 50 ms. The invented ±16 px tab slide is gone.
3. The exiting page never moves (exit x = 0 for push/pop/tab/fade);
   only the entering page slides, over the static exiting page —
   one moving layer per transition.
4. Regression pins: `src/__tests__/page-transition-round3.test.ts`
   (4 tests — ref forwarding, tab cut, static exit, push/pop enter
   offsets preserved).

**Gates:** unit 1682/1682 + 4 new pins, tsc 0, lint 0, build PASS,
navqa 16/16 (desktop scroll restore 407→407), WebKit slice frames
clean (single copy, marker jump 0 px), popprobe A/B as above.
