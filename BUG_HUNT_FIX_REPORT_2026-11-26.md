# Bug Hunt + Fix Report — 2026-11-26

**Scope (TAIMUR's order):** full bug hunt, fix everything, fix the Android
app icon, build a fresh release APK. Branch-only programme: pushed to
`audit/fix-phase2-10`; **main and the production website were not touched.**

Findings source: `~/workspace/BUG_HUNT_2026-11-26.md` (three parallel
hunters — correctness, data/sync, platform) — **39 unique findings
(HIGH 6 · MED 16 · LOW 17)**, plus one found during this programme
(J-1). The 2026-11-12 hunt's 31 fixes were regression-checked: all
intact except three incomplete fixes (C-1 → C-M5, C-7 → C-L4, M1 → C-H3).

**Outcome: HIGH 6/6 fixed · MED 16/16 fixed (D-M7 as a bounded
mitigation) · LOW 14/17 fixed, 3 deferred/documented with reasons ·
J-1 fixed · app icon fixed.** New regression pins: `src/__tests__/bug-hunt-2026-11-26.test.ts`
+ `src/__tests__/live-publish-service.test.ts` + live_matches cases in
`rules-tests/firestore-rules.test.ts`.

CACHE_VERSION bumped **v2.2.13 → v2.2.14** (public/sw.js,
ServiceWorkerManager fallbacks, OfflineSetupService stamp, all test
pins) per the standing release rule — the branch carries app-code
changes even though production is untouched by this programme.

---

## App icon (TAIMUR's report: "অন্যরকম কিছু আসতেছে")

Root cause: every APK shipped the **Capacitor default** launcher icon
(teal grid + white robot-ish glyph) — the brand icons were never
generated for Android during the Capacitor phases.

Fix (`android/app/src/main/res/`, 27 files): generated from the real
logo `public/assets/icon/cricket.png` (navy rounded square, gold bat,
white ball, "120/3", "CRIC SCORER PRO") —

- legacy `ic_launcher.png` + `ic_launcher_round.png` at all five
  densities (48→192 px; round variant masked onto a brand-navy disc);
- adaptive `ic_launcher_foreground.png` at all five densities
  (108→432 px; logo at 72% of canvas — measured inside the adaptive
  safe zone, letterforms' max radius fraction 0.744 vs the 0.72 scale);
- `values/ic_launcher_background.xml` → brand navy **#04162F**
  (sampled from the logo);
- all 11 `splash.png` files regenerated (navy plate + centred logo).

Verified by composed previews (full + circle-masked): the complete
logo renders with "CRIC SCORER PRO" readable, and again from the
built APK's extracted resources (see the verification section of the
delivery report).

**iOS (report only, per scope):** `ios/App/App/Assets.xcassets/
AppIcon.appiconset/AppIcon-512@2x.png` is **also the Capacitor
default** (blue X on white grid), not the brand logo. One-file fix,
ready to apply whenever the iOS build is picked up.

---

## HIGH — all fixed

| ID | Finding | Fix |
|----|---------|-----|
| D-H1 | live_matches update rule checked only the request payload — any signed-in user could hijack/delete another scorer's live doc by writing their own uid into ownerUid | firestore.rules: create/update split; update requires the **existing** doc's owner == caller and owner unchanged. Rules tests added (D-L6) |
| D-H2 | LivePublishService retried failed writes with a 0 ms wait, forever (lastSentAt only advanced on success) | Bounded exponential backoff (2 s → 60 s), park after 6 consecutive failures until a fresh publish or 'online' event; offline doesn't burn attempts |
| D-H3 | Match delete / Clear Database / completion never reliably unpublished the public live doc | Persistent localStorage delete queue retried on later activity; MatchRepository.deleteMatch/deleteMatches unpublish + clear flags; Clear Database unpublishes all; completed snapshots self-delete after 30 min (D-L1) |
| C-H1 | Live feed attributed every ball to the wrong batter (payload stamped the post-ball striker) | Engine captures the facer before mutation; payload `striker` = facer, new `dismissedBatter` on wickets; ballText uses it |
| C-H2 | A wicket on a Free Hit was scored as a No Ball (OutModal mapped free-hit → isNoBall) | OutModal no longer maps isFreeHit to the no-ball delivery type; dismissal filtering still treats a free hit like a no ball |
| C-H3 | Score page passed decimal overs into the DLS modal, bypassing the 2026-11-12 M1 fix at this call site | Prop now passes `DlsEngine.ballsToOversNotation(totalBalls)`, the same helper the scoreboard path uses |

## MED — all fixed

| ID | Finding | Fix |
|----|---------|-----|
| D-M1 | live_matches rules had no schema/size/status validation (junk docs, forged future timestamps pinning fake matches) | `isValidLiveMatch` validator in rules (field allow-list, bounds, status enum); client clamps future `updatedAtMs` in LiveWatchService |
| D-M2 | Public live page showed "LIVE" forever for abandoned docs | `isLive` requires an update within 6 h; 60 s re-evaluation tick |
| D-M3 | Publishing ignored sign-out/account switch; per-device broadcast flag let user B auto-publish user A's match under B's uid | Broadcast flag scoped by uid; score page resolves the flag per user; AuthContext sign-out calls `clearLivePublishState()` |
| D-M4 | Replace restore (file + Drive) never cleared sync_queue — replaced-away records resurrected from queued ops | Both services clear `db.sync_queue` inside the replace transaction |
| D-M5 | Outbox coalescing crossed a queued DELETE (delete → re-create ended deleted in the cloud, SYNCED locally) | queueMutation refuses to coalesce into an op that precedes a pending DELETE for the same entity; the save appends at the tail |
| D-M6 | Clear Database left grounds, profile, last-active-match pointer, live flags/docs | Clear now wipes grounds + user_profile, deletes the metadata pointer, clears flags, unpublishes live docs |
| D-M7 | Clear-tombstone gate never expired — other devices' older records suppressed + cloud-deleted forever | **Bounded mitigation:** tombstone expires after 1 year (the clear's own deletes drain in days; a full fix needs per-device provenance on cloud docs). D-4 behaviour inside the window unchanged and still pinned |
| D-M8 | Pre-restore snapshot reported success when the WebView share sheet was dismissed — replace could erase data with no snapshot | downloadBlob returns a distinct `'cancelled'`; downloadBackupSnapshot's `ok` requires a real delivery ('share'/'anchor') |
| D-M9 | File import passed matchEvents unvalidated (D-11 residual) | parseBackup validates events with the Drive path's predicate; invalid entries dropped + counted |
| C-M1 | ABANDONED matches published as LIVE | Snapshot maps ABANDONED → completed, "Match abandoned" |
| C-M2 | Live chase figures went negative past the target ("REQ −4.00") | runsNeeded clamped at 0; reqRate null when nothing is needed |
| C-M3 | Win predictor hard-coded 10 wickets in hand | Real limit: players-per-side − 1, or 2 for a Super Over |
| C-M4 | Historical ball edits left payload totals stale (live over summaries showed pre-edit figures) | editHistoricalBall (and the undo replay fallback) copies replay-derived payload fields back into the stored log per innings/index |
| C-M5 | Resuming a match rewrote createdAt | fromScorecard restores scorecard.createdAt; fromEvents takes it from MATCH_CREATED |
| C-M6 | "Retired Hurt" via the wicket modal scored as a dismissal | Score page routes it to retirePlayer; engine converts any scoreBall path that carries it as a wicket (replay-safe via a ballInput flag) |
| C-M7 | (Suspicion, confirmed) DLS treated an all-out first innings as 9 wickets down | Wicket clamps at the resource call sites are 10, so getResourcePercentage's all-out early return (0) fires |

## LOW — 14 fixed, 3 deferred/documented

Fixed: D-L1 completed-doc retention (30-min self-delete via the
persistent queue) · D-L2 clean sends evicted from the pending map ·
D-L3 file import rejects another account's records when the uid is
known (Drive parity; LocalFileBackupSection passes it) · D-L4
conflict-branch records (+ their events) dropped at import · D-L5
Supabase dual-write failures for Firebase sessions now log loudly
instead of being silently acked · D-L6 live_matches rules tests ·
C-L1 extras over-notation before the first legal ball · C-L2 bowling
card keeps a wides-only bowler (incl. stumping wicket) · C-L3 batting
card keeps a not-out batter who faced only wides (shared
getBattedPlayers) · C-L4 leaderboard dismissals id-first · C-L5 win
predictor par table scaled for non-T20 chases · C-L6 penalty runs in
the live feed + over summaries (boundary awards attribute to the
completed over) · P-F3 LiveNowSection re-checks staleness every
minute · P-F5 OfflineSetupService version stamp updated (was
v2.2.11).

**Deferred/documented, with reasons:**
- **P-F4** — useViewportMetrics reads window in its state
  initialiser (latent hydration trap). Assessed and DELIBERATELY
  left unchanged: its only consumers are overlay sheets, which
  render nothing until opened post-mount, so no mismatch occurs in
  practice; initialising to the server constant made UnifiedSheet
  render an empty shell on first paint and broke the sheet/grid/
  modal render suites. The assessment is recorded in a comment at
  the hook so it is not "fixed" blind later.
- **P-F6** — Android targetSdk 34 will block a future Play Store
  submission. Needs a Gradle/AGP upgrade cycle; out of scope for a
  same-day APK. Noted for the Play publishing pass.
- **P-F7** — (Suspected) MainActivity insets-listener fragility.
  On-device behaviour only; cannot be confirmed or refuted in this
  environment. The nav-overlap fix it neighbours was already shipped
  and awaits TAIMUR's re-test verdict.

## J-1 — found during this programme

The v2.2.12 precache diet slimmed apple-touch-icon 49,525 → 8,687 B,
but the hand-merge that produced main 2f32eba8 restored the fat
version (sw.js kept the diet; the icons didn't). Both
`apple-touch-icon.png` and `-precomposed` re-slimmed with the same
256-colour palette quantization: **49,525 → 7,919 B each**, 180×180
unchanged, logo verified visually after quantization.

---

## Gates (all green, 2026-11-26)

- Unit tests: **1856/1856 passed, 170 files** (baseline 1833 + 23 new
  pins; four stale pins that encoded the defects were corrected —
  see below).
- Typecheck (tsc --noEmit): **clean**.
- Lint (next lint): **0 errors** (pre-existing warnings only, none
  in touched files).
- Web build (next build): **PASS**.
- Shell build (build:shell): **PASS**; `out/live/_/` shell present.
- Shell export probe: **14/14 PASS**.
- Production hydration probe (393 px, 9 routes): **EN — CSP 0,
  hydration 0, page errors 0; BN — CSP 0, hydration 0, page
  errors 0**.

## Notes for TAIMUR

- The firestore.rules changes (D-H1/D-M1) take effect only when the
  pending `firebase deploy --only firestore:rules` is run — the same
  deploy already owed for the D-9 rules. Until then the deployed
  rules still govern.
- The APK from this branch installs over the previous release APK
  (same key) — data preserved.

## Test-pin corrections (pins that encoded the defects)

Four existing tests pinned the buggy behaviour and were updated to
the corrected contract (each carries an in-test comment):

- `wicket-scrolling-and-profile-swipe-fix.test.tsx` expected a
  Retired Hurt scored as a wicket to make totalWickets 1 (the C-M6
  defect); now expects 0 wickets and the canonical 'Retire Hurt'
  fall-of-wicket type.
- `player-name-editing.test.ts` expected ball 2's payload striker
  to be the post-ball striker (the C-H1 defect); now expects the
  facer.
- `bughunt-download-webview.test.ts` expected a dismissed share
  sheet to report 'share' (the D-M8 defect); now expects
  'cancelled' (still no anchor fallback).
- `offline-setup-manager.test.ts` pinned the stale setup version
  stamp 'v2.2.11'; now 'v2.2.14' (P-F5 + the release bump).

`LocalFileBackupSection` now reads AuthContext tolerantly (the
context object is exported) so the section renders outside an
AuthProvider; the D-L3 uid check simply skips when signed out.
