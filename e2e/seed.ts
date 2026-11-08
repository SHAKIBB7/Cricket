import type { Page } from '@playwright/test';
import seeded from './fixtures/seeded-matches.json';

/**
 * Deterministic Dexie seeding for data-dependent pages.
 *
 * The score page rebuilds its engine from the stored MatchScorecard
 * snapshot and tolerates an empty event log, so inserting the two fixture
 * records into the `matches` store is enough to render the live score
 * page, the match center and the summary page identically on every run.
 * The records come from e2e/fixtures/seeded-matches.json — see
 * e2e/fixtures/generate-seed.mjs for provenance.
 */

export const LIVE_MATCH_ID = 'e2e-seed-live';
export const COMPLETED_MATCH_ID = 'e2e-seed-completed';
export const DB_NAME = 'CricScorerPro_v2';

export async function seedMatches(page: Page): Promise<void> {
  // Boot the app once so Dexie creates the database with the app's schema.
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(
    async ({ dbName, records }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('matches', 'readwrite');
        const store = tx.objectStore('matches');
        for (const record of records) store.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { dbName: DB_NAME, records: [seeded.completed, seeded.live] },
  );
}

export async function readSeededMatch(page: Page, id: string): Promise<any> {
  return page.evaluate(
    async ({ dbName, matchId }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const record = await new Promise<any>((resolve, reject) => {
        const req = db.transaction('matches', 'readonly').objectStore('matches').get(matchId);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return record;
    },
    { dbName: DB_NAME, matchId: id },
  );
}
