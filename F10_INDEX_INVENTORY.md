# F10 — Firestore Index Inventory & Verdict

Date: 2026-11-09 · HEAD at inventory: c0e3943 (post-β5)
Question from the Ultimate discovery: `firestore.indexes.json` is
empty — are composite indexes missing?

## Verdict

**No composite indexes are needed. The empty file is correct.**
Every Firestore query in the app is either a single-field equality
query (covered by Firestore's automatic single-field indexes) or a
single-document read (no index involved). Guarded by
`src/__tests__/f10-firestore-index-guard.test.ts`, which fails if a
Firestore `orderBy` or a multi-`where` query ever appears without an
accompanying index update.

## Complete Firestore query surface (verified by source scan)

| Site | Query | Index need |
|---|---|---|
| SyncEngine (matches pull) | `collection('matches') where userId == uid` | automatic single-field |
| SyncEngine (teams pull) | `collection('teams') where userId == uid` | automatic single-field |
| SyncEngine (tournaments pull) | `collection('tournaments') where userId == uid` | automatic single-field |
| SyncEngine (grounds pull) | `collection('grounds') where userId == uid` | automatic single-field |
| Match Center page | `getDoc` / `onSnapshot` on `matches/{id}` | none (document read) |
| UserProfileService | `getDoc` / `setDoc` on the user doc | none (document read) |
| SyncEngine writes | `setDoc` / upserts by explicit doc id | none |

No Firestore `orderBy`, no range inequalities, no multi-field
filters exist anywhere in `src/`. (The many `.where()/.orderBy()`
calls elsewhere are Dexie/IndexedDB — their indexes are declared in
the Dexie schema, currently v4, and are unrelated to this file.)

## Supabase side (for completeness)

The Supabase match pull orders by `updated_at desc` with a
`user_id` equality filter and `limit 50` (SyncEngine). Postgres
handles this fine at current scale without help. If match counts
per user grow large, an optional covering index would be:

```sql
create index if not exists matches_user_updated_idx
  on matches (user_id, updated_at desc);
```

That is a Supabase migration (TAIMUR's call, run in the Supabase
dashboard), NOT part of `firestore.indexes.json`.

## Re-check procedure (when queries change)

1. `grep -rn "fsWhere\|fsQuery\|firebase/firestore" src` and list
   every Firestore query construction.
2. A composite index is required only when a query combines an
   equality/range filter on one field with an `orderBy` or filter
   on another. Declare it in `firestore.indexes.json` and deploy
   with `firebase deploy --only firestore:indexes`.
3. The guard test will already have failed in CI to remind you.
