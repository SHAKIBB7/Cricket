# Profile Share Cards — Report

**Date:** 2026-11-10 · **Requested by:** TAIMUR (a share button on the
right side of both profile app bars — one tap saves the ENTIRE
profile as one compact PNG image) · **Design:** two canvas-card
mockups (Batsman / Bowler) approved by TAIMUR before implementation.

## What shipped

- **New renderer** `src/features/scoring/share/ProfileShareCard.ts`,
  following the existing `ScoreShareCard` pattern (pure layout
  builders + a thin canvas painter + share/download flow):
  - `buildBatsmanCardLayout` / `buildBowlerCardLayout` return a
    1080px-wide portrait card whose height grows with content —
    brand + match context header, identity block (initials tile,
    name, meta line with status), then every profile section.
  - Batsman card: Batting Intent banner (intent-tinted gradient),
    stats strip (Runs/Balls/SR/4s/6s), Run Production stacked bar +
    legend, Dot Ball & Shot Control strip, Encounter vs Bowlers
    table (with the Econ column), Deliveries Faced ball circles.
  - Bowler card: figures strip, Pressure & Discipline strip,
    over-by-over equation rows (chip | balls = total / MAIDEN,
    LIVE chip on the ongoing over, per-over wicket rows), Wickets
    Taken in Match.
  - Empty sections are omitted (no encounter data, no wickets,
    no balls faced yet) — the card only claims what exists.
  - Long match contexts drop the innings suffix before they would
    ellipsize mid-word; long names truncate cleanly.
  - `shareProfileCardImage` mirrors `shareScoreCardImage`: Web
    Share API with a File payload first (iOS share sheet → Save
    Image), PNG download fallback, never throws.
- **Buttons:** both profile modals gain a circular share button at
  the right end of the app bar (`aria-label="Share profile as
  image"`, spinner while rendering). The modals assemble the card
  input from the same computed values they render — one source of
  truth, no duplicated analytics.
- **Match context wiring:** the score page (both call sites) and
  the match-centre page pass `matchContext` ("Team A vs Team B •
  Nth Innings" on the score page, teams on centre). The summary
  page's existing modal call sites omit it — their cards simply
  carry no context line.
- A first-cut bug was caught by end-to-end verification, not by
  the layout tests: the batsman handler read `e.bowler` where
  `bowlerEntries` carries `bowlerName`, which silently failed the
  share whenever encounter data existed. Fixed and re-verified.

## Verification

- **End-to-end (real PNGs):** in the local production build, the
  seeded live match's profiles were opened, the share button was
  clicked, and the actual downloaded PNGs inspected —
  `sanaj-batsman-profile.png` and `naeem-bowler-profile.png` both
  render complete and polished (injected matchup/over data, since
  the seeded fixtures carry empty matchup maps). Two spacing
  polish rounds followed from that inspection (text-width
  estimator calibration, meta gaps, wicket-row offsets, intent
  banner inset, LIVE pill padding, context truncation).
- **Tests:** 12 new layout tests (`profile-share-card.test.ts`)
  pin the card contents, section omission, token colours and
  filenames. Full gates green (see below).

## Gates

- Unit: 1568/1568 (143 files)
- Typecheck: 0 errors · Lint: clean · Build: PASS
- Playwright: visual 38/38, offline 10/10, overlay 4/4, stageb 4/4
