# Day Audit — 2026-11-10 (all of the day's updates, re-checked)

TAIMUR's instruction (21:33 +06): check and test ALL of the day's
updates thoroughly, fix any bugs found. Scope: the 25 commits from
the elevation rollout (`7356a93`) through the profile share cards
(`e6ac43f`) — elevation, segmented overflow, sheet keyboard, bowler
grid page + both alignment follow-ups, batsman compact/header/strips
rounds, name-edit gate, batting-hand engine fix, Encounter Econ,
Bowler Master B + over-equation rows, profile share cards.

Method: fresh full gates → four parallel read-only review clusters
(profiles / share cards / UI infrastructure / engine hands) → every
finding verified against the code before fixing → browser checks at
TAIMUR's real 393px width (English AND Bengali) → regression tests.

**Totals: 2 High, 8 Medium, and 11 Low findings verified and fixed;
8 further items reviewed and deliberately left (reasons below).**

## High

1. **Legacy matches still lost their openers' hands on any ball
   edit or undo-after-refresh.** The morning's hand fix only
   protected matches created after it: pre-fix event logs carry no
   hand fields, so a replay rebuilt the openers as Right-hand and
   the result was persisted over the correct scorecard values.
   Fix: `withBackfilledOpenerHands` — the two replay paths seeded
   from a live engine (`editHistoricalBall`, the undo fallback) now
   inject the current innings' openers' hands into COPIES of the
   `MATCH_CREATED` / `INNINGS_STARTED` payloads when the fields are
   absent. The stored log is never rewritten. +2 regression tests.
2. **The bowler card's "Wickets Taken" disagreed with the modal.**
   Three different filters existed (modal section, share handler,
   per-over rows). The modal's dismissal-substring rule also
   credited fielders and run-outs (`c Naeem b Rakibul` listed the
   wicket in Naeem's profile; `run out (Naeem)` likewise), and the
   card silently dropped legacy dismissal-text wickets the modal
   shows. Fix: ONE matcher, `analytics/wicketsTaken.ts` —
   bowlerId → stamped bowler name → the dismissal's bowled-by slot
   only. Modal and card both use it; the section title now counts
   the list it actually shows. Unit-tested incl. the short-name
   stranger case (`Rana` ⊄ `Ranajit`).

## Medium

3. **Ongoing over labelled "MAIDEN"** at 0 runs (modal equation row
   and share card) — a verdict that only exists at over end. Now
   gated on completion in both.
4. **Over totals contradicted the engine.** The modal's
   `calculateOverRuns` excluded byes/leg-byes (an over with `B4`
   displayed "MAIDEN" while the Maidens strip disagreed) and let
   penalty tokens corrupt totals (`-5P` → "-2 runs", false
   maidens). Replaced by the shared `analytics/overLog.ts`
   `overRunsScored`, mirroring the engine's maiden accounting
   exactly (B/LB count, run-out completed runs count, penalty
   tokens skipped, wide/no-ball charges from advancedSettings).
   Verified live: `B4` over renders "= 4 runs", true maiden renders
   MAIDEN, strip agrees. Penalty tokens also no longer render as
   ball circles; long tokens (`Wd+3+W`) shrink instead of spilling.
5. **Summary page fed both modals first-innings data only** — a
   second-innings top scorer/bowler got the wrong (or an empty)
   dismissal and wickets record. The page now resolves the
   selected player's own innings by id.
6. **Batsman header meta overflowed at 393px** with a long
   dismissal. The meta row now wraps; screenshot-verified with
   "c Mohammad Rakibul Hasan b Naeem Islam" — fully visible on its
   own line.
7. **Same-name bowlers:** the score page's currently-bowling
   fallback compared NAMES, so a namesake's profile could show the
   other bowler's live over and open his rename gate. The fallback
   now prefers the bowler record id.
8. **Share-card identity meta had no truncation** — a long
   dismissal ran ~75px past the card edge. The meta flow is now
   budgeted (truncate + stop), unit-pinned.
9. **Bowler grid subtext painted over the figures at 393px**
   (dots + "ov left" ≈105px in an ≈84px cell; worse in Bengali).
   Escaped the day's fixes because they were verified at 430px.
   Fix: subtext wraps, dots shrink, padding/gaps rebalanced,
   OV/ECON tracks widened (also covers `10.5` overs and `100.00`
   econ). VERIFIED at 393px in English and Bengali through the
   real over-completion flow — no spill in either language.
10. **Second-innings openers could never be left-handed.** The
    engine accepted chase hands since the morning fix, but the
    innings-transition form never collected them. The form now has
    RHB/LHB toggles for both openers, passed to
    `startSecondInnings`.

## Low (all fixed)

- Yet-to-bat players were shown a "Defensive" intent banner and
  **Shot Control 100%** computed from zero balls — the intent
  banner and dot strip (modal + card) now render only with at
  least one ball faced.
- Percentages could exceed 100 / go negative on imported or
  desynced data (batsman boundary %, dot %) — clamped at the
  computation sites. The bowler's Dot % had the same hole, found
  live in the browser (122% on desynced logs) and clamped too.
- Boundary-state duplicate "Cur Over": at an exact over boundary
  the completed over could be appended a second time, double-
  counting dots/wides/no-balls. Deduped.
- Legacy bowlers without `overHistory` showed fabricated zeros
  (Dot Balls 0, Dot % 0…) beside real figures — the log-derived
  sections (modal + card) now hide when a bowler has bowled but
  has no logs. One old test pin updated as a documented
  expectation change.
- Share card: Run Production legend dot overlapped "Running" at
  3-digit running totals (now placed from the text's real width);
  the LIVE pill was struck through by the fixed divider (divider
  and circles now follow the chip + pill per row — verified in
  the downloaded PNG); the `#{position}` chip the modal shows was
  plumbed but never drawn (now drawn — verified); scoreboard-
  opened first-innings profiles were labelled "2nd Innings"
  (scoreboard call sites now pass teams-only context — never
  wrong instead of sometimes wrong); share failures were silent
  (the button now shows a transient failure state); the
  non-striker's card dot was blue where the modal's badge is
  emerald (aligned); `truncateToWidth` could split a surrogate
  pair (now code-point safe); circle text inherited tracked
  titles' letterSpacing (reset).
- Sunlight theme: the elevation exemption silently defeated the
  designed `focus:shadow-elev1` lift on inset inputs — a
  `:focus` exemption rule restores it.
- Bowler page presentation stretched full-window on desktop —
  capped at `max-w-3xl`. Grid column header is now sticky. The
  grounds filter row can no longer be squeezed by its title
  (truncate + shrink-0).
- Test gap: the hand fix's second-innings test never asserted the
  REPLAYED second innings' hands — now pinned.

## Reviewed and deliberately left

- `fromEvents` BALL_SCORED fallback discarding a later
  INNINGS_STARTED's names/hands — malformed logs only, pre-existing
  structure.
- Super-over construction has no hand channel — cosmetic
  placeholders, no UI selects super-over hands, no divergence.
- Match-centre FoW fallback player hard-codes Right-hand —
  pre-existing display edge when the victim lookup fails.
- Name-edit gate asymmetry (bowler gate is live-computed) —
  the crease-only gate working as specified.
- Sunlight coloured glows on primary CTAs — the rollout commit's
  deliberate opt-in.
- `interactiveWidget: resizes-content` is app-wide — accepted:
  it is also what fixes Android sheets; standard behaviour.
- Rename input wiped if the name changes externally mid-edit —
  rare, pre-existing in both modals.
- Non-opener batting hands remain unrepresentable — design scope
  boundary (no UI or squad field exists for them).

## Gates

- Unit: **1592/1592** (144 files; day baseline 1568 → +24 tests:
  22 audit regressions + 2 legacy-hand tests; 2 superseded pins
  updated as documented expectations).
- Typecheck 0 · Lint 0 errors · Build PASS.
- Playwright battery: visual 38/38 · offline 10/10 · overlay 4/4 ·
  stageb 4/4 — ALL GREEN.
- Browser checks at 393px: bowler grid EN + BN (real flow),
  bowler modal over totals, batsman long-dismissal wrap, share
  cards for striker + current bowler (real PNG downloads,
  inspected). Screenshots in `~/workspace/audit-2026-11-10/shots/`.
