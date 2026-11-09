# Historical Error Recovery & Regression Audit — 2026-11-09

Scope: full deployment history (GitHub Deployments API), local git
history (45 commits), and a fresh full-gate validation of HEAD
`6406ead` (the tree live in production as snapshot `2d1c1052`).

## 1. Historical errors identified

### 1a. Deployment failures (NEW evidence — not previously tracked)

94 Vercel deployments on record: **77 success, 17 failure.**

- **Pre-audit era (author's own commits, Oct 2026)** — 5 Production
  failures: `e79d6ea5` + `922b69b6` (Oct 6), `57569d97` + `25bcc4ee`
  (Oct 14), `05f55437` (Oct 24). Each was followed by a successful
  deployment within minutes–hours (fix-forward). Those commits are
  not in the local clone (history starts at `f3046325`), and Vercel
  build logs require the project owner's Vercel access, so their
  root causes cannot be reconstructed from available evidence.
- **Audit-branch Preview failures (2026-11-08)** — all 8 Preview
  deployments of the snapshot pushes failed (`de2f53dc` …
  `babfd17a`). Decisive detail: the SAME commit `babfd17a` that
  failed as Preview at 16:30 UTC succeeded as Production at 16:51
  UTC after the fast-forward — identical tree, opposite outcome.
- **Production failures inside the fix programme (2026-11-08/09)** —
  4 snapshots failed to deploy: `2cbd7106` (Stage A), `3bd6aebb`
  (Stage B), `14a575a4` (F9-β2), `588186be` (F9-β5). Each was
  superseded by the next snapshot's successful deployment, which
  carried the same content forward (Stage C's success deployed
  A+B+C; β3's success deployed β2+β3; F10's success — 2 minutes
  after β5's failure, differing by 2 added doc/test files —
  deployed β5+F10).

**Impact:** no failed deployment ever became live; Vercel kept
serving the last successful build. The real cost was *staleness*:
production ran the Phase 18 build from 19:39 → 03:18 UTC while
Stages A and B waited for Stage C's successful deploy.

**Root-cause assessment:** the pattern excludes code as the cause —
(1) an identical tree both failed (Preview) and succeeded
(Production); (2) β5's tree failed, then shipped successfully inside
F10's deployment 2 minutes later; (3) every failed tree passed the
full local gate suite, including a production build, before pushing.
Evidence points to transient Vercel build-side failures. Definitive
confirmation requires the Vercel build logs (owner's dashboard /
`vercel inspect <dpl> --logs` with the IDs in the deployment
statuses), which this environment cannot access.

**Process gap (owned):** push verification in this programme checked
tree/blob equality only — never deployment state. Corrective rule
adopted: after every future push, check the GitHub Deployments state
for the new commit and report failures immediately.

### 1b. Historical code errors (from the audit programmes)

All mapped to fix commits in local history (see AUDIT_FIX_REPORT.md,
ULTIMATE_STAGE_* reports, F9_BETA* reports): the 15 original bugs
(BATTER_RETIRED replay, DLS super-over leak, over-log integrity,
DNB classification, MoM cache, PDF fonts/timeout, DLS modal inputs,
MotionNumber timers, …), Phase 17 contrast defects, Bug 14
dual-mount blinking, Phase 18 invisible tint classes, overlay-system
gaps (no focus trap, native confirm/alert), and Ultimate findings
F1–F13 (Retired Hurt semantics, applied-DLS source, double-submit
duplication, cross-tab clobbering, public-by-default gap, penalty
edit shift, super-over MoM exclusion).

## 2. Errors already resolved

Everything in §1b is fixed, regression-tested, and live in
production (the currently deployed tree `2d1c1052` contains all of
it, and the live app was exercised during F12 setup: it loads,
reports Firebase project `cricket-proo`, offers Google +
email/password sign-in).

## 3. Errors still unresolved (with root causes)

- **F11 — dependency vulnerabilities unknown.** `npm audit` is
  blocked by this VM's registry proxy (403 `policy_denied`). Root
  cause: environment policy, not code. Owner action: run
  `npm audit` on a normal network/CI.
- **F12 — live multi-device sync unverified.** Needs a signed-in
  session on the production app; sign-in is pending with the owner
  (browser left open at the form). Checklist ready:
  `~/workspace/Cricket-F12-Verification-Plan.md`.
- **F2-strong (optional)** — conflict *prevention* beyond Stage B's
  warn banner is not built; deliberately gated on F12 scenario 2.
- **Vercel build-log root cause for §1a** — unobtainable from here;
  needs the owner's Vercel access.
- Known accepted limitations (documented, not regressions):
  stub pages `/history` `/settings` `/matches`; ~56 `as any` casts;
  Retired Hurt resumption unimplemented; `bowlersFaced`/
  `runsVsBowler` still name-keyed inside stored records; PDF MoM
  for tied matches may be main-match-only; non-default hero themes
  not ratio-tested (E2); β2 downgrade hazard for pre-β2 builds.

## 4. Files modified and fixes applied

**No code fixes were required**: the fresh audit confirmed no
errors in the current codebase — every historical code error in
§1b is fixed and covered by regression tests, and the full gate
suite (§5) is green at HEAD. The only file added is this report.
No production data, secrets, env vars or Firebase data were
touched. No history was rewritten; no force-push used; nothing was
deployed by this audit.

## 5. Regression test results (fresh, HEAD `6406ead`, 2026-11-09)

- Unit: **1295/1295 passed** (118 files)
- Visual regression: **38/38 passed** (production build, both
  viewports — no baseline drift, so no recent change altered any
  rendered surface unexpectedly)
- Offline validation: **10/10** · Overlay: **4/4** · Stage B: **4/4**
- Typecheck: 0 errors · ESLint: clean · TODO/FIXME/HACK in src: 0
- Dependency tree: no UNMET/missing packages; PDF API route present

## 6. Build validation

`npm run build` — ✓ Compiled successfully at HEAD `6406ead`, the
same tree that Vercel's latest Production deployment (`2d1c1052`,
state success) is serving at cricket-theta-snowy.vercel.app. The
live app was exercised in the F12 setup step and loads correctly.

## 7. Remaining risks and recommended actions

1. **Deployment-failure recurrence (§1a):** if the transient-failure
   pattern repeats, a future push may again fail silently. Mitigation
   adopted: verify deployment state after every push via the
   Deployments API. Owner option: open one failed deployment's logs
   in the Vercel dashboard (`dpl_4mNy4rXDaDroUV5CGnFKiXM8jgms` is the
   most recent failure) to confirm the transient cause.
2. **F11:** owner runs `npm audit` externally; triage follows.
3. **F12:** owner signs in on the production app (browser form is
   open); the 5-scenario checklist then runs.
4. Accepted limitations in §3 remain as documented.
