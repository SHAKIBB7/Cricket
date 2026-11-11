# League Rules — Audit Fixes (2026-11-11)

Full audit: ~/workspace/Cricket-League-Rules-Audit.md
(16 findings: 4 High, 8 Medium, 4 Low). This report covers
what was fixed, what was verified already-correct, and the
decisions left to the owner.

## Fixed (with regression tests — tournament-rules-fix.test.ts, 15 tests)

- **Split-brain points table (audit verdict).** Points came
  from fixtures while NRR came from raw matches, so a scored
  match moved NRR but not Played/Wins/Points. A tournament
  match not represented by any fixture now counts in full —
  points and NRR — and a fixture's recorded match is the
  only attempt that counts for that fixture.
- **H2 — NRR scoping.** Playoff-stage matches no longer move
  league NRR, and super-over records (which inherit the
  tournament link) are excluded from the table entirely.
- **H3 — clearResult residue.** Clearing a result now also
  clears the fixture's matchId; cleared/replaced match
  attempts no longer feed NRR (points were already removed).
- **H4 — No Result is recordable.** New
  TournamentEngine.recordNoResult: 1 point each, counts as
  played, counts toward league completion (playoffs can now
  be reached with a rained-off match). Abandoned matches
  auto-sync to it from the summary page, and every fixture
  card gains a dashed "No Result" hold row (3s set / 5s
  clear) with a No Result status in place of Score Match.
- **M1 — schedule staleness.** Changing or clearing a semi
  winner replaces the schedule Final's pairing and clears
  its link/result; a fixture whose linked match was deleted
  returns to unplayed; a reopened or corrected match clears
  the fixture's stale winner.
- **M2 — schedule round-robin honours leagueMeetings.**
  A 2-meeting league now generates both legs in the
  Schedule tab (venues swapped, rounds continuing).
- **M3 — playoff preservation.** Correcting a league result
  no longer wipes played playoff fixtures when the ordered
  top four is unchanged (a crowned champion survives a
  5th/6th-place correction). If the seeding moved, the
  postseason regenerates as before.
- **M4 — tied knockout fixtures explain themselves.** A tie
  on a knockout/playoff fixture now shows a note that it
  blocks the bracket and how to clear it (EN + BN).
- **M8 — cap tables.** Super-over runs/wickets no longer
  count in the Orange/Purple Cap leaderboards.
- **L2 — real rounds.** Engine league fixtures are built by
  the circle method and carry real round numbers (the
  Fixtures tab no longer calls every match "Round 1").
  Pairing set unchanged; two older tests that pinned the
  previous generator's incidental ordering/orientation now
  look fixtures up by pairing.

## Points table (standings tab) — presentation

Rebuilt as an aligned grid (was a 420px-wide table in a
393px screen: sideways scroll, centred headers over
left-aligned numbers). Columns # / Team / P / W / T / L /
NRR / Pts now share one grid between header and rows,
every value sits in the vertical middle (glyph-measured,
≤0.84px), and league tables show the playoff cut-line
under 4th place.

## Verified correct by the audit (no change)

Circle-method pairings, engine pairings × meetings, 2/1
points, ICC all-out NRR quota, ties counting in NRR,
abandoned matches excluded from NRR, knockout clearResult
retraction, engine-internal prune/regenerate consistency.

## Left as owner decisions (not changed)

- **H1/M5 — one postseason model.** A league currently has
  two: engine IPL playoffs (owns the champion) and the
  Schedule tab's SF bracket (shows its own "Champion").
  Recommendation: keep the engine playoffs for leagues and
  retire the schedule bracket there; knockout tournaments
  keep the schedule bracket.
- **L1 — engine knockout seeding** is sequential (1v2, 3v4)
  where the schedule bracket seeds properly (1v4, 2v3).
- **L3 — tie-break order** is points → NRR → wins (IPL
  style); ICC World Cup uses points → wins → NRR.
- **M7 — manual results outrank played matches.** If a
  fixture was hold-set (even wrongly), a later played match
  cannot correct it; deliberate, flagged for awareness.

## Gates

Unit 1644/1644 (149 files), typecheck 0, lint 0, build
PASS. Verified at 393px: standings before (Played 0 with
NRR +2.900) and after (Played 2, Wins 2, Pts 4, NRR
+2.900); fixtures tab with the No Result row; the
hold set/clear cycle still passes end to end.

## H1 — decided and implemented (TAIMUR, 2026-11-11)

League postseason is the IPL Playoffs only. For league
tournaments the Schedule tab no longer offers the knockout
bracket generator and no longer renders a schedule
bracket (existing schedule data is left untouched, simply
not shown); a pointer line sends the user to the IPL
Playoffs tab. Knockout tournaments keep the schedule
bracket exactly as before. Verified in the real build for
both formats.
