# ELEVATION — Project-Wide Rollout Report

Date: 2026-11-10 · Scope approved by TAIMUR ("Full project apply koro")
after the New Match proof (see ELEVATION_NEW_MATCH_REPORT.md). Executed
as four parallel partitioned workstreams + central integration. Classes
and tokens only — no markup restructuring, no text or logic changes.

## System recap

`--shadow-elev-1` (resting cards/inputs) · `--shadow-elev-2` (raised:
selected states + primary actions, cast in the theme's primary colour) ·
`--shadow-elev-3` (floating: modals/sheets/menus/toasts) ·
`--shadow-inset` (input inner depth, focus raises to L1). Defined for
light/dark/sunlight; Tailwind classes `shadow-elev1/2/3/inset`.

## What changed in the rollout

**Defaults flipped (opt-in → opt-out):** `CompactDropdown.elevated` and
`BowlingLimiterDrawer.elevated` now default to `true` — every consumer
project-wide gets the elevated trigger/menu without passing a prop; the
prop remains as an opt-out.

**Level 3 — one edit, many surfaces:** `UnifiedModal` + `UnifiedSheet`
panels moved `shadow-2xl → shadow-elev3`, which carries ConfirmationDialog,
GroundSelectorModal, DlsModal, OutModal, HistoricalBallEditModal,
EditProfileModal and PlayerSelectionModal with them. Plus: AppToast,
SyncIndicator modal, PdfLoadingOverlay, both profile backup sections'
restore-confirmation panels, page-owned editor/create modals on the
teams and tournaments pages, the tournament hero banner, map floating
controls and the grounds mobile summary bar.

**Level 1 / 2 / inset — pages:** home (hero action cards, stat cards,
Start Match / Resume primary casts unified onto `shadow-elev2`),
history (cards, active filter tab, search inset), players (search inset;
profile header card), analytics (sections; nested tiles deliberately
flat — no shadow nesting), score page (8 containers; view toggles +
penalty toggles + Start-2nd-Innings primary at L2; 5 inputs inset),
center (9 containers incl. all 3 chart cards), summary (8 cards; the two
primary CTAs at L2), teams (cards, editor inputs inset, Save/Create L2),
tournaments list + detail (cards, forms inset, selected toggles L2;
standings/leaderboard containers L1 with rows flat), grounds (all
`shadow-floating` cards normalised to L1; selected-ground card L2 like
the New Match filled state), profile (6 section cards, sign-in/save L2,
inputs inset), offline panel.

**Sunlight fix (the proof's open caveat, now closed):** five narrow rules
in globals.css give elements explicitly carrying an elevation class their
token shadow in the sunlight theme too (`!important`, scoped), including
the floating-card hover lift. Sunlight's 1.5px borders and every other
contrast rule are untouched; non-elevated buttons/cards still flatten in
sunlight by design.

**Service worker:** CACHE_VERSION v2.2.5 → **v2.2.6** (sw.js +
ServiceWorkerManager fallbacks) so installed clients pick the restyle up
through the normal update flow.

## Deliberately untouched

Dense data stays flat by principle: scorecard tables, ball-by-ball and
modifier grids, standings/table rows, list rows. Bespoke designed
surfaces keep their own shadows: the score-page hero banners and the
home hero/resume banners, the summary MoM card (`shadow-floating`), the
purple Confirm Penalty cast (an emerald L2 cast would clash), and the
Batsman/Bowler profile modals (a token-adoption-exempt fixed-dark design
— changing them is a design decision, not a class swap).

## Test pins updated (with explanatory comments)

- `view-full-score-alignment.test.ts` — summary comparison card class
  string gains `shadow-elev1`.
- `duplicate-creation-actions-ui-fix.test.ts` — two exact-className pins
  (teams/tournaments create buttons) gain `shadow-elev2`.
- `feature-elevation.test.ts` — 22 → 25 tests: now also pins the flipped
  `elevated = true` defaults, overlay `shadow-elev3`, and the sunlight
  exemption rules.

## Gates (integrated tree)

**Unit 1521/1521** (138 files) · typecheck 0 · lint clean · build PASS ·
Playwright visual **38/38** (no baseline re-records needed — the shadow
deltas sit inside the suite's pixel tolerance on every covered route) ·
offline 10/10 · overlay 4/4 · stageb 4/4.
