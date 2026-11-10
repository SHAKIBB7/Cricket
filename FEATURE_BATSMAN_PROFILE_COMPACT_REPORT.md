# Feature Report — Batsman Profile Compact Redesign

**Date:** 2026-11-10 · **Requested by:** TAIMUR (screenshot brief:
redesign the identity header, compact every box below it, and leave
the Batting Intent box exactly as it is) · **Design:** mockup variant 1
"Unified Strip", picked by TAIMUR from three generated mockups, with
his one amendment — Run Production's Boundaries and Running on ONE
line (Boundaries left, Running right) · **Status:** DONE LOCALLY, all
gates green, verified by a screenshot of the real modal on a seeded
live match — push pending approval.

## Changes (`BatsmanProfileModal.tsx` only)

- **Header slimmed:** padding `p-5` → `px-4 py-3`; avatar 52px → 44px
  (image 40 → 32px); the chunky rounded-square close button became a
  small ghost circle (36px). Name edit flow, position chip,
  STRIKER / NON-STRIKER chips and the hand • status meta line are
  unchanged.
- **Batting Intent banner: untouched** (per the brief).
- **Primary stats:** the five separate cards (mobile 2 + 3 rows)
  became **one hairline-divided strip card**, five columns
  (`0.9fr 1.1fr 1.3fr 0.75fr 0.75fr` — Strike Rate gets the widest
  track so its full label fits). Filler subtexts that duplicated a
  neighbouring cell (`(N balls)`, `deliveries`, `runs/100b`) were
  dropped; the 4s/6s run values stay — they appear nowhere else.
- **Run Production:** the stacked two-row legend became **one flex
  line** — Boundaries segment left, Running segment right, same
  tinted pills, values unchanged. The stacked bar above is untouched.
- **Dot Ball & Shot Control:** the four separately bordered mini
  cards became **one hairline card** (2×2 mobile, 4-across desktop),
  all four metrics and subtexts preserved.
- Scroll-area padding and section spacing tightened one step.
  Encounter vs Bowlers and Deliveries Faced were already compact and
  are unchanged.

## Verification

- Screenshot of the real modal (seeded live match, striker Sanaj,
  430×932): header slim, intent banner identical, strip labels all on
  one line, Boundaries/Running on one line, dot card 2×2 — the whole
  top of the profile now fits in ~60% of the screen where it
  previously ran past the fold.
- Documented expectation updates (old layout pins superseded by the
  approved redesign): `batsman-profile-modal-ui.test.ts` (strip pins,
  filler-subtext removals, +1 new structure test) and
  `dls-activation-and-scoreboard-navigation-bugfix.test.tsx`
  (`sm:grid-cols-5` → strip template).
- **Gates ALL GREEN**: unit **1542/1542**, typecheck 0, lint clean,
  build PASS, visual 38/38, offline 10/10, overlay 4/4, stageb 4/4.

## Files

`src/components/modals/BatsmanProfileModal.tsx`,
`src/__tests__/batsman-profile-modal-ui.test.ts`,
`src/__tests__/dls-activation-and-scoreboard-navigation-bugfix.test.tsx`.
