# Full Audit — Fix-All Report (2026-11-09)

Fixes for the 2026-11-09 full codebase audit
(`~/workspace/Cricket-Full-Audit-Final-Report.md`), implemented
in one run at TAIMUR's instruction ("সব গুলা fix koro এক
সাথে"), in four partitions (sync core, services, domain, UI)
plus a central integration pass. Baseline HEAD add21f4.

## Gates (final, central integration)

- Unit: **1414/1414** (132 files; baseline 1350, +64 new
  regression tests across four new audit-fix suites)
- Typecheck: 0 errors · Lint: clean · Build: PASS
- Playwright: visual 38/38, offline 10/10, overlay 4/4,
  stageb 4/4
- SW CACHE_VERSION bumped v2.2.3 → **v2.2.4** (fallbacks
  aligned).

## What was fixed

**Sync core (12)** — outbox ops are user-scoped at execution
(provenance uid mismatch = held PENDING, never executed
under another account; snapshot gains heldCount); match
pull converges event deletions in both providers (guarded
to non-empty remote event lists); teams/tournaments/grounds
pulls preserve unsynced local work as conflict branches
(matches' pattern, deduped per record — P3-M6); Firestore
team pull normalises players; pull conflict checks count
FAILED ops as unsynced; queueMutation returns success and
repositories durably record queue failures
(`sync_queue_error` in app_metadata, surfaced on the profile
page by the UI partition); dead preference pull removed;
Supabase pull paginates past 50 (cap 1000); Retry-After
honoured; reachability is a real Firestore REST probe
(30 s cache); coalescing preserves createdAt + retryCount;
tournaments with <2 teams are held instead of
guaranteed-FAILED.

**Services (8)** — Drive merge restore is timestamp-aware
(file-import parity: added/updated/skipped detail, player
ids preserved, events follow written matches); profile
display names clamped to the Firestore rules window
(2–50) at create + merge writes; PDF export route hardened
(2 MB cap → 413, shape gate → 400, generic errors only,
per-IP rate limit 10/min → 429; success path unchanged);
APP_URL fallback origin corrected to production +
documented; SW fallback cache names aligned; dummy-config
init now logs a loud one-time error with the rationale
documented (safe variant — see Flags); NEXT_PUBLIC_ENGINE_
VERSION documented.

**Domain (15)** — DLS overs units: new
`DlsEngine.ballsToOversNotation()` used at all three decimal
call sites (+ the missing 3/6 parse test); tournament
averages exclude Retired Hurt FOW entries (Retired Out
still counts); NRR skips ABANDONED/NO_RESULT matches and
uses the innings' own quota for innings 1; MoM weights
normalised to a common 1.00 budget per role; DLS-concluded
matches replay-reproducible (calculateResult honours the
stored par score; fromEvents re-runs the DLS conclusion
from the event payload; legacy logs unchanged); snapshots
before DLS/rename mutations; bowler dot balls include the
final partial over; a wide never consumes a free hit;
fromScorecard deep-copies; invariant 3 counts genuine
dismissals only; editHistoricalBall verifies replay counts
and rolls back on divergence; maxOversPerBowler getter
delegates to the enforced limit; super-over MoM credit
gated on actual participation; runner-up confidence
computed, dead fielding fallback removed.

**UI (17 + 2 follow-ups)** — desktop sidebar gains an
update banner (A-1: shared sync context, scoring-route
dialog gating preserved); summary page gates the completed
block/MoM/narrative on COMPLETED, shows an in-progress
banner otherwise, and the zero-wicket narrative sentence is
replaced with neutral fallbacks (BV-1); profile no longer
flashes a guest card with disabled sign-in while auth loads
(BV-3); profile sync pill derives from the shared sync
snapshot (BV-4); real not-found states on summary +
tournament pages and load-error handling on all match pages
(F4-02/03/04); dismiss guard + discard confirmation wired
into the teams editor, tournament create and profile edit,
Escape handling added through the guards (F4-06/08);
OverlayProvider mounted, overlayId passed at the five
migrated modals (F4-07); Escape closes only the topmost
overlay (F4-09); provider values memoized (F4-11); penalty
runs: 0 stays 0, empty disables with a hint (F4-12);
placeholder-name warning toast for second-innings starters
(F4-13); chase chip fallback matches submit (F4-14);
duplicate z-index removed (F4-15); SyncIndicator modal and
/offline page fully translated — dictionaries 193/193 in
parity (F4-i18n); useSmartNavigation eslint-disable
narrowed to the two call sites. Follow-ups: the four
guest-claim queueMutation sites in FirebaseAuthService now
record failures; the profile page surfaces the durable
`sync_queue_error` record.

## Test-expectation updates (integration, all documented)

Pre-existing assertions that pinned the buggy behaviour
were updated, each with an in-code comment: sync outbox
reachability (P3-L5 real probe), modal z-layer pins ×3
(F4-15: `z-50` → `z-[60]`), offline back-label i18n form,
and MoM spec test 13's runner-up ordering — the direct,
intended consequence of the M4 weight normalisation
(MAMUN now outranks ALAMIN; TAIMUR remains MOTM and all
primary assertions pass unchanged).

## Flags / not forced

- **F4-10** deferred by design: the score page's Escape
  handler calls the identical setters as the modals'
  onClose; no score-page modal uses a dismiss guard, so
  behaviour is provably unchanged.
- **F4-16** toast consolidation not done: the summary and
  profile toasts carry behaviour AppToast cannot express
  (PDF-state reset on dismiss; typed dismissible banner).
- **P3-C2** safe variant: throwing Firebase accessors would
  ripple through every importer for a state all call sites
  already gate against; loud init error + documentation
  chosen instead.
- **BV-5** no code change: the Maps env name is consistent
  in code and .env.example, and the key IS present in the
  production environment (verified via the Vercel API) —
  the /grounds message in the test browser was a sandbox
  load failure, not a config gap.
- **BV-2** was a non-issue (deliberate redirects).
- Residuals kept, by design: conflict branches are
  preserved for all entity types now, but a pick-a-version
  resolution UI remains a product decision (the Batch-2
  design question, narrowed — protection is in, resolution
  UX is not); retired-hurt FOW wicket numbering unchanged
  (alternatives are worse); DLS minimum-overs ABANDONED
  path emits no event (pre-existing); rename edits inside
  historic event payloads are not themselves undoable.
