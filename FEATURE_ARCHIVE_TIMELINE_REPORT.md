# Match Archive — Season Timeline redesign

TAIMUR's brief (2026-11-10 22:17 +06, with his phone screenshot):
take the Match Archive page professional with a full redesign. Six
mockups were shown over two rounds; TAIMUR picked **(6) Season
Timeline** (22:24 +06). Implemented the same evening in
`src/app/matches/history/page.tsx`.

## What the page was

Cards with always-visible checkboxes and an always-visible
"Select All (0)" bar, grey score chips that did not say which
innings was which, the result as plain text, the venue shouting in
ALL-CAPS emerald, a footer divider that rendered cut in half on
mobile, and no sense of time — a flat list.

## What it is now

- **Timeline rail.** Matches group by local calendar day under a
  vertical rail (continuous hairline). Each day has a node: a
  pulsing emerald ring for a day containing a live match (plus a
  LIVE pill beside the label), a slate node otherwise. Labels:
  Today / Yesterday / "Nov 8" (year added when it differs).
  Grouping preserves the repository's updatedAt-desc order.
- **Cards hang off the rail** and read like a scorecard: status
  pill (LIVE / Completed) with the match overs at the right; one
  row per innings — team left, `runs/wkts (overs ov)` right in
  tabular numbers. The old "TEAM A vs TEAM B" heading remains as
  the fallback for records with no innings data yet.
- **Winner emphasis.** The winning team's row is extrabold with a
  gold trophy. Winner resolution (`analytics/archiveTimeline.ts`
  `winnerTeamOf`): the scorecard's recorded `winner` first
  (case-insensitive match to an innings team), totals comparison
  as the legacy fallback; ties get no trophy.
- **Verdict line is the hero.** Completed: the recorded result in
  emerald. Live chase: the equation — "Thunder Storm need 86 runs
  from 33 balls" — computed from `targetScore` (the DLS-aware
  single source) and the second innings' `totalBalls`
  (`chaseEquationFor`, localised templates EN + BN, singulars
  handled). Chasing team row is bolded. Otherwise "Match In
  Progress".
- **Venue** is a quiet muted pill (pin + name) instead of
  emerald caps.
- **Select mode.** Checkboxes and the batch bar no longer exist
  by default. A Select button beside the title enters select
  mode: checkboxes appear, the Select All / Delete Selected bar
  appears, card taps toggle instead of navigating, action
  footers hide, and Done exits and clears the selection.
- **Tabs carry counts** (All 4 · Completed 3 · Ongoing / Live 1).
- **Actions.** Completed: Scorecard pill (icon + label), PDF and
  delete as ghost icon buttons across a full-width hairline
  footer. Live: full-width emerald Resume bar + delete ghost.
- **Kept deliberately:** the Live Return Banner (it is the way
  back when the live match is filtered out of the current tab),
  the ground-filter chip, the delete ConfirmationDialog, the
  loading skeletons, and the empty state.
- **Bug found by the verification screenshots and fixed:** the
  Live Return Banner's teams line inherited the light-theme
  foreground colour and was effectively invisible (near-black on
  emerald-950). It is now `text-white`. Pre-existing — the banner
  only renders while a match is live, which is why it survived.

## Files

- `src/app/matches/history/page.tsx` — rewritten render; all data
  logic, delete flows and dialogs unchanged.
- `src/domain/cricket/analytics/archiveTimeline.ts` — NEW pure
  helpers (`dayKeyOf`, `winnerTeamOf`, `chaseEquationFor`).
- `src/context/LanguageContext.tsx` — +11 `history_*` keys in EN
  and BN (today/yesterday/recent, select/done, LIVE, chase
  equation template + run/ball words). Key parity maintained.
- `src/__tests__/match-archive-timeline.test.ts` — NEW, 13 tests:
  helper units (incl. the exact mockup equation in EN and BN)
  and source pins for grouping, counts, select mode, trophy,
  banner contrast, and the preserved safety rails.

## Verification

- 393px screenshots from the real page with rig-seeded records
  mirroring TAIMUR's own archive (live chase + his two completed
  matches): default view, scrolled view, select mode with a card
  selected, and the full page in Bengali (equation renders
  naturally: "Thunder Storm-এর দরকার 86 রান, বাকি 33 বল").
  The banner-contrast bug above was caught by these shots and
  re-verified after the fix. Shots in `~/workspace/audit-archive/`.

## Gates

- Unit: 1605/1605 (145 files). Typecheck 0 · Lint 0 errors ·
  Build PASS.
- Playwright battery: visual 38/38 · offline 10/10 · overlay 4/4 ·
  stageb 4/4 — ALL GREEN.

## Polish round (same evening)

Three polish directions were mocked up: (A) Clean Top — remove the
Live Return Banner; (B) Refined Rail — numbered day nodes,
connector ticks, fading rail; (C) Richer Cards — team initials
avatars, winner tint band, Player of the Match line, CRR/REQ strip.
**TAIMUR picked (B)** (22:44 +06) and added one instruction of his
own: the PDF button moves beside Scorecard; Delete stays at the
far right.

Applied:
- Day nodes for dated groups now carry the day-of-month number in
  white inside the slate circle (live days keep the pulsing ring;
  undated groups keep the plain node). Group labels are small
  muted caps. A hairline tick connects the rail to each group's
  first card, and the rail fades out below the last node via a
  gradient. `MatchDayGroup` gains `dayNum`.
- Completed-card footer order is now Scorecard · PDF · (spacer) ·
  Delete, pinned by an order test.

Not applied: (A) — the banner stays; (C) — no avatars/MoM/CRR-REQ.

Re-verified at 393px (numbered "8" node, NOV 8 caps label, footer
order). Gates after polish: unit 1607/1607 (145 files, +2 pins),
typecheck 0, lint 0, build PASS, Playwright battery re-run
38/10/4/4 — ALL GREEN.

## Search icon (same evening, TAIMUR's direction)

TAIMUR asked for the permanent search box under the tabs to be
deleted and replaced by a lone search icon at the right of the
tabs row — then refined it: shifted a little left, keeping a
small safe-area gap from the right edge (mockup shown first, as
usual). Implemented: a 44px circular icon button with `mr-2`,
vertically centred with the tabs; the tabs container now flexes
and scrolls internally so the row fits at 393px. Tapping the icon
replaces the row with a full-width auto-focused field and an X
button sharing the same right gap: X clears the text first, then
closes; Escape closes keeping the query, and the icon then shows
an emerald dot while a query is active. The filter logic itself
is untouched. +1 i18n key (`history_search_close`, EN + BN), +1
pin test. Verified at 393px: collapsed (icon + gap, no box),
expanded with a live query filtering to the PALASH match, and
the dot state after Escape. Gates: unit 1608/1608, typecheck 0,
lint 0, build PASS, Playwright battery 38/10/4/4 — ALL GREEN.

## Light Refined header + compact pass (TAIMUR, 2026-11-11)

TAIMUR asked for the same header change on Match Archive and
for the cards to feel less airy. The header takes the Light
Refined treatment (navy medallion, gold History glyph, navy
title, gold rule; Select stays at the right). Card spacing
tightens throughout (padding 14→12, innings mt-2.5→mt-2,
verdict pt-1.5→pt-1, venue mt-2→mt-1.5 and py-1.5→py-1,
footer mt-3/pt-3→mt-2.5/pt-2.5, list space-y-3→2.5, day
groups mb-6→mb-5, day label mb-3→mb-2.5). Measured at 393px:
completed card 216→198px, live card 214→196px.

## Live Return Banner removed (TAIMUR, 2026-11-11 12:00 +06)

On the new build TAIMUR spotted the live match's progress
showing twice — the dark banner at the top and the live card
in the timeline — and asked for the top one to go. The banner
is removed with its ongoingMatch lookup and the next/link
import; the timeline card alone carries the chase equation
and Resume. This supersedes the 2026-11-10 "kept deliberately"
note (the banner was the only way back when the live match
was filtered out) — TAIMUR's explicit call. The old banner
readability pin is replaced by a removal pin. Verified at
393px in English and Bengali.

## Compact round 2 + colour touches (TAIMUR, 2026-11-11 12:05 +06)

TAIMUR asked for the timeline cards tighter still, with small
colour touches for a professional finish. Cards are now
188/186px at 393px (216/214 before the two compact rounds).
Colour, all inside the app palette: day nodes navy #181868
(live stays emerald), COMPLETED pill navy-tinted, winner's
innings row on a soft gold tint (scores kept aligned via a
shared -mx track), venue pin amber, Scorecard/PDF buttons in
the navy tint family, live cards hold a standing emerald
border. Verified in English and Bengali.
