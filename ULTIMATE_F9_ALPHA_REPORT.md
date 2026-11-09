# F9-α Report — Super-Over MoM & Player Identity (First Slice)

Date: 2026-11-09 · Local commit: dd72e2b · Base: 3e6e3f9 (Stage C)
Audit: `~/workspace/Cricket-F9-Audit.md` (workspace copy)

## Why α, not the brief's original plan

The Stage C brief assumed squads carry stable player IDs that the
aggregates ignore. The audit found **no stable player identity exists
anywhere persisted**: `SavedTeam.players` and scorecard squads are
`string[]`; innings ids are positional per innings (`p_1_3`, `b_2_1`).
The full fix (option β — stable IDs through teams, Dexie migration,
sync, setup, analytics) is a multi-phase data-model programme and is
presented to TAIMUR as a separate decision. This α slice fixes
everything fixable WITHOUT a data migration.

## Defects found & fixed

### 1. Super-over innings were silently dropped by MoM (even when passed)

`evaluateMatch`'s `addInnings` dedupes by (inningsNumber, team). A real
super over is a separate match whose innings are numbered 1 and 2 — the
same keys as the main innings — so both SO innings were discarded. The
only pre-existing test used a fictional inningsNumber 3, masking this.

Fix: super-over innings are force-added.

### 2. Foreign positional IDs misattributed super-over stats

The SO match's `p_1_1` is whoever opened THAT match, not the main
match's `p_1_1`. By-id candidate merging credited one player's SO runs
to a different player (reproduced: SO 20 runs landed on the wrong
batter, 45 total; the real scorer showed 6). The same-innings
duplicate guard would also split name-merges across the two matches.

Fix: SO innings are normalised on COPIES before aggregation —
renumbered 3/4, positional ids dropped — so they merge by (team,
name), the only identity the two matches share. Callers' data is
never mutated.

### 3. resolveForMatch had no super-over channel

Every production caller uses `resolveForMatch(match)`; the scorecard
stores only `superOverMatchId` + result text.

Fix: new optional `superOver` option on `resolveForMatch`, forwarded
to `calculateForMatch`. Cache semantics: SO callers always recompute;
the stored `matchHash` gains a `|so:<fingerprint>` suffix, and the
consistency check accepts an SO-inclusive cache for plain callers
when the main-match part still matches — so surfaces keep serving the
SO-inclusive award instead of flip-flopping, and any main-match edit
still invalidates it.

Wiring: summary page and center page load the linked super-over match
(center also via its Supabase spectator fallback) and pass its
innings. The summary page's narrative (a plain caller) consequently
serves the SO-inclusive award from cache too.

Known limits: PDF generators are synchronous and receive only the
main scorecard, so a PDF generated before any summary/center view may
show the main-match-only MoM for tied matches; SO fielding records
(catches/run-outs from SO events) are not merged (batting/bowling
are). Both are β/follow-up territory.

## Tests

`src/__tests__/f9-super-over-mom.test.ts` (5):
- real-numbered (1/2) SO innings aggregate: hero 5+20 runs, 2+2 wkts
- SO performance flips the award (without SO: 'A Four'; with: 'SO Hero')
- resolveForMatch channel + `|so:` hash + plain-caller cache acceptance
- main-match edit invalidates an SO-inclusive cache
- duplicate names on opposing teams stay separate (two Rahims;
  Team B's Rahim merges only his own 10 runs + 1 wicket)

## Gates

- Unit: **1259/1259 PASS** (112 files; +5 new)
- Typecheck: PASS · Lint: PASS · Build: PASS
- Visual: **38/38 unchanged** · Offline: **10/10** · Overlay: **4/4**
  · Stage B suite: **4/4**

## Option β (decision pending with TAIMUR)

Stable player IDs: `SavedTeam.players` → `{id, name}[]` + Dexie
migration, teams/tournaments UI, setup threading into the engine,
sync + Drive backup formats, analytics re-keying. Fixes same-team
duplicate names and cross-match career identity. Multi-phase;
starts with a design doc.
