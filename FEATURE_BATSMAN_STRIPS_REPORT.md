# Feature — Batsman Profile: stats-strip alignment + Dot Ball strip — Report

Date: 2026-11-10 · Instruction: TAIMUR (with a screenshot of RIYAD's
profile) — fix the horizontal alignment of the sections below Batting
Intent, and redesign the Dot Ball & Shot Control box (images first).
TAIMUR picked mockup **(1) Four-across strip** of three.

## 1) Stats strip alignment fix

Defect: in the 5-cell primary strip, the 4s/6s label and value floated
above the Runs/Balls/Strike Rate line. Cause: every cell centres its
own content (`justify-center`), but the 4s/6s cells carry a third row
(the "N runs" subtext) while the other three cells have two rows — so
their label/value rows centred higher.

Fix: **shared 3-row skeleton** — the Runs, Balls Faced and Strike
Rate cells gain an invisible, aria-hidden placeholder subtext span
(exactly the 4s/6s subtext's classes), reserving the third row in
every cell. All five labels now share one line, all five values share
one line, and the two real subtexts share the third line. Verified in
the real-modal screenshot at 430px.

## 2) Dot Ball & Shot Control → four-across strip

The 2×2-mobile / 4-across-desktop hairline card became ONE strip at
every width: `grid-cols-[0.95fr_1.15fr_1.05fr_1.25fr]` — weighted
fractions give the longest labels (Max Dot Streak, Scoring Balls)
and the longest subtext ("consecutive balls") room to stay on one
line at phone width, without micro-typography. Cells keep the
hairline construction (gap-px, slate-900/60, px-1); values rise to
text-xl/2xl for parity with the primary strip. All four metrics and
subtexts preserved verbatim. Bonus: the whole profile (header,
intent, both strips, run production) now fits above the fold in the
verification screenshot.

Test pins updated as documented expectations in
`batsman-profile-modal-ui.test.ts` and
`dls-activation-and-scoreboard-navigation-bugfix.test.tsx`
(the superseded `grid-cols-2` / `sm:grid-cols-4` pins).

## 3) Vertical rhythm follow-up (TAIMUR, same day)

TAIMUR found the two strips' vertical spacing cramped ("গেদাগেদি")
and asked for the gaps to follow the international standard. The
column was put on the **8-point grid** (the Material Design / Apple
HIG spacing standard — every gap a multiple of 4, key steps of 8):

- Scroll column gap: 10/12px → **12/16px** (`space-y-3 sm:space-y-4`)
- Strip cell vertical padding: 10px → **16px** (`py-4`), both strips
- Label ↔ value margin: 2px → **4px** (`my-1`)
- Section cards (Run Production, Dot Ball): padding 12/14px →
  **16px** (`p-4`), title→content gap 8px → **12px** (`space-y-3`)

Regression caught by the verification screenshot: the wider card
padding narrowed the strip enough that SHOT CONTROL wrapped to two
lines. Fix: column fractions rebalanced to
`[0.95fr_1.12fr_1.12fr_1.21fr]` and the dot-strip labels' tracking
eased (wider → wide) — all four labels are back on one line with the
values aligned, verified in the real-modal screenshot at 430px.

## 4) Equal-columns + slim follow-up (TAIMUR, same day)

TAIMUR reported the dot-ball strip's horizontal alignment still
looked off (the weighted fractions made the column rhythm uneven)
and the box too tall. He picked mockup **(1) Equal columns + slim**
of three. Implementation:

- Grid → `grid-cols-4` (four equal columns, even rhythm).
- Slimmer: section card `p-4 → p-3`, title gap `12 → 8px`, cells
  `py-4 → py-3`.
- **Measured constraint**: TAIMUR's phone is 393 CSS px wide. In a
  padded equal quarter, a cell offers ~77px, but "MAX DOT STREAK"
  measures ~84px and the widest subtext ~96px at caption size —
  both wrapped (verified at 390px). Fix without micro-typography:
  the strip now runs **flush to the section card's edges** (`-mx-3`,
  border-y only), cells `px-0.5`, which buys back the needed width.
- One copy change, flagged to TAIMUR: the subtext "consecutive
  balls" (17ch, ~96px) cannot fit an equal quarter at 393px in
  readable type under any padding scheme, so it reads **"balls in
  a row"** (14ch) — same meaning. Fallback if he objects: reserve a
  two-line subtext slot (taller box).
- Verified at **393px** (his width) and 430px: every label, value
  and subtext on one shared line, box visibly slimmer.

## Verification

- Real-modal screenshots at 430×932 (seeded live match, striker
  Sanaj): strip baselines shared; dot-ball strip one line per label,
  values aligned.
- Gates ALL GREEN: unit **1556/1556**, typecheck 0, lint clean,
  build PASS, visual 38/38, offline 10/10, overlay 4/4, stageb 4/4.

## Local commits

`3fb16a6` (alignment + strip), `28116ab` (§3 rhythm) and `b9a2f2a`
(§4 equal + slim) — the first two are LIVE in snapshot `6a297b99`;
`b9a2f2a` is NOT pushed, awaiting TAIMUR's push instruction.
