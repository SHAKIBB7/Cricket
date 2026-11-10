# Feature — Bowler Profile redesign (Master B) — Report

Date: 2026-11-10 · Instruction: TAIMUR — redesign the Bowler Profile
to the batsman profile's design language. After a first mockup round
dropped information, a full code audit inventoried every element;
TAIMUR picked **Master B** (compact overs in one card) from two
information-complete mockups.

## Information audit (what the first mockups missed, all preserved)

- Per-over wicket rows under each over's balls.
- The "Wickets Taken in Match" section (hidden at 0 wickets).
- MAIDEN chip semantics (0-run over), runs chips otherwise.
- Econ tier colour on the meta line (≤6 emerald / ≤9 amber / >9 red).
- Ball token variety: W red, Wd/Nb amber, B/LB blue.
- Current-bowler-only elements: name edit, status, live over.

## Changes (`src/components/modals/BowlerProfileModal.tsx`)

- **Clean app bar**: circular back button + title; drag handle,
  Done and the header X removed; footer "Close Profile" bar removed
  (scroll container gains `pb-safe`). Mirrors the batsman profile.
- **Header slimmed**: avatar 52px → 44px with a blue pulsing dot
  badge (wrapper outside the tile) while currently bowling; the
  CURRENT BOWLER pill left the name row and became the meta line's
  final segment (blue, bold).
- **One deviation from the mockup, flagged to TAIMUR**: the meta
  prefix "Bowling Spell" was dropped. With the status segment added,
  the four-part meta physically overflows one line at 393px (each
  segment wrapped mid-word in verification). Overs + Econ + status
  carry the same information; the batsman meta likewise has no such
  prefix. Fallback if wanted: a designed two-line meta.
- **Figures strip**: divide-x box → hairline strip
  (Overs · Maidens · Runs · Wickets), cells `py-3`.
- **Pressure & Discipline**: the two icon boxes → ONE four-across
  hairline strip: Dot Balls · Dot % · Wides · No Balls (the extras
  total is the sum of its split, shown in full). Region keeps its
  `aria-label`.
- **Over-by-Over**: separate cards → ONE card with
  divider-separated rows (`divide-y`); the ongoing over keeps its
  blue tinted box inside the card; per-over wicket rows and the
  Wickets Taken section are unchanged.
- Scroll column rhythm aligned to the batsman modal
  (`space-y-3 sm:space-y-4`).

## Tests

Superseded pins updated as documented expectations (Master B,
TAIMUR 2026-11-10): bowler-profile-modal-ui (hairline strips,
four-across pressure strip, close-model absence pins),
dls-activation suite (Done ×2, grid-cols-2), full-scoreboard
navigation (Close Profile), wicket-scrolling suite (close model).
Archived-portal and name-editing suites pass unchanged.

Verified by real-modal screenshots at 393px (seeded live match,
current bowler Naeem): header one line, dot badge, both strips,
tinted live-over box, Wickets Taken section, no footer.

## Gates

Unit **1556/1556**, typecheck 0, lint clean, build PASS,
visual 38/38, offline 10/10, overlay 4/4, stageb 4/4.

## Follow-up §2 — equation rows + Econ header (TAIMUR, 2026-11-10)

After Master B went live, TAIMUR directed two refinements to the
Over-by-Over section (and polish latitude for its flatness):

- **Each over is now one equation line**: over label chip, a small
  vertical divider, the ball circles, "=", then the over's total —
  `Over 1 | 0 4 1 4 W 1 = 10 runs`; a 0-run over reads
  `= MAIDEN` (emerald). The old header-line + right-side chip layout
  is gone. The ongoing over keeps its label chip + LIVE chip and
  blue tint box.
- **"Spell sequence"** (section header, right) is replaced by the
  spell's economy rate: muted "ECON" label + the rate in its tier
  colour — mirroring the meta line's Econ treatment.
- Ball circles in this section are 24px with tighter gaps so the
  full equation fits one line at 393px (verified by screenshot;
  the first pass wrapped the total to a second line).
- Per-over wicket rows and everything else unchanged.

Gates re-run ALL GREEN (unit 1556/1556, typecheck 0, lint clean,
build PASS, visual 38/38, offline 10/10, overlay 4/4, stageb 4/4).

## Local commits

`eb90448` (feature + tests + this report), on top of `4bfd57b`.
§2 follow-up + this report update, on top of `b322029`.
§2 NOT pushed — awaiting TAIMUR's push instruction.
