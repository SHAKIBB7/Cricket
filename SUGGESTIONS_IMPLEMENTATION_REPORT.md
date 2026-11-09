# Suggestions Implementation Report — 2026-11-09

Implements, in one run, every improvement suggested after the full-audit
fix-all (TAIMUR: "তোমার সবগুলা সাজেশন ইমপ্লিমেন্ট করো"). Six partitioned
workstreams, central integration by JINI. Baseline: local `bd12df4`
(production snapshot `74c714a5`).

## 1. Conflict pick-a-version UI — DONE

- `SyncEngine.listConflicts()` / `resolveConflict(branchId, type, choice)`:
  record-level resolution for matches, teams, tournaments and grounds.
  Keep-local restores the preserved branch onto the primary id (PENDING)
  and queues the UPSERT; keep-remote deletes only the branch. Guarded so
  a primary can never resolve itself. Fully offline; drains via the
  normal outbox.
- `SyncConflictsSection` on the profile page (hides when empty),
  ConfirmationDialog-gated, AppToast feedback.
- Honest limit: match event lists were already converged when a branch
  was minted — ball-by-ball events are not resurrected. Event-level
  merge remains the gated D7 M/L question.

## 2. Production error monitoring — DONE (in-house)

Sentry proper needs the owner's account/DSN; instead a dependency-free
reporter: `errorReporter.ts` captures window errors + unhandled
rejections into a 50-entry ring buffer (`csp_error_log`, localStorage),
`ErrorReporterMount` in the root layout, and an `ErrorLogSection` in
profile diagnostics (view / copy JSON / clear). The reporter can never
throw into the app. A Sentry DSN can be wired onto this surface later.

## 3. P8 device verification / F11 npm audit — EXTERNAL (unchanged)

Not code: P8 needs TAIMUR's physical devices; `npm audit` re-attempted
2026-11-09 — the registry proxy still refuses the audit endpoint (the
403 is audit-specific: a normal `npm i -D` succeeded in this run). Both
remain TAIMUR-side actions.

## 4. Bengali i18n completion — DONE

- Pages: all 15 surfaces in `src/app/**` wired to `t()` (score page:
  static labels/buttons/dialogs).
- Components: 20 files in `src/components/**` wired (profile sections,
  navigation, modals incl. 59 converted inline bn ternaries in
  DlsModal/HistoricalBallEditModal, scoring tables, ConfirmationDialog
  defaults).
- Dictionary: 193 → **1156 keys, exact en/bn parity**; every `t()` key
  used in `src/**` resolves in both languages (script-verified).
- Deliberately left English, documented: OS/browser menu labels inside
  install instructions (users must match their device UI literally), 5
  source-pinned literals whose suites must be updated by their owner
  first, BatsmanProfileModal/BowlerProfileModal stat labels (follow-up
  pass), service/domain strings.

## 5. Live match share link — DONE

`shareLink.ts`: canonical center URL, navigator.share → clipboard
fallback, private matches always warn ("only you can open it"). Summary
page now shares the center link (previously its own URL). No access
rules changed.

## 6. Score share image — DONE

`ScoreShareCard.ts`: pure `buildShareCardLayout()` + 1200×630 canvas
card (innings scores, result/live chase line, super-over line, top
scorers, MoM, brand footer). Share via file-share where supported,
PNG download fallback. "Share Image" / "Share Live Image" on summary.

## 7. Career player profiles — DONE

`/players` (searchable, sortable career list) and `/players/[playerKey]`
(batting/bowling/fielding tables, MoM count, appearances linked to
summaries). Aggregation is playerId-first with name-fallback unification
(F9 identity), squad-seeded, pure + testable. Link-ins from analytics
and team rosters. playerKey = the `pl_` id, else `n_` + encoded name;
old-name keys still resolve after a rename.

## 8. Match charts — DONE (worm + Manhattan; wagon wheel OUT)

Per-over series builder merges bowler `overHistory` logs + the partial
over, with engine-faithful token accounting. Pure-SVG `WormChart`
(cumulative, wicket dots, target line) and `ManhattanChart` (runs per
over) mounted as a Charts section on the match center (hides when a
legacy scorecard has no over logs). **Wagon wheel is not faked**: the
app records no shot-direction data anywhere.

## 9. Tournament fixtures + knockout bracket — DONE

Circle-method round-robin generator (byes for odd counts), top-4
knockout (SF 1v4 / 2v3 / Final, all-or-nothing advancement),
best-effort linking to played matches. **Design correction**: the
brief's "optional fixtures field" already exists and drives
`TournamentEngine.standings()` — the schedule persists under a NEW
additive `schedule` field (schemaless Dexie, no migration; verified it
never reaches Firestore's field allowlist). "Schedule & Bracket" tab on
the tournament page with generate/regenerate (ConfirmationDialog) and a
champion display.

## 10. CSV exports — DONE

`csvExport.ts`: full scorecard CSV (batting/bowling/FOW/extras breakdown
per innings, RFC 4180) and tournament CSV fed verbatim by
`TournamentEngine.standings()` + `NetRunRateEngine.generateLeaderboard()`
— no recomputation drift. Buttons on summary + tournament pages.

## 11. Non-blocking PDF — DONE (cooperative chunking; worker rejected)

The client fallback generator is one ~830-line closure interleaved with
DOM delivery/font/plugin setup; a worker split is a separate refactor.
`generatePdf` now yields (rAF/timeout) before sections 2/4/5&6/7/8/9 so
the UI thread breathes between sections; output order unchanged.
Stated caveat: the final `doc.output('blob')` remains one synchronous
call.

## 12. Toast consolidation (F4-16) — DONE

`AppToast` extended backward-compatibly (`variant`, `onDismiss`,
`durationMs`; dismiss fires onDismiss on click AND auto-dismiss).
Summary page migrated (PDF-error dismiss still resets PDF state via
`closePdfModal`); profile page migrated at integration via a
`handleNotify` adapter feeding `showAppToast` (its three `onNotify`
sections keep their prop contract; the persisted banner is gone —
feedback now auto-dismisses, the one behaviour delta, accepted per the
patch spec). `ToastNotification` remains in use on the score page.

## 13. Firestore rules tests — DONE (execution CI/local)

`@firebase/rules-unit-testing` installed cleanly (one devDependency).
`rules-tests/` holds owner-scope contract tests against the real
`firestore.rules`, emulator `firebase.json`, a standalone vitest
config and a README. The app `vitest.config.ts` excludes `rules-tests/**`
so `npm test` never pulls emulator tests. Not executed here: this VM
has no Java/Firebase emulator.

## Integration fixes (JINI)

- Grounds page stray `}}` and a missing `useLanguage` import on the
  new-match page (i18n wiring slips) — typecheck caught both.
- `players_footer_count` dictionary entries removed: the call's
  fallback is a dynamic count string; a static bn entry would have
  rendered a literal placeholder. The fallback carries it until a
  param-aware key is introduced.
- Token guards kept green: 3 `[var(--x)]/NN` classes → semantic
  (`text-foreground/85`, `text-foreground/80`, `bg-muted/60`); two
  emerald button pairs → `bg-success` token forms.
- ActiveBowlerTable header gets a dedicated caps key
  (`awt_bowler_header`) instead of bending the shared `bowler` key.
- SW CACHE_VERSION v2.2.5.

## Test-expectation updates (documented)

- `bowler-recent-balls`: Over label pin → its `t('score_over', 'Over')`
  source form.
- `google-drive-backup-ui`: profile `onNotify` pin → `handleNotify`
  (F4-16 adapter).
- `premium-animation-suite`: profile ToastNotification pin → AppToast
  assertion (F4-16 migration); score-page pins unchanged.

## Gates

- Unit: **1496/1496** (137 files; baseline 1414, +82 new across six
  feature suites)
- Typecheck: 0 errors · Lint: clean · Build: PASS (19/19 pages)
- Playwright: visual **38/38**, offline 10/10, overlay 4/4, stageb 4/4.
  The visual run first flagged 4 screenshot diffs — exactly the two
  seeded pages this run intentionally changed (center-live: Charts
  section + Share; summary-completed: Share Image + Export CSV), in
  light + dark. Those 4 baselines were re-recorded and the suite
  re-verified 38/38.

## Not pushed

Push awaits TAIMUR's approval, as always.
