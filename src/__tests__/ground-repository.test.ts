import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../infrastructure/database/dexie-db';
import { GroundRepository } from '../infrastructure/storage/GroundRepository';
import { MatchRepository } from '../infrastructure/storage/MatchRepository';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';

describe('GroundRepository & Cricket Ground Data Model Test Suite', () => {
  beforeEach(async () => {
    await db.grounds.clear();
    await db.matches.clear();
    await db.sync_queue.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Input Validation & Schema Constraints', () => {
    it('rejects grounds with empty or whitespace-only names', async () => {
      await expect(
        GroundRepository.saveGround({
          name: '   ',
          latitude: 23.81,
          longitude: 90.41,
        })
      ).rejects.toThrow(/Ground name is required/i);
    });

    it('rejects invalid latitudes beyond [-90, 90]', async () => {
      await expect(
        GroundRepository.saveGround({
          name: 'North Pole Stadium',
          latitude: 95.0,
          longitude: 0.0,
        })
      ).rejects.toThrow(/Invalid latitude/i);

      await expect(
        GroundRepository.saveGround({
          name: 'South Pole Ground',
          latitude: -91.5,
          longitude: 0.0,
        })
      ).rejects.toThrow(/Invalid latitude/i);
    });

    it('rejects invalid longitudes beyond [-180, 180]', async () => {
      await expect(
        GroundRepository.saveGround({
          name: 'Pacific International',
          latitude: 10.0,
          longitude: 185.0,
        })
      ).rejects.toThrow(/Invalid longitude/i);

      await expect(
        GroundRepository.saveGround({
          name: 'Far West Ground',
          latitude: 10.0,
          longitude: -181.0,
        })
      ).rejects.toThrow(/Invalid longitude/i);
    });

    it('saves a valid ground successfully to IndexedDB and enqueues sync mutation', async () => {
      const saved = await GroundRepository.saveGround({
        name: 'Lord’s Cricket Ground',
        latitude: 51.5298,
        longitude: -0.1726,
        address: 'St John’s Wood Rd, London NW8 8QN, UK',
        googlePlaceId: 'ChIJz2x3h3cadkgR0p2H2Q0Vz9Q',
      });

      expect(saved.id).toBeDefined();
      expect(saved.name).toBe('Lord’s Cricket Ground');
      expect(saved.latitude).toBe(51.5298);
      expect(saved.longitude).toBe(-0.1726);
      expect(saved.googlePlaceId).toBe('ChIJz2x3h3cadkgR0p2H2Q0Vz9Q');
      expect(saved.createdAt).toBeDefined();
      expect(saved.updatedAt).toBeDefined();

      const inDb = await db.grounds.get(saved.id);
      expect(inDb).toBeDefined();
      expect(inDb?.name).toBe('Lord’s Cricket Ground');

      // Verify sync mutation was queued
      const syncOps = await db.sync_queue.where('entityId').equals(saved.id).toArray();
      expect(syncOps.length).toBe(1);
      expect(syncOps[0].operationType).toBe('UPSERT_GROUND');
    });
  });

  describe('2. Deduplication & Place Matching', () => {
    it('prevents duplicate grounds when the same Google Place ID is provided', async () => {
      const first = await GroundRepository.saveGround({
        name: 'Melbourne Cricket Ground',
        latitude: -37.82,
        longitude: 144.9834,
        googlePlaceId: 'ChIJ48T9rJVC1moR3Y9e-w4L9yU',
      });

      // Attempt to save again with the same Place ID but slightly different name string
      const second = await GroundRepository.saveGround({
        name: 'MCG Melbourne',
        latitude: -37.82,
        longitude: 144.9834,
        googlePlaceId: 'ChIJ48T9rJVC1moR3Y9e-w4L9yU',
        address: 'Brunton Ave, Richmond VIC 3002',
      });

      expect(second.id).toBe(first.id);
      expect(second.googlePlaceId).toBe(first.googlePlaceId);

      const all = await GroundRepository.getAllGrounds();
      expect(all.length).toBe(1);
      expect(all[0].address).toBe('Brunton Ave, Richmond VIC 3002');
    });

    it('deduplicates custom local grounds with identical name and proximate coordinates', async () => {
      const g1 = await GroundRepository.saveGround({
        name: 'Greenfield Cricket Ground',
        latitude: 23.8103,
        longitude: 90.4125,
      });

      // Save again with same name (case-insensitive) and virtually identical coords (~10m away)
      const g2 = await GroundRepository.saveGround({
        name: '  greenfield cricket ground  ',
        latitude: 23.81032,
        longitude: 90.41253,
      });

      expect(g2.id).toBe(g1.id);
      const all = await db.grounds.toArray();
      expect(all.length).toBe(1);
    });

    it('NEVER merges two distinct grounds solely because they have similar or identical names in different locations', async () => {
      // Ground 1: "St. Peter’s Field" in London
      const londonGround = await GroundRepository.saveGround({
        name: 'St. Peter’s Field',
        latitude: 51.5074,
        longitude: -0.1278,
      });

      // Ground 2: "St. Peter’s Field" in Manchester (approx 260 km away)
      const manchesterGround = await GroundRepository.saveGround({
        name: 'St. Peter’s Field',
        latitude: 53.4808,
        longitude: -2.2426,
      });

      expect(manchesterGround.id).not.toBe(londonGround.id);

      const all = await GroundRepository.getAllGrounds();
      expect(all.length).toBe(2);
      expect(all.map((g) => g.id)).toContain(londonGround.id);
      expect(all.map((g) => g.id)).toContain(manchesterGround.id);
    });
  });

  describe('3. Match Statistics & History Rules', () => {
    it('calculates total matches and recent match date strictly from played matches (COMPLETED & ONGOING)', async () => {
      const ground = await GroundRepository.saveGround({
        name: 'Sydney Cricket Ground',
        latitude: -33.8915,
        longitude: 151.2248,
        googlePlaceId: 'ChIJ4b53uVWuEmsR_d-mQ8xU43s',
      });

      // 1. COMPLETED match (Played)
      const engine1 = new EventSourcedMatchEngine({
        teamA: 'Australia',
        teamB: 'England',
        tossWinner: 'Australia',
        tossDecision: 'Batting',
        totalOvers: 5,
        strikerName: 'Warner',
        nonStrikerName: 'Finch',
        bowlerName: 'Anderson',
        venue: ground.name,
        groundId: ground.id,
      });
      engine1.status = 'COMPLETED';
      const sc1 = engine1.toScorecard();
      sc1.updatedAt = '2026-10-10T14:00:00.000Z';
      await db.matches.put(sc1);

      // 2. ONGOING match (Played)
      const engine2 = new EventSourcedMatchEngine({
        teamA: 'Sydney Sixers',
        teamB: 'Perth Scorchers',
        tossWinner: 'Sydney Sixers',
        tossDecision: 'Bowling',
        totalOvers: 5,
        strikerName: 'Smith',
        nonStrikerName: 'Henriques',
        bowlerName: 'Behrendorff',
        venue: ground.name,
        groundId: ground.id,
      });
      engine2.status = 'ONGOING';
      const sc2 = engine2.toScorecard();
      sc2.updatedAt = '2026-10-14T10:00:00.000Z';
      await db.matches.put(sc2);

      // 3. ABANDONED match (Must NOT count as a played match)
      const engine3 = new EventSourcedMatchEngine({
        teamA: 'NSW Blues',
        teamB: 'Queensland',
        tossWinner: 'NSW Blues',
        tossDecision: 'Batting',
        totalOvers: 5,
        venue: ground.name,
        groundId: ground.id,
      });
      engine3.status = 'ABANDONED';
      await db.matches.put(engine3.toScorecard());

      // 4. PENDING match (Must NOT count as a played match)
      const engine4 = new EventSourcedMatchEngine({
        teamA: 'Sydney Thunder',
        teamB: 'Hobart Hurricanes',
        tossWinner: 'Sydney Thunder',
        tossDecision: 'Batting',
        totalOvers: 5,
        venue: ground.name,
        groundId: ground.id,
      });
      engine4.status = 'PENDING';
      await db.matches.put(engine4.toScorecard());

      // Compute statistics for the ground
      const stats = await GroundRepository.getGroundStats(ground.id);

      expect(stats.totalMatches).toBe(2); // Only COMPLETED (1) and ONGOING (2)
      expect(stats.matches.length).toBe(2);
      expect(stats.mostRecentMatchDate).toBe('2026-10-14T10:00:00.000Z');
      expect(stats.matches.map((m) => m.status)).toEqual(['ONGOING', 'COMPLETED']);
    });

    it('falls back to venue name matching for legacy matches created without groundId', async () => {
      const ground = await GroundRepository.saveGround({
        name: 'Eden Gardens',
        latitude: 22.5646,
        longitude: 88.3433,
      });

      // Legacy match with venue: "Eden Gardens", but NO groundId
      const legacyEngine = new EventSourcedMatchEngine({
        teamA: 'India',
        teamB: 'Pakistan',
        tossWinner: 'India',
        tossDecision: 'Batting',
        totalOvers: 10,
        venue: 'Eden Gardens',
      });
      legacyEngine.status = 'COMPLETED';
      legacyEngine.updatedAt = '2026-09-01T12:00:00.000Z';
      await MatchRepository.saveMatch(legacyEngine.toScorecard());

      const stats = await GroundRepository.getGroundStats(ground.id);
      expect(stats.totalMatches).toBe(1);
      expect(stats.matches[0].venue).toBe('Eden Gardens');
    });
  });

  describe('4. Ground Deletion', () => {
    it('deletes a ground and queues sync deletion mutation', async () => {
      const g = await GroundRepository.saveGround({
        name: 'Temporary Ground',
        latitude: 12.34,
        longitude: 56.78,
      });

      await GroundRepository.deleteGround(g.id);

      const found = await GroundRepository.getGround(g.id);
      expect(found).toBeUndefined();

      const deleteOps = await db.sync_queue
        .where('operationType')
        .equals('DELETE_GROUND')
        .and((op) => op.entityId === g.id)
        .toArray();
      expect(deleteOps.length).toBe(1);
    });
  });
});
