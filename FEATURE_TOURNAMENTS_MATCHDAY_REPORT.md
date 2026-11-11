# Tournaments Page — Matchday Trophy Cards

**Date:** 2026-11-11 (started 2026-11-10 23:56 +06) · **Direction:**
TAIMUR asked JINI to select a redesign consistent with the app's
current design language; JINI proposed the Matchday family (the
Teams page's navy band + stat strip + segmented bar, with a gold
tournament identity), showed three further directions on request
(Trophy Cabinet / Broadcast Dark / Minimal List), and TAIMUR
picked **(1) Matchday Trophy**.

## What changed (`src/app/tournaments/page.tsx`, card only)

- **Navy band** — same `#141a38` band as the Teams Matchday cards:
  a gold trophy medallion (amber-ringed circle with a Trophy
  glyph), the tournament name in white bold, a gold format pill
  (**Knockout** / **League**, new short i18n keys
  `tournaments_format_knockout_short` /
  `tournaments_format_league_short`), and delete as a white
  circular button — the same `handleDelete` confirm flow,
  unchanged.
- **Stat strip** — Teams / Overs / third cell: **Meetings** `Nx`
  for leagues, **Matches** (fixture count) for knockouts. New
  short label keys `tournaments_overs_label` /
  `tournaments_matches_label` (EN + BN); the Teams label reuses
  `tournaments_teams_suffix`.
- **Segmented progress** — the thin progress bar becomes one
  segment per fixture (the Teams squad-bar language), emerald as
  each fixture completes (`winner || isTie`), with the existing
  "Progress · n / N matches" caption kept. A zero-fixture
  tournament keeps an empty track.
- **Champion band** — when `t.champion` is set, the bottom zone is
  a full-width gold band (Award icon + CHAMPION + name in dark
  amber tones) instead of the old small amber box.
- Card click → detail page, the create modal, empty state,
  skeletons, success toast and the Create Tournament buttons are
  unchanged. The now-unused `progress` percentage variable was
  removed.

## Verification (393px, seeded with TAIMUR's tournaments + one
illustrative finished cup)

- NARSINGDI TOPY (Knockout): TEAMS 4 · OVERS 16 · MATCHES 2,
  Progress 0/2 with exactly 2 segments.
- DK TOPY (League): TEAMS 3 · OVERS 16 · MEETINGS 1x, Progress
  0/3 with 3 segments.
- SULTANPUR CUP (illustrative, champion HUNGRY XI): gold champion
  band under the strip.
- Screenshots: `~/workspace/audit-tourn/tourn-top.png`,
  `tourn-scroll.png`.

## Tests & gates

- NEW `src/__tests__/tournaments-matchday-card.test.ts` (7 tests):
  band + medallion, localised format pill, delete handler,
  strip labels and values, per-fixture segments, champion band,
  detail navigation.
- Unit 1621/1621 (147 files), typecheck 0, lint 0, build PASS,
  Playwright battery 38/10/4/4 — ALL GREEN.

## Alignment pass (TAIMUR feedback, 2026-11-11 00:10 +06)

TAIMUR compared the build to the chosen mockup: "font size and
কালার মিল নাই" — the build's type was smaller and its colours
off. Measured from the mockup itself (dominant-pixel sampling):
band navy **#181868** (the build had #141a38) and gold **#e8b850**
(the build had amber-400). Applied: band → #181868 on BOTH the
Tournaments and Teams bands (the siblings share the band);
medallion 44→48px; card names → 20px; format pill → #e8b850 with
navy text at 11px; strip labels 10→11px and strip numbers →
24px (text-2xl); progress segments h-1.5→h-2; champion band →
#e8b850 with a white CHAMPION label and a navy 18px name.

One forced deviation, flagged to TAIMUR: at 20px the mockup's
one-row band truncates real names at 393px ("NARSINGDI TOPY" →
"NARSINGD…"), because the generated mockup cheats the width.
The format pill therefore sits on a second line under the name,
aligned with it — full names, mockup sizes and colours kept.
Re-verified at 393px: all three names render in full.

## Type-scale unification (TAIMUR, 2026-11-11 00:26 +06)

TAIMUR: "Font size same করো যাতে দেখতে এক লাগে" — one scale
across both Matchday cards: band names 24px, champion name 24px,
strip values 24px (Teams strip values were text-body ~15px),
strip labels 11px, strength/progress segments h-2 on both
pages. Verified at 393px with real data — TAIMUR / SHAKIB /
15/15 and NARSINGDI TOPY all render in full at 24px.

## Mockup-exact pass (TAIMUR uploaded the mockup, 2026-11-11 00:32 +06)

TAIMUR sent the chosen mockup image itself ("আমি এটার কথা
বলছি") — his "same" meant same as the mockup all along.
Measured from it: strip numbers ≈ 1.5× the band name → values
36px font-black; labels 13px; pill 13px; progress caption 13px
with the hairline above the progress zone; band buttons are
SOLID white circles with navy icons (both pages; the mockup
never had translucent buttons); champion band icon is a trophy
in a ring. Teams strip values stay 24px: they hold names, and
36px truncates TAIMUR/SHAKIB in a 393px column. The one
remaining difference is the pill's second line, forced by real
width. Unit 1621/1621, lint 0.

## Compact pass (TAIMUR, 2026-11-11 10:53 +06)

On the live build TAIMUR found the cards too big and asked for
the mockup's composition: three boxes visible together on the
phone. Tournaments cards went 277px → ~198px tall (band
medallion 36px, name 20px, pill 11px, strip numbers 28px with
tight leading, leaner padding, h-1.5 segments); Teams cards
aligned to the same compact scale (139px). Measured at
393×852: the third tournament card ends at y=755, clear of the
bottom navigation — three full cards on one screen, colours
and design language unchanged.

## One-row band (TAIMUR, 2026-11-11 11:12 +06)

TAIMUR sent his live screenshot beside the reference image:
the format pill belongs on the name row, exactly as in the
reference. The two-row band is gone. With compact band elements
(px-3, 32px medallion, 10px pill, 36px delete, gap-2) the name
box measures 182px and "NARSINGDI TOPY" renders at 167px —
15px slack, no truncation (text-range measurement at 393px).
Cards are now ~166px; three cards plus the Create button fit
one screen. Teams band aligned to the same geometry.
