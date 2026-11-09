# F9-β5 Report — Hardening & Programme Close-out

Date: 2026-11-09 · Local commit: 96de5f3 · Base: 63f25b8 (β4)
Design: `~/workspace/Cricket-F9-Beta-Design.md` (Appendix B close-out)
Approved by TAIMUR 2026-11-09 (with the β4 push).

β5 is verification-only: no production code changes. It pins, as
durable tests, the boundary behaviours the β programme relies on.

## Tests (6 new, f9-beta5-hardening.test.ts)

- **Drive round-trip**: a team with object players survives
  createBackupPayload → wipe → restoreToIndexedDb with ids intact.
- **Legacy backup**: a string-player backup restores as objects
  with fresh `pl_` ids and preserved names.
- **Sync intake boundary** (the exact `normalizeTeamPlayers` calls
  SyncEngine makes): remote strings against local objects preserve
  local ids (a legacy writer cannot orphan identities); remote
  objects keep their own ids (a remote rename wins by id).
- **MoM cache with playerId-bearing scorecards**: resolve → cache →
  same winner served while unchanged; a post-finalization figure
  edit changes the fingerprint and forces recomputation.

## Gates

- Unit: **1292/1292 PASS** (117 files; +6 new)
- Typecheck: PASS · Lint: PASS · Build: PASS
- Visual: **38/38 unchanged** · Offline: **10/10** · Overlay: **4/4**
  · Stage B suite: **4/4**

## Programme close-out

F9-β is complete: β0 inventory → β1 reader boundary → β2 Dexie v4
durable identities → β3 match threading → β4 consumer re-keying →
β5 hardening, each phase separately approved, gated and pushed as a
tree-verified snapshot (sync record: 15+ entries). Combined with
F9-α, finding F9 is fully addressed within this device's data;
cross-device sync verification remains F12 (needs a live Firebase
environment), alongside F10 (indexes) and F11 (npm audit) as the
only outstanding Ultimate-programme items — all external-input
blocked, none code-blocked.
