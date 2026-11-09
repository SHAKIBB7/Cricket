# PWA Programme P6 — Local File Backup: UI + Import Hardening + D6 (2026-11-09)

Implements Phase 2 design Cluster 5 and decision D6 from
`~/workspace/Cricket-PWA-Phase2-Design.md`. The Phase 1 audit's
most concrete data-safety finding was that
`exportDatabase()`/`importDatabase()` were fully implemented
and tested at the service level yet wired to NO UI — the only
backup a user could actually reach was Google Drive. This
phase gives the file flow a screen, hardens the import before
exposing it, and protects every replace restore with a
pre-restore snapshot.

## The screen

`src/components/profile/LocalFileBackupSection.tsx`, mounted
on the profile page directly under the Google Drive section
with the same props idiom (`onRestoreComplete` →
`loadLocalStats`, `onNotify` → the page feedback message):
"Download backup" streams the full database out as
`cricket-scorer-backup-<timestamp>.json`; "Restore from file…"
opens a hidden file input, validates the pick with
`peekBackupEnvelope`, and opens a restore dialog mirroring the
Drive section's — filename, export time, per-collection record
counts, and the merge/replace radio cards — before anything is
written. Results are reported with the merge breakdown
(added/updated/kept).

One production bug was caught by the new tests before it
shipped: the reader used `file.text()`, which older Safari
lacks (and this repo's jsdom lacks, which is how it surfaced);
the reader now falls back to `FileReader`.

## Import hardening (`StorageManagerService`)

- **Envelope validation**, shared by peek and import via a
  single `parseBackup`: the file must carry
  `app: 'Cric Scorer Pro'` and a supported `version`
  (`2.5.0`), on top of the pre-existing record-shape check
  (whose error message is preserved — the 2025-era backup
  suite passes unchanged).
- **Merge is now updatedAt-aware** (previously `bulkPut`
  overwrote silently): per record — new id → added; incoming
  newer (`updatedAt`, `createdAt` fallback) → updated; local
  newer-or-equal → skipped and KEPT. Restoring an old backup
  can no longer clobber newer local work. The result gains a
  `detail {added, updated, skipped}` breakdown.
- **Events follow matches**: in merge mode, ball-by-ball
  events are written only for matches the merge actually
  wrote, so a skipped (newer) local match never receives
  stale events. In replace mode everything is written.
- **Team normalisation on intake**, exactly like the Drive and
  SyncEngine intakes: `normalizeTeamPlayers(players,
  localPlayers)` — existing local players are passed as
  previous, so stable `pl_` ids survive a re-import (pinned by
  test).
- **Replace mode** clears the five data tables inside the
  same transaction before repopulating. `appMetadata` is
  deliberately not restored in either mode — it holds
  device-local state (last active match, install dismissal).

## D6 — replace restores protect themselves

`StorageManagerService.downloadBackupSnapshot(prefix)` is the
single download path (the section's export button and both
pre-restore snapshots use it). Before ANY replace restore —
the new file flow AND the existing Google Drive flow
(`GoogleDriveBackupSection.handleConfirmRestore`) — the app
downloads `pre-restore-snapshot-<timestamp>.json` of the
current database; if the snapshot cannot be created, the
restore is aborted with an explanation and no data changes.
The success message for a replace restore states that the
snapshot was taken.

## Tests

`src/__tests__/pwa-file-backup.test.tsx` (8 tests): envelope
rejection (foreign app, unsupported version) in peek and
import; peek counts without writing; merge never overwriting
a newer local record with exact added/updated/skipped counts;
events following only written matches; team id stability
across re-import; replace clearing local-only records; the
full section flow (valid file → dialog with counts → merge
confirm → record in Dexie + success notify + stats refresh;
invalid file → the real peek error, no dialog). The existing
`historical-ball-edit-and-backup` suite (7 tests) passes
unchanged against the hardened import.

## Gates (at P6 HEAD)

- Unit: **1345/1345** (127 files; 1337 + 8 new)
- Typecheck: 0 errors · Lint: clean · Build: PASS
- Playwright: visual **38/38**, offline **10/10**, overlay
  **4/4**, stageb **4/4**

## Files

- `src/infrastructure/storage/StorageManagerService.ts` —
  parseBackup/peek, mode-aware importDatabase,
  downloadBackupSnapshot.
- `src/components/profile/LocalFileBackupSection.tsx` (new)
  + `src/app/profile/page.tsx` (mount).
- `src/components/profile/GoogleDriveBackupSection.tsx` —
  D6 snapshot in the Drive replace path.
- `src/__tests__/pwa-file-backup.test.tsx` — tests.

## Limits

- A downloaded snapshot protects against a bad restore, not
  against losing the device — it lands in the same device's
  Downloads folder by design (D6 chose a user-visible file
  over a hidden local copy).
- Merge comparisons use the records' own timestamps; a backup
  whose clock was wrong can still win/lose incorrectly
  against local records. That is inherent to timestamp-based
  merging and is why replace exists as the explicit,
  snapshot-guarded alternative.
- The Drive restore dialog itself was not restructured; only
  its confirm handler gained the D6 step.
