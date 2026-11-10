# Teams Page — Matchday Card Redesign

**Date:** 2026-11-10 · **Direction:** TAIMUR screenshot brief (23:15 +06);
four mockups shown (Club Crest / Roster Sheet / Minimal List /
Matchday), TAIMUR picked **(4) Matchday** (23:20 +06).

## What changed (`src/app/teams/page.tsx`, card + roster only)

- **Navy band** — each team card opens with a deep-navy band
  (`#141a38`, fixed-dark like the profile modals): a monogram crest
  (new `teamInitials()` — first letters of the first two words, or
  the first two letters of a single-word name; HUNGRY XI → HX,
  SULTANPUR → SU, PASASH → PA) in a white-ringed circle, the team
  name in white bold, and the Edit / Delete actions as white
  circular buttons on the band. Handlers, titles and the
  stop-propagation behaviour are unchanged.
- **Stat strip** — under the band, a 3-column hairline-divided
  strip: **Captain / Manager / Squad n/15** (labels in muted caps,
  values extrabold, centred; "Not assigned" fallbacks preserved).
  The Squad label is a new i18n key `teams_squad_label`
  (EN "Squad" / BN "স্কোয়াড"); the denominator is
  `PLAYER_SLOT_LABELS.length`, not a hard-coded 15.
- **Squad-strength bar** — one segment per slot under the strip:
  amber while the squad is incomplete, emerald when full, muted
  when empty; the expand chevron rides at the row's right end.
- **Roster (expanded)** — the slot boxes become numbered rows:
  number, position tag (muted pill, `slotLabelText`), player name
  right-aligned — still a link to the career profile, with the
  same href/stop-propagation/title as before. The AnimatePresence
  height animation shell is untouched.
- The old shield tile and the dot-joined meta line are removed
  (the now-unused `Shield` import went with them). Header,
  subtitle, success toast, empty state, skeletons, the editor
  modal and the Create Team buttons are unchanged.

Mockup slips NOT carried over: the generator had put PASASH's
captain/manager on HUNGRY XI's strip and over-filled the strength
bars; the build uses each team's real data (verified in the
393px screenshots below).

## Verification (393px, seeded with TAIMUR's three teams)

- Collapsed: HX 15/15 with a full emerald bar, PA 4/15 and SU
  3/15 with exact amber segment counts; monograms HX/PA/SU.
- Expanded HUNGRY XI: roster rows 1–15 with position tags and the
  squad's real names; chevron flips.
- Screenshots: `~/workspace/audit-teams/teams-collapsed.png`,
  `teams-expanded.png`.

## Tests & gates

- NEW `src/__tests__/teams-matchday-card.test.ts` (6 tests): band
  + crest wiring, initials derivation, edit/delete reachability,
  strip labels + fallbacks + n/15, per-slot segments with the
  amber→emerald rule, roster number/tag/profile-link pins.
- The Phase-18 alpha-token guard caught a
  `border-[var(--border)]/60` in the first roster draft (opacity-
  modified CSS-var utility) — replaced with the plain token
  before gates ran green.
- Unit 1614/1614 (146 files), typecheck 0, lint 0, build PASS,
  Playwright battery 38/10/4/4 — ALL GREEN.
