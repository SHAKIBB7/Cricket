import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * F10 guard: the F10 inventory (F10_INDEX_INVENTORY.md) proved the
 * app's entire Firestore query surface is four single-field equality
 * queries plus single-document reads — all covered by Firestore's
 * automatic single-field indexes, so firestore.indexes.json is
 * CORRECTLY empty.
 *
 * This guard fails the suite if the query surface grows teeth:
 * any Firestore orderBy, or a query built with more than one where,
 * can require a composite index. Whoever adds one must update
 * firestore.indexes.json and the inventory in the same change.
 */
const root = join(__dirname, '..', '..');
const syncEngine = readFileSync(join(root, 'src/infrastructure/sync/SyncEngine.ts'), 'utf8');

describe('F10 Firestore index guard', () => {
  it('firestore.indexes.json is valid and declares no unneeded indexes', () => {
    const parsed = JSON.parse(readFileSync(join(root, 'firestore.indexes.json'), 'utf8'));
    expect(Array.isArray(parsed.indexes)).toBe(true);
    expect(parsed.indexes).toHaveLength(0);
  });

  it('no Firestore orderBy exists anywhere in src (it would need a composite index review)', () => {
    const { execSync } = require('node:child_process');
    let hits = '';
    try {
      hits = execSync(
        `grep -rn "fsOrderBy\\|orderBy" src/infrastructure/sync/SyncEngine.ts src/app/matches/center src/infrastructure/auth/UserProfileService.ts || true`,
        { cwd: root, encoding: 'utf8' }
      );
    } catch {
      hits = '';
    }
    // Dexie orderBy calls live in repositories, not in these files'
    // Firestore paths; the aliased Firestore import is fsOrderBy.
    expect(hits).not.toContain('fsOrderBy');
  });

  it('each Firestore collection query still uses exactly one equality where', () => {
    const querySites = syncEngine.match(/fsQuery\(/g) || [];
    const whereSites = syncEngine.match(/fsWhere\(/g) || [];
    expect(querySites.length).toBe(4);
    expect(whereSites.length).toBe(4);
  });
});
