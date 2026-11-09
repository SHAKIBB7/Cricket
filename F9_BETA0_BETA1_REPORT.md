# F9-β0 + β1 Report — Inventory & Reader Foundation

Date: 2026-11-09 · Local commit: 107a297 · Base: 4c0376e (F9-α)
Design: `~/workspace/Cricket-F9-Beta-Design.md` (incl. β0 appendix)
Approved by TAIMUR 2026-11-09 with all recommended options.

## β0 — Inventory (no code change)

Full checklist appended to the design doc (Appendix A). Headlines:

- Squad consumers are bounded: 6 files touch
  `teamASquad/teamBSquad`; 8 touch points for `SavedTeam.players`.
- **Firestore rules do NOT constrain `players` element types**
  (`isValidTeam`: list, ≤50) → object-form players pass current
  rules; no rules change needed for β2.
- Tournaments hold team NAMES only (fixtures carry no squads) — out
  of β's critical path.

## β1 — Reader foundation

- New `src/domain/teams/playerIdentity.ts`:
  - `TeamPlayer { id, name }`, ids are `'pl_' + random`, immutable.
  - `normalizeTeamPlayers(input, existing?)` — accepts strings,
    objects, mixed, garbage; **preserves ids by name match**
    (case-insensitive, duplicates consumed one-to-one in order), so a
    legacy string-writer can never orphan a team's identities.
  - `teamPlayerNames(input)` — projects any accepted form to plain
    names.
- Parse-boundary sanitisers wired (string-era storage unchanged):
  - SyncEngine remote team intake (Supabase rows → Dexie):
    `players: teamPlayerNames(rt.players)`.
  - GoogleDriveService `restoreToIndexedDb`: restored teams get
    `t.players = teamPlayerNames(t.players)`.
  Both are exact no-ops for well-formed string data; they guarantee
  object-form input (post-β2 backups/payloads) can never leak
  `[object Object]` into string-era storage or UI.
- Honest scope note: β1 persists nothing new — id durability arrives
  with β2 (Dexie v4 upgrade + object writers), per the approved
  two-step rollout. β1 pins the semantics so β2 is wiring.

Tests: `src/__tests__/player-identity.test.ts` (9) — both forms,
id preservation, duplicate consumption order, explicit-id precedence,
garbage handling, projection, id uniqueness (500 draws).

Also in this commit: a type-only fix to the F9-α test's
`currentPartnership` cast (`as unknown as …`), caught by typecheck;
no behaviour change.

## Gates

- Unit: **1268/1268 PASS** (113 files; +9 new)
- Typecheck: PASS · Lint: PASS · Build: PASS
- Visual: **38/38 unchanged** · Offline: **10/10** · Overlay: **4/4**
  · Stage B suite: **4/4**

## Next: β2 (requires its own approval — the one-way door)

Dexie v4 upgrade assigning durable ids to every saved team's
players + teams UI and creation flows switching to object writers.
Design §5/§7. Nothing in β0/β1 changes stored data.
