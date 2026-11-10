# Feature — Encounter vs Bowlers: Economy column — Report

Date: 2026-11-10 · Instruction: TAIMUR — add the economy rate to the
Encounter vs Bowlers table in the Batsman Profile.

## Change (`src/components/modals/BatsmanProfileModal.tsx`)

- Each matchup row gains `econ` = runs scored off that bowler per
  over — `(runs / balls) * 6`, 0 when no balls faced — i.e. the
  bowler's economy rate in this encounter.
- Table columns rebalance 5/2/2/3 → **4/2/2/2/2**: Bowler · Runs ·
  Balls · **Econ** · Strike Rate (header shortened from 'Economy' at TAIMUR's direction). Econ renders centred with
  two decimals (standard economy format, e.g. 16.50).
- All existing Encounter pins preserved (grid-cols-12, row heights,
  card padding).

## Tests & verification

- `batsman-profile-modal-ui.test.ts` Encounter test extended:
  Economy header + computed values pinned (vs Starc 28 off 14 →
  12.00; vs Cummins 18 off 10 → 10.80).
- Real-modal screenshot at 393px with injected matchup data
  (Sanaj: vs Naeem 11 off 4 → **16.50**, SR 275.0; vs Rakibul 6 off
  2 → **18.00**, SR 300.0) — columns aligned, headers readable.
  (The seeded fixtures carry empty matchup maps, so the screenshot
  record was seeded with consistent matchup data for Sanaj's
  17 off 6.)
- Gates ALL GREEN: unit **1556/1556**, typecheck 0, lint clean,
  build PASS, visual 38/38, offline 10/10, overlay 4/4, stageb 4/4.

## Local commits

`f8e828e` (feature + tests + this report), on top of `d355c20`.
NOT pushed — awaiting TAIMUR's push instruction.
