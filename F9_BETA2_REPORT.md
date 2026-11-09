# F9-β2 Report — Durable Player Identities (Dexie v4 + Object Writers)

Date: 2026-11-09 · Local commit: 08c1c9d · Base: 8ed967b (β0+β1)
Design: `~/workspace/Cricket-F9-Beta-Design.md` §5–§7
Approved by TAIMUR 2026-11-09 (with the β0+β1 push).

## What changed

- **Dexie schema v4** (`dexie-db.ts`): stores map unchanged
  (`players` is unindexed); the upgrade converts every saved team's
  players via `normalizeTeamPlayers` exactly once. Verified against
  a v3-shaped database (fake-indexeddb): string players gain stable
  `pl_` ids, duplicate names get DISTINCT ids, empty squads stay
  empty, and re-opening the database never re-keys.
  `SavedTeam.players` is now `TeamPlayer[]`.
- **Teams editor** (`teams/page.tsx`): the 15-slot form stays
  name-based; saving reconciles via the new
  `reconcileSlotPlayerIds(previous, slots)`:
  - an unchanged/moved name keeps its id (ids follow the person),
  - a same-slot rename keeps the id (a rename is not a new person),
  - a genuinely new player (different slot, old name gone nowhere
    else) gets a fresh id; removed players' ids retire.
  Editor open displays `.name`; the roster grid reads `.name`.
- **Match setup stays name-based until β3** (approved phasing):
  `matches/new` projects saved squads with `teamPlayerNames`;
  `opening-players` and the score page's saved-team squad lookups do
  the same. Behaviour for scorers is unchanged.
- **SyncEngine**: team upserts pass object players through (rules
  verified in β0 to accept them); remote intake now
  `normalizeTeamPlayers(remote, local.players)` — a legacy
  string-writing client can no longer orphan local identities.
- **Drive backup/restore**: backups carry the objects (whole-record
  serialisation); restore normalises, preserving backup ids;
  string-era backups gain fresh ids at restore.
- Test fixtures across 7 files updated to the object form via
  `normalizeTeamPlayers([...])`; the squad-selection workflow test
  projects to names exactly where production does.

## New tests (7)

- `reconcileSlotPlayerIds` (6): unchanged squad, slot moves, rename,
  new-player/removed-player semantics, empty slots, team creation.
- `f9-beta2-dexie-migration.test.ts` (1): real v3→v4 upgrade over
  fake-indexeddb incl. id-stability across re-open.

## Gates

- Unit: **1275/1275 PASS** (114 files; +7 new)
- Typecheck: PASS (production clean first; 24 fixture sites fixed)
- Lint: PASS · Build: PASS
- Visual: **38/38 unchanged** (teams UI renders identically from
  objects) · Offline: **10/10** · Overlay: **4/4** · Stage B: **4/4**

## Honest limits

- Downgrade hazard (design §5, accepted): an old build reading a
  v4-migrated database would render object players as
  `[object Object]`. Rollback = code-only is no longer fully safe
  for the teams screen; data itself is not lost.
- Identities exist on TEAMS only so far. Matches still record names
  (β3 threads `playerId` into innings), and analytics still keys on
  names (β4 re-keys). Nothing user-visible changes in β2.

## Next: β3 (requires approval)

Optional `playerId` on innings Player/Bowler; setup flows keep the
squad's TeamPlayer[] alongside names (object-array squads per the
approved design §3); engine stamps playerId at innings construction
and in addNewBatter/addBowler paths.
