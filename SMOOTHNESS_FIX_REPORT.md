# Smoothness & Bug-Fix Programme (2026-11-11)

Owner report after Navigation Phase 2 went live: transitions
exist but still feel jerky on the iPhone. Owner ordered a full
audit, all fixes, and an automatic push + deploy. Four parallel
read-only audits (audits in ~/workspace/navjank-audit-*.md)
plus an instrumented baseline (long tasks + frame deltas per
transition, ~/workspace/rigs/perfnav.cjs).

## Root causes of the residual jerk

1. The slide was never the main problem — the destination
   page's MOUNT was. Dexie reads + a one-shot setState land
   inside the 260ms window as one large synchronous commit.
   Worst offender: navigating to New Match blocked the main
   thread for 265ms in a single task.
2. Animating opacity on two full pages forces WebKit to
   re-raster both entire pages offscreen every frame.
3. Bottom-nav + header backdrop-blur re-blur the moving
   content every frame of every navigation.
4. SVG-renderer Lottie animations put ~1,400 DOM nodes on the
   New Match page and animate them from JS; two Lottie
   wrappers also ran infinite filter: drop-shadow loops
   (a repaint per frame, forever).
5. Per-card FadeInUp entrances on Teams/Tournaments fired a
   second, unsynchronised animation wave inside the slide.
6. New Match ran a whole-archive "ground healing" scan (+
   writes that bypassed the sync queue) on EVERY mount, plus
   a ~6-setState GPS cascade.

## Jank fixes

- PAGE_DIRECTION_VARIANTS are slide-only (opacity removed
  from push/pop/tab; kept only in the 150ms score fade).
- Bottom nav and header are near-opaque (no backdrop-blur);
  18 backdrop-blur stat pills on the score screen replaced
  with solid translucent backgrounds.
- PageTransition wrapper + content container are `relative`
  (popLayout layer anchors correctly).
- FadeInUp removed from Teams/Tournaments cards; stray
  data-swap fade-ins removed.
- Lottie components (Stadium, Plane, Striker) use the canvas
  renderer, start deferred to idle, pause when hidden /
  under reduced motion; both infinite filter-glow wrappers
  deleted; Striker indicator honours reduced motion.
- Home dashboard counters are plain text (no 450–850ms
  digit-roll tail); MotionNumber rolls remain only for the
  score page's main total cluster (tables/CRR/RRR/par are
  plain tabular text now).
- History: light summary projection from the repository,
  memoised filter/group computation, createdAt-true ordering,
  incremental render (first 4 day-groups, observer-appended),
  startTransition on the data swap; PDFs fetch the full
  record on demand.
- Tournament details: standings/leaderboard computed only
  when their tab is active; memoised match map + schedule
  partitions; cheap schedule-diff signature replaces two
  JSON.stringify passes.
- New Match: ground healing is a one-time, idle-deferred,
  flag-gated migration routed through
  MatchRepository.updateMatchVenue (sync-safe); the auto-GPS
  cascade is deferred past the transition.
- SyncContext value memoised with a snapshot-equality bail
  (a sync tick can no longer re-render the shell mid-slide);
  PdfGenerationContext memoised. Profile page refreshes its
  stats only when sync counts actually change.
- Touch handler: getComputedStyle ancestor walk replaced by
  one closest() check (M-4). Language initialises from
  localStorage (no cold-start full re-render). PRIMARY_TABS
  has a single source. Score-table rows lose permanent
  will-change; the Target Chess glow layer is inset-0 and
  static when inactive.
- Desktop scroll restore hardening (found by QA): the swap
  clamp lands on the entering page's max scroll (a small
  positive number), not 0 — the capture guard now drops any
  decrease recorded for the outgoing path within 600ms of a
  navigation, ignores recordings while a restore loop is
  working, and the restore window is 3000ms for deferred
  (startTransition) content commits.

## Correctness bugs fixed (audit: 1 High, 4 Medium, 3 Low
## + 6 in the pages partition)

- HIGH — SyncEngine outbox lost-update race: a coalesced
  newer payload could be deleted by an in-flight op and the
  record stamped SYNCED while the cloud copy stayed behind
  forever. Post-execution delete and the SYNCED stamp are
  now conditional on the payload being unchanged.
- Standings NRR now gated on COMPLETED (a live fixture-less
  match no longer moves NRR while Played stays 0).
- recordTie on knockout prunes + re-advances like
  recordWinner (a tied semi no longer leaves a stale final).
- concludeMatchWithDls below minimum overs emits a terminal
  event + snapshot (event replay reproduces ABANDONED).
- Event version/eventId are monotonic with random suffixes
  (undo + rapid scoring can no longer collide/overwrite).
- Backup merge-import converges match_events (no stale ball
  resurrection); standings registers processed matches
  before branching (no duplicate double-count); cap tables
  exclude abandoned/no-result matches.
- History: ongoing count/filter/card agree by status;
  ABANDONED gets its own pill/verdict; PENDING shows as
  Not Started (never as Completed); load failures surface
  an error + retry instead of an infinite skeleton (also
  on the Tournaments list).

## Scoring smoothness

- Engine clone is structurally shared: only the striker,
  non-striker and current bowler records are deep-copied
  per ball (scoreBall verified copy-on-write for every
  record it touches), so the memoised batsmen/bowler tables
  can finally hit their React.memo.
- Mobile scoreboard gains the live DLS par strip the
  desktop tree already had (correctness M4).

## Measurements (VM Chromium, relative before -> after)

- Home -> New Match: long tasks 475ms -> 361ms total,
  DOM nodes 2034 -> 623.
- New Match -> History: 207ms -> 0–66ms; rendered height
  3743 -> 2287 (incremental).
- Tournaments -> Details push: 234ms -> 154–200ms across runs.
- Home mount: worst single block 142ms -> 79ms; DOM
  1212 -> 546.
- Light tab switches and pop were and remain clean.

## Verification

- Unit 1671/1671 (152 files; +14 regression tests),
  typecheck 0, lint 0, production build PASS.
- Navigation QA rig 16/16 incl. scoring-state round-trip,
  offline navigation, desktop scroll restore 420 -> 420.
- Remaining known limits: popLayout still pops the exiting
  page out of flow on mobile window-scroll (anchored now;
  the scroll-clamp teleport from scrolled lists is
  mitigated by the capture/restore hardening but a full
  mode change needs on-device evaluation); New Match mount
  still carries ~200ms of form render on this VM's CPU —
  the page is a 1,454-line form; further splitting is a
  separate programme.
