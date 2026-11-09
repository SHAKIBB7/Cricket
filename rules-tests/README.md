# Firestore Rules Tests

Automated tests for `../firestore.rules` (the production rules), built
on [`@firebase/rules-unit-testing`](https://firebase.google.com/docs/rules/unit-tests).
They verify the owner-scope contract: users can only touch their own
documents, public matches are world-readable while private ones are
not, invalid document shapes are rejected, and everything else falls
through to the default deny.

## Why this lives outside `src/`

These tests need the Firestore **emulator** (and a JRE) — they cannot
run inside the app's normal vitest suite or in the sandboxed build
environment. They are meant for CI or a developer machine.

## Prerequisites

- Node 22+ and the repo's dependencies installed (`npm install` at the
  repo root — `@firebase/rules-unit-testing` is a devDependency).
- Java (JRE 11+) for the Firestore emulator.
- Firebase CLI: `npm i -g firebase-tools` (or use `npx firebase-tools`).

## Run

From the repo root:

```bash
npx firebase-tools emulators:exec --only firestore --project demo-cric-scorer-pro \
  --config rules-tests/firebase.json \
  "npx vitest run --config rules-tests/vitest.config.ts"
```

(The main `vitest.config.ts` explicitly excludes `rules-tests/**`, so
the app suite never tries to run these without an emulator.)

Notes:

- The test file loads the real rules from `../firestore.rules` and
  points the test environment at `127.0.0.1:8080`, matching the
  emulator block in `rules-tests/firebase.json`.
- `demo-cric-scorer-pro` is a demo project id — the emulator never
  talks to production.
- Expected result: all suites pass (users, matches, teams/tournaments,
  default deny).

## CI sketch

Add a job that installs Java + firebase-tools, then runs the command
above. No secrets are required: the emulator is fully local and the
demo project id is not a real Firebase project.
