/**
 * Firestore security-rules tests (owner-scope contract).
 *
 * Runs against the Firestore emulator with the REAL rules from
 * ../firestore.rules — see README.md in this folder for how to run.
 * These tests are intentionally NOT part of the app's vitest run
 * (they need the emulator + Java); CI or a dev machine runs them.
 *
 * Contract under test (from firestore.rules):
 *  - users/{uid}: only the owner can read/write; profile shape is
 *    validated; delete is always denied.
 *  - matches/{id}: public matches are world-readable, private ones
 *    are owner-only; writes are owner-only and shape-validated.
 *  - teams / tournaments / grounds: owner-only, shape-validated.
 *  - everything else: default deny.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let testEnv: RulesTestEnvironment;

const OWNER = 'user-owner';
const OTHER = 'user-other';

function validProfile() {
  return {
    displayName: 'Test Owner',
    email: 'owner@example.com',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function validMatch(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: OWNER,
    teamA: 'Lions',
    teamB: 'Tigers',
    totalOvers: 20,
    status: 'ONGOING',
    currentInnings: 1,
    isPublic: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function validTeam(id: string) {
  return {
    id,
    userId: OWNER,
    name: 'Lions XI',
    players: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function validTournament(id: string) {
  return {
    id,
    userId: OWNER,
    name: 'Weekend Cup',
    format: 'league',
    teams: ['Lions', 'Tigers'],
    fixtures: [],
    leagueMeetings: 1,
    matchOvers: 20,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-cric-scorer-pro',
    firestore: {
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('users/{uid}', () => {
  it('owner can create and read their own valid profile', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertSucceeds(setDoc(doc(db, 'users', OWNER), validProfile()));
    await assertSucceeds(getDoc(doc(db, 'users', OWNER)));
  });

  it('cannot create a profile for someone else', async () => {
    const db = testEnv.authenticatedContext(OTHER).firestore();
    await assertFails(setDoc(doc(db, 'users', OWNER), validProfile()));
  });

  it('rejects an invalid profile shape (displayName too short)', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertFails(
      setDoc(doc(db, 'users', OWNER), { ...validProfile(), displayName: 'A' })
    );
  });

  it("cannot read another user's profile; unauthenticated reads denied", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', OWNER), {
        displayName: 'Test Owner',
        email: 'owner@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
    const otherDb = testEnv.authenticatedContext(OTHER).firestore();
    await assertFails(getDoc(doc(otherDb, 'users', OWNER)));
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'users', OWNER)));
  });

  it('delete is always denied, even for the owner', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertFails(deleteDoc(doc(db, 'users', OWNER)));
  });
});

describe('matches/{id}', () => {
  it('owner can create a valid match; invalid shapes are rejected', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertSucceeds(setDoc(doc(db, 'matches', 'm1'), validMatch('m1')));
    await assertFails(
      setDoc(doc(db, 'matches', 'm2'), validMatch('m2', { totalOvers: 200 }))
    );
    await assertFails(
      setDoc(doc(db, 'matches', 'm3'), validMatch('m3', { status: 'PAUSED' }))
    );
    // Document id must match the payload id.
    await assertFails(setDoc(doc(db, 'matches', 'mX'), validMatch('mY')));
  });

  it("cannot create a match under another user's id", async () => {
    const db = testEnv.authenticatedContext(OTHER).firestore();
    await assertFails(setDoc(doc(db, 'matches', 'm1'), validMatch('m1')));
  });

  it('public matches are readable by anyone; private ones are owner-only', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const base = {
        userId: OWNER,
        teamA: 'Lions',
        teamB: 'Tigers',
        totalOvers: 20,
        status: 'COMPLETED',
        currentInnings: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await setDoc(doc(db, 'matches', 'pub'), { ...base, id: 'pub', isPublic: true });
      await setDoc(doc(db, 'matches', 'priv'), { ...base, id: 'priv', isPublic: false });
    });
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anonDb, 'matches', 'pub')));
    await assertFails(getDoc(doc(anonDb, 'matches', 'priv')));
    const otherDb = testEnv.authenticatedContext(OTHER).firestore();
    await assertFails(getDoc(doc(otherDb, 'matches', 'priv')));
    const ownerDb = testEnv.authenticatedContext(OWNER).firestore();
    await assertSucceeds(getDoc(doc(ownerDb, 'matches', 'priv')));
  });
});

describe('teams / tournaments (owner-only)', () => {
  it('owner can write valid docs; others cannot read or write', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER).firestore();
    await assertSucceeds(setDoc(doc(ownerDb, 'teams', 't1'), validTeam('t1')));
    await assertSucceeds(
      setDoc(doc(ownerDb, 'tournaments', 'cup1'), validTournament('cup1'))
    );

    const otherDb = testEnv.authenticatedContext(OTHER).firestore();
    await assertFails(getDoc(doc(otherDb, 'teams', 't1')));
    await assertFails(setDoc(doc(otherDb, 'teams', 't2'), validTeam('t2')));
    await assertFails(getDoc(doc(otherDb, 'tournaments', 'cup1')));
  });

  it('rejects invalid tournament shapes', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertFails(
      setDoc(doc(db, 'tournaments', 'bad1'), {
        ...validTournament('bad1'),
        format: 't20',
      })
    );
    await assertFails(
      setDoc(doc(db, 'tournaments', 'bad2'), {
        ...validTournament('bad2'),
        teams: ['Only One'],
      })
    );
  });
});

describe('default deny', () => {
  it('unknown collections are neither readable nor writable', async () => {
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertFails(getDoc(doc(db, 'secrets', 'x')));
    await assertFails(setDoc(doc(db, 'secrets', 'x'), { a: 1 }));
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'anything', 'x')));
  });
});
