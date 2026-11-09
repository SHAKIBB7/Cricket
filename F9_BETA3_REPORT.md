# F9-β3 Report — Threading Identities into Matches

Date: 2026-11-09 · Local commit: b0938bd · Base: 28a3f15 (β2)
Design: `~/workspace/Cricket-F9-Beta-Design.md` §6
Approved by TAIMUR 2026-11-09 (with the β2 push).

## What changed

- **Types** (`domain/cricket/types.ts`): `Player.playerId?` and
  `Bowler.playerId?` (optional; the positional per-innings `id` is
  NOT repurposed). `AdvancedSettings.teamASquad/teamBSquad` and
  `MatchScorecard.teamASquad/teamBSquad` are now `TeamPlayer[]`.
- **Engine** (`EventSourcedMatchEngine`):
  - The constructor normalises both squads via the new
    `normalizeSquadPlayers` — legacy string squads become objects
    with EMPTY ids (identities are never invented for stored
    matches), so constructor/chase/fromScorecard paths all see
    objects.
  - New `squadPlayerId(team, name)` resolver (cleaned-name match
    within the team's match squad; empty id → undefined).
  - Stamping sites: innings creation (both openers + opening
    bowler, both innings), the wicket path's incoming batter, and
    `changeBowler` (new bowlers stamped; existing records backfilled
    when missing). In-match renames keep the record's playerId by
    construction.
- **Setup flow**: `matches/new` passes the saved squads as objects
  into setup data; `opening-players` resolves squads at engine
  construction — object entries keep their ids, legacy name lists
  re-attach the saved team's ids by name, unmatched names stay
  id-less. Its own UI state remains name-based.
- **Score UI**: score-page squad memos and IntegratedScoreboard's
  did-not-bat calculation project squads to names with
  `teamPlayerNames` (display behaviour unchanged).

## Tests (7 new, f9-beta3-threading.test.ts)

Opener/bowler stamping; incoming batter stamped vs guest unstamped;
bowler-change stamping; second-innings stamping from the other
squad; scorecard round-trip preserving squad objects + playerIds;
legacy string squads (no invented ids, match still scores);
`normalizeSquadPlayers` semantics. Fixtures in 2 existing suites
updated to object squads.

## Gates

- Unit: **1282/1282 PASS** (115 files; +7 new)
- Typecheck: PASS · Lint: PASS · Build: PASS
- Visual: **38/38 unchanged** · Offline: **10/10** · Overlay: **4/4**
  · Stage B suite: **4/4**

## Honest limits

- Stamping is by cleaned-NAME match within the match squad: a
  scorer who renames a player mid-match in the profile modal keeps
  the record's playerId (good), but a player whose name was typed
  differently at setup vs the saved team gets no stamp.
- Super-over matches are separate engines built from the main
  match's settings; their squads flow through the same constructor
  normalisation.
- Nothing consumes playerId yet — β4 re-keys MoM and career
  analytics (playerId-first with name fallback).

## Next: β4 (requires approval)

MoM candidate keying (team, playerId ?? cleaned name); analytics
page grouping by playerId with a name-keyed legacy bucket; profile
modals resolving by playerId first.
