# F9-β4 Report — Consumer Re-keying (playerId-first)

Date: 2026-11-09 · Local commit: 149e1e3 · Base: 80275d5 (β3)
Design: `~/workspace/Cricket-F9-Beta-Design.md` §8
Approved by TAIMUR 2026-11-09 (with the β3 push).

## Man of the Match (ManOfTheMatchEngine)

- `CandidateEntry` gains `stableId`. `findCandidate` now resolves
  in order: (team, stableId) → (team, positional id, as before) →
  (team, name) with a new guard — **a name match never merges two
  different stable identities**.
- Batting/bowling merges adopt a stableId when a later record
  provides one; `mergePlayerBatting/Bowling` preserve `playerId`.
- The public result now reports `playerId: stableId || positional`
  — consumers see the real saved-team identity when known.
- Consequences, both test-pinned: two same-named teammates are two
  candidates with their own figures; a player renamed between
  innings (bats as "Rahim", bowls as "Rahim Uddin", same id) is ONE
  candidate with merged batting+bowling. Super-over behaviour from
  F9-α is unchanged (its id-less normalised innings merge by name;
  records carrying playerIds now merge by id).

## Career analytics (analytics page)

- New `domain/cricket/analytics/playerIdentityIndex.ts`: builds,
  from the stored scorecards themselves, every name variant each
  stable playerId has used. The page's batter aggregation and the
  H2H batter lookup now match via `playerRecordMatchesSelection`:
  exact name (legacy behaviour) OR the record's id has been seen
  under the selected name — so selecting either the old or the new
  name of a renamed player returns their full history.
- Verified NOT re-keyed, deliberately:
  - The pickers stay name-based (the page's UI model); when two
    distinct people share one name, a name pick cannot separate
    them here — MoM (the competitive surface) now can.
  - `Player.bowlersFaced`/`runsVsBowler` are name-keyed maps inside
    stored records; re-keying them is a data migration, out of β4's
    no-migration scope. The H2H bowler side stays name-matched.

## Profile modals — verified, no change needed

`BatsmanProfileModal`/`BowlerProfileModal` receive a single
Player/Bowler record object and render that record within the
current match. There is no name-keyed aggregation to re-key; the
record already carries its playerId from β3.

## Tests (4 new, f9-beta4-rekeying.test.ts)

MoM same-name separation (both candidates, own figures, real ids in
the result); MoM rename merge (one candidate, 42 runs + 3 wickets,
id reported); identity-index variant unification in both
directions; per-id variant isolation + id-less name-only behaviour.
The α super-over suite passes unchanged.

## Gates

- Unit: **1286/1286 PASS** (116 files; +4 new)
- Typecheck: PASS · Lint: PASS · Build: PASS
- Visual: **38/38 unchanged** · Offline: **10/10** · Overlay: **4/4**
  · Stage B suite: **4/4**

## Next: β5 (requires approval) — hardening

Sync + Drive round-trip verification for object players (unit-level
with the existing harnesses; live cross-device sync remains F12,
environment-blocked), scorecard-hash stability check for the MoM
cache with playerId-bearing records, and the β programme close-out
notes in the design doc.
