import Dexie from 'dexie';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * F9-β2: the Dexie v3 → v4 upgrade must assign durable player ids to
 * every saved team exactly once, preserve names/order, and never
 * re-key on later opens. Simulated with a v3-only schema twin over
 * fake-indexeddb, then the real app database opens over the same
 * store and its v4 upgrade runs.
 */
const DB_NAME = 'CricScorerPro_v2';

class V3OnlyDb extends Dexie {
  teams!: Dexie.Table<any, string>;
  constructor() {
    super(DB_NAME);
    this.version(3).stores({
      matches: 'id, status, currentInnings, syncStatus, groundId, updatedAt, createdAt',
      match_events: 'eventId, matchId, version, timestamp, type, [matchId+version]',
      teams: 'id, name, syncStatus, createdAt',
      tournaments: 'id, name, format, syncStatus, createdAt',
      user_profile: 'id, email',
      sync_queue: 'clientOpId, operationType, status, createdAt, entityId, [status+createdAt]',
      app_metadata: 'key, updatedAt',
      grounds: 'id, name, googlePlaceId, createdAt, updatedAt',
    });
  }
}

describe('Dexie v4 player-identity upgrade', () => {
  beforeAll(async () => {
    await Dexie.delete(DB_NAME);
    const legacy = new V3OnlyDb();
    await legacy.open();
    await legacy.teams.put({
      id: 'team_legacy',
      name: 'Legacy XI',
      captain: 'Rahim',
      manager: '',
      players: ['Rahim', 'Karim', 'Rahim'], // duplicate name on purpose
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await legacy.teams.put({
      id: 'team_empty',
      name: 'Empty XI',
      captain: '',
      manager: '',
      players: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    legacy.close();
  });

  afterAll(async () => {
    const { db } = await import('../infrastructure/database/dexie-db');
    db.close();
    await Dexie.delete(DB_NAME);
  });

  it('assigns stable pl_ ids once; re-opening never re-keys', async () => {
    const { db } = await import('../infrastructure/database/dexie-db');
    await db.open();
    expect(db.verno).toBe(4);

    const legacy = await db.teams.get('team_legacy');
    expect(legacy).toBeDefined();
    expect(legacy!.players.map((p) => p.name)).toEqual(['Rahim', 'Karim', 'Rahim']);
    expect(legacy!.players.every((p) => p.id.startsWith('pl_'))).toBe(true);
    // Duplicate names are distinct people: three distinct ids.
    expect(new Set(legacy!.players.map((p) => p.id)).size).toBe(3);

    const empty = await db.teams.get('team_empty');
    expect(empty!.players).toEqual([]);

    const firstIds = legacy!.players.map((p) => p.id);
    db.close();

    // Fresh app-database instance over the same store: ids unchanged.
    const { CricScorerProDatabase } = await import('../infrastructure/database/dexie-db');
    const again = new CricScorerProDatabase();
    await again.open();
    const reread = await again.teams.get('team_legacy');
    expect(reread!.players.map((p) => p.id)).toEqual(firstIds);
    again.close();
  });
});
