# Code Limitation Bundle — Report

Approved by TAIMUR 2026-11-09 ("আগে code limitation bundle fix করো"), ahead of
F11/F12 and the stub pages. Four limitations left over from the Ultimate audit
and the F9-β programme, fixed phase by phase with full gates per phase.
Local branch `audit/fix-phase2-10`; nothing pushed yet (push is a separate
approval).

Commits: L1 `eea8796` · L2 `1b10f56` · L3 `3822a9e` · L4 `3379578` (+ this report)

Final gates at bundle HEAD: **unit 1313/1313 (122 files), typecheck 0,
lint clean, build PASS, visual 38/38, offline 10/10, overlay 4/4, stageb 4/4.**

---

## L1 — `as any` elimination (56 → 0 in non-test src)

Every cast was replaced by the real type: library types that already existed
(google.maps surface via declaration merging, `navigator.vibrate`,
`requestIdleCallback`, puppeteer headless literals), structural facades where
the library type is genuinely dynamic (jsPDF autoTable, Supabase realtime
transport, Background Sync, the PDF server's AbortSignal.any detection), exact
union casts for segmented controls, and bounded projections for legacy record
shapes (MoM top-level fields, SyncEngine payloads — the engine gained an
exported `scorecardEvents()` reader replacing 4 casts).

**Real behaviour improvement found inside the cleanup:** `FallOfWicket` gained
`playerId?`/`bowlerId?` (innings-positional ids), now stamped by the engine at
both creation sites (run outs correctly get no bowlerId). The four readers that
previously probed these through casts (center page FOW chips,
BatsmanProfileModal, BowlerProfileModal, IntegratedScoreboard) resolve by id
now instead of always falling back to name matching. Legacy records leave the
fields undefined and readers fall back to names exactly as before.
Two source-text assertions in an existing test pinned the old cast expressions
and were updated to the typed expressions (same intent).

## L2 — Super-over Man of the Match in tied-match PDFs

The PDF generators (F9-α leftover) resolved MoM from the main scorecard alone,
so a tied match's PDF could name a different winner than the summary/center
pages. Both generators now accept the linked super-over scorecard and resolve
through one shared channel (`superOverMomOption` in `superOverMom.ts`, the
same shape the pages use):

- `generatePdfDocument` loads the linked match from local storage when the
  caller did not supply one (explicit `null` opts out); loading failures never
  block an export.
- The server-export POST body carries `superOverMatch`; the API route passes
  it to the HTML generator. The client fallback and both print paths are
  threaded the same way.

Limit: a super-over match that exists only in Supabase (spectator view, never
stored locally) still falls back to the main-match award in PDFs.
Tests: 3 (option shape; HTML MoM flips to the super-over hero; main-only
fallback without the super over).

## L3 — `bowlersFaced` / `runsVsBowler` re-keyed by stable bowler id

The per-batter matchup maps were keyed by the bowler's NAME: a renamed bowler
fragmented one person's figures across spellings, and two same-named bowlers
merged into one line. The engine now keys new entries by the bowler's stable
`playerId` (β3 threading) when one exists, falling back to the name for guests.
**No stored data is migrated** — the new readers (`bowlerMatchup.ts`) understand
both key shapes:

- `matchupBreakdown` for display rows (BatsmanProfileModal via a new optional
  `bowlerNamesById` prop threaded from the center/summary/score pages, and
  AdvancedAnalyticsPanel): id-keyed and legacy name-keyed entries for the same
  bowler merge into one row under his current name.
- `matchupKeyBelongsToBowler` for the analytics page's head-to-head totals,
  matching id keys through the β4 identity index's name variants.
- `renamePlayer` re-keys name entries only; id entries follow the person by
  design. The MoM merge is key-agnostic and needed no change.

Tests: 6 (write keying for squad/guest bowlers, rename resilience, mixed-era
breakdown merge, H2H predicate).

## L4 — Retired Hurt resumption

Under the Laws a retired-hurt batter may resume when a wicket falls. The app
blocked it (the selector marked him ineligible), and picking his name anywhere
renamed a fresh slot — splitting one innings across two records. Resumption now
reuses the ORIGINAL Player record, figures intact, through both entry flows:

- **Wicket ball (OutModal):** when `newBatsmanName` matches a retired-hurt
  player in the innings, `scoreBall` resumes that record (suffix stripped,
  dismissal cleared) and consumes no slot. The decision is deterministic from
  state + name, so event replay reproduces it exactly.
- **Post-wicket selector:** new `engine.resumeRetiredBatter(name, isStriker)`,
  valid only while the crease slot holds the fresh placeholder placed by the
  fallen wicket (`canResumeRetiredBatter`); the placeholder slot becomes the
  next unused slot again. Emits the new `BATTER_RESUMED` event (replay handler
  added; undo works via the pre-action snapshot). If the placeholder has
  already batted, resumption is refused with a clear error.
- Score page: OutModal candidates and the batter selector no longer exclude
  retired-hurt players while resumption is open; selecting one routes to
  `resumeRetiredBatter` instead of `renamePlayer`.
- Retired Out is unchanged and final: the name opens a fresh record, as before.

Tests: 6 (both flows, refusal once the placeholder has batted, retired-out
non-resumption, undo, replay of both flows).

## Carried limits (unchanged, recorded)

- PDF of a tied match whose super over exists only in Supabase may show the
  main-match MoM (L2 note above).
- Matchup entries written before L3 stay name-keyed forever; readers merge
  them with id-keyed entries by resolved name, so a same-named *different*
  bowler from the name-keyed era can still share a display row in old matches
  (the data to separate them was never recorded).
- Resumption is offered at wicket fall (both flows above); a retired-hurt
  batter cannot be swapped in for a live batter mid-over, by design.
