# Cricket Scorer Pro — Audit Fix Report (Branch `audit/fix-phase2-10`)

Date: 2026-11-08 · Baseline: `f3046325` (Step 0 in `AUDIT_BASELINE.md`)
Branch is **local only** — not pushed, nothing deployed.

## Final validation vs baseline

| Gate | Baseline | After fixes |
|---|---|---|
| Typecheck (`tsc --noEmit`) | PASS (0 errors) | PASS (0 errors) |
| Lint (ESLint) | PASS | PASS (no warnings) |
| Tests (Vitest) | 1044/1044 (90 files) | **1055/1055 (94 files)** |
| Production build (Next.js) | PASS | PASS |

+4 new regression test files, +11 net tests. Two pre-existing tests were found
**asserting the bugs themselves**; both were corrected with written
justification in the test files (never deleted to go green).

## Fixed (11 commits, one concern per commit)

| # | Bug (from brief) | Severity | Root cause | Commit |
|---|---|---|---|---|
| 3 | Wrong strike / stats after replay & undo | CRITICAL | `BATTER_RETIRED` event omitted `isStriker`; replay defaulted to striker | `ae03d2e` |
| 7 | DLS not updating / wrong after undo | CRITICAL | Snapshots stored only 5 state fields → undo/edit restored hybrid state (revised overs, old DLS flags) | `b3888bc` |
| 6 | DLS before/applied wrongly | HIGH | Super Over inherited parent's `dlsApplied`/revised target; DLS target applicable during 1st innings | `b3888bc`, `a91137d` |
| 10 | Bengali font broken in PDF | HIGH | `page.evaluateHandle('document.fonts.ready')` never awaited the promise on the server path | `41df3ce` |
| 9 | PDF export freezing | HIGH | Server export fetch had **no timeout** (declared `AbortSignal` never used); failure delayed the client fallback indefinitely | `41df3ce` |
| 2 | Overs / ball-count inconsistencies | HIGH | Mid-over `changeBowler` wiped the over log; run-out completed runs missing from log (false maidens); byes/leg-byes ignored by maiden check | `db11b46` |
| 1 | Stats not updating / balls dropped | HIGH | `MotionNumber` equality guard skipped timer cleanup (display stuck at old value); shared 200 ms page lockout silently dropped fast scoring taps | `97c8d42` |
| 5 | Incorrect Did Not Bat | HIGH | No DNB logic existed — 4 duplicated stat filters; squad members without a player slot invisible; completed matches hid the section entirely | `c1c9e57` (+ helper `domain/cricket/battingCard.ts`) |
| 8 | MoM ignoring performances | MEDIUM | Cache-consistency hash fingerprinted only **aggregate totals** — redistributing runs between players kept a stale MoM | `a91137d` |
| 11 | Wrong ground name in PDF | MEDIUM | Free-text `venue` (possibly stale GPS auto-fill) beat the explicitly selected `groundId` ground; user-saved names like "Ward 1" filtered out as unreadable | `a44e201` |
| 4 | Trailing zero / corrupt numeric input | MEDIUM | DLS modal inputs clamped+reparsed per keystroke (typing "20" in Original Overs → "50"; clearing forced 0/1/20 back; decimal overs untypable). Fixed with buffered input, clamp on blur only | `3e35520` |
| — | Performance | LOW | Removed 412 KB of duplicate Lottie JSONs in `public/assets/animations/` (components import the root `animations/` copies) | `9347bcf` |

## Verified NOT broken / already correct (traced, no change made)

- Live strike rotation (odd runs, over end, MCC 18.11 caught-crossing exception) — correct; only the replay path was wrong.
- Legal-ball counting (wides/no-balls), bowler quota checks — correct.
- MoM evaluation does merge both innings; the 4 MoM test files do not contradict each other (but none is an independent spec — the matrix test imports its constants from the engine).
- jsPDF/Bengali font are dynamically imported — the "371 KB font in the bundle" hypothesis was not found.
- Backend is 4-layer (Dexie + Firebase + Supabase + Drive), correcting the brief's Firebase-only assumption. No secrets were read or modified; security was check-and-report only.

## Remaining risks / deliberately not hacked

1. **Full-screen blinking (Bug 14)** — mechanism identified: `MotionNumber` digit opacity animations fire everywhere at once, and the score page mounts **both** mobile and desktop trees (`md:hidden` / `hidden md:block`). The proper fix is a single responsive tree + reduced digit animation — a larger UI refactor that should be done as its own reviewed change.
2. **Penalty runs in the over log** — `+5P` entries shift over-log indices used by ball editing; needs a log-format decision (marker entry vs side channel).
3. **MoM identity join** — batting↔bowling merge joins by cleaned name + team (player IDs are per-innings positional). Exact-name all-rounders merge correctly; divergent spellings (typos/renames) can split one player into two candidates. Durable fix = stable squad player IDs at match creation. Fuzzy matching was rejected (risk of conflating two different players). Super Over performances are also not fed into MoM on the live path.
4. **Offline sync conflicts (Bug 15)** — not reproduced in this pass; the conflict/outbox test suites pass. Recommend a dedicated two-device conflict test before changing `SyncEngine` (1,308 lines).
5. **Firestore indexes** — `firestore.indexes.json` is empty. Composite indexes should be derived from the real production query inventory / Firebase console suggestions, not guessed.
6. **Duplicate team/tournament creation (Bug 12)** — existing UI tests pass; in-flight double-submit protection was not verified at behaviour level.
7. **DLS live-par divergence** — the stored `dlsRevisedTarget` is written but read nowhere in the UI; par is recomputed in two places with different inputs. Unify behind one helper that prefers the stored value.
8. **Client PDF path** — jsPDF cannot shape Bengali complex script; when the server export is unavailable, Bengali exports silently degrade. A console warning exists in code paths; a user-visible notice + Web Worker generation remain future work.

## Safety compliance

- All work on local branch `audit/fix-phase2-10`; clean rollback point `f3046325` on `main`.
- No production data touched, no secrets read/changed, no destructive DB operations, **no push, no deploy**.
- Every fix: reproduce with a failing regression test → smallest change → related suites green → single-purpose commit.
