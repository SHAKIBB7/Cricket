import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../infrastructure/database/dexie-db';
import { StorageManagerService } from '../infrastructure/storage/StorageManagerService';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { CricketGround } from '../domain/cricket/types';
import { Tournament } from '../domain/tournament/types';

describe('Historical Ball Editing & Offline JSON Backup/Restore Suite', () => {
  beforeEach(async () => {
    await db.matches.clear();
    await db.match_events.clear();
    await db.teams.clear();
    await db.tournaments.clear();
    await db.grounds.clear();
    await db.app_metadata.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Historical Ball Editing & Replay Engine', () => {
    it('accurately recalculates match totals when a historical ball run is edited', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Dhaka Gladiators',
        teamB: 'Chittagong Kings',
        tossWinner: 'Dhaka Gladiators',
        tossDecision: 'Batting',
        totalOvers: 5,
        strikerName: 'Tamim',
        nonStrikerName: 'Shakib',
        bowlerName: 'Mustafizur',
      });

      // Delivery 1: 4 runs (Tamim)
      engine.scoreBall({ runsScored: 4 });
      // Delivery 2: 1 run (Tamim, strike rotates to Shakib)
      engine.scoreBall({ runsScored: 1 });
      // Delivery 3: 2 runs (Shakib)
      engine.scoreBall({ runsScored: 2 });

      expect(engine.currentInnings.totalRuns).toBe(7);
      expect(engine.currentInnings.players[0].runs).toBe(5); // Tamim: 4 + 1
      expect(engine.currentInnings.players[1].runs).toBe(2); // Shakib: 2

      // Edit Delivery 1 from 4 to 6 runs
      const success = engine.editHistoricalBall(0, 1, {
        runsScored: 6,
        isWide: false,
        isNoBall: false,
        isByes: false,
        isLegByes: false,
        isWicket: false,
      });

      expect(success).toBe(true);
      expect(engine.currentInnings.totalRuns).toBe(9); // 6 + 1 + 2
      expect(engine.currentInnings.players[0].runs).toBe(7); // Tamim: 6 + 1
      expect(engine.currentInnings.players[1].runs).toBe(2); // Shakib: 2
      expect(engine.currentInnings.bowlers[0].runs).toBe(9);
    });

    it('correctly recalculates strike rotation when single is changed to a dot ball', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Dhaka Gladiators',
        teamB: 'Chittagong Kings',
        tossWinner: 'Dhaka Gladiators',
        tossDecision: 'Batting',
        totalOvers: 5,
        strikerName: 'Tamim',
        nonStrikerName: 'Shakib',
        bowlerName: 'Mustafizur',
      });

      // Ball 0: 1 run (Tamim -> Shakib on strike)
      engine.scoreBall({ runsScored: 1 });
      // Ball 1: 4 runs (Shakib scores 4)
      engine.scoreBall({ runsScored: 4 });

      expect(engine.currentInnings.players[0].runs).toBe(1);
      expect(engine.currentInnings.players[1].runs).toBe(4);

      // Change Ball 0 from 1 run to 0 runs (Tamim stays on strike for Ball 1)
      const success = engine.editHistoricalBall(0, 1, {
        runsScored: 0,
        isWide: false,
        isNoBall: false,
        isByes: false,
        isLegByes: false,
        isWicket: false,
      });

      expect(success).toBe(true);
      expect(engine.currentInnings.totalRuns).toBe(4); // 0 + 4
      expect(engine.currentInnings.players[0].runs).toBe(4); // Tamim faced Ball 1 now!
      expect(engine.currentInnings.players[1].runs).toBe(0); // Shakib faced 0 balls
    });

    it('recalculates wickets, incoming batter, and fall of wickets on historical wicket edit', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Dhaka Gladiators',
        teamB: 'Chittagong Kings',
        tossWinner: 'Dhaka Gladiators',
        tossDecision: 'Batting',
        totalOvers: 5,
        strikerName: 'Tamim',
        nonStrikerName: 'Shakib',
        bowlerName: 'Mustafizur',
      });

      // Ball 0: 0 runs
      engine.scoreBall({ runsScored: 0 });
      // Ball 1: 1 run
      engine.scoreBall({ runsScored: 1 });

      expect(engine.currentInnings.totalWickets).toBe(0);
      expect(engine.currentInnings.fallOfWickets.length).toBe(0);

      // Edit Ball 0 to be a Wicket (Caught, Tamim out, Mushfiqur in)
      const success = engine.editHistoricalBall(0, 1, {
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Caught',
        fielderName: 'Litton',
        newBatsmanName: 'Mushfiqur',
        isStrikerOut: true,
      });

      expect(success).toBe(true);
      expect(engine.currentInnings.totalWickets).toBe(1);
      expect(engine.currentInnings.fallOfWickets.length).toBe(1);
      expect(engine.currentInnings.fallOfWickets[0].player).toContain('Tamim');
      expect(engine.currentInnings.fallOfWickets[0].score).toBe(0);
      expect(engine.currentInnings.players[0].isDismissed).toBe(true);
    });
  });

  describe('2. Offline JSON Backup and Restore (StorageManagerService)', () => {
    it('exports all database tables into a structured JSON backup', async () => {
      // Seed data into IndexedDB
      const engine = new EventSourcedMatchEngine({
        teamA: 'Team Red',
        teamB: 'Team Blue',
        tossWinner: 'Team Red',
        tossDecision: 'Batting',
        totalOvers: 10,
        strikerName: 'Alice',
        nonStrikerName: 'Bob',
        bowlerName: 'Charlie',
      });
      engine.scoreBall({ runsScored: 4 });
      const scorecard = engine.toScorecard();
      await db.matches.put(scorecard);
      await db.match_events.bulkPut(engine.events);

      await db.teams.put({
        id: 'team_red_id',
        name: 'Team Red',
        captain: 'Alice',
        manager: 'Coach Bob',
        players: ['Alice', 'Bob', 'David'],
        createdAt: new Date().toISOString(),
      });

      const ground: CricketGround = {
        id: 'ground_mirpur_id',
        name: 'Sher-e-Bangla National Cricket Stadium',
        address: 'Mirpur, Dhaka',
        latitude: 23.8069,
        longitude: 90.3636,
        locationSource: 'MANUAL',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.grounds.put(ground);

      const tournament: Tournament = {
        id: 'bpl_tourney_id',
        name: 'Bangladesh Premier League',
        format: 'league',
        teams: ['team_red_id', 'team_blue_id'],
        fixtures: [],
        createdAt: new Date().toISOString(),
        leagueMeetings: 1,
        matchOvers: 20,
      };
      await db.tournaments.put(tournament);

      // Perform Export
      const { jsonString, stats } = await StorageManagerService.exportDatabase();

      expect(stats.matches).toBe(1);
      expect(stats.teams).toBe(1);
      expect(stats.tournaments).toBe(1);
      expect(stats.grounds).toBe(1);

      const parsed = JSON.parse(jsonString);
      expect(parsed.app).toBe('Cric Scorer Pro');
      expect(parsed.version).toBe('2.5.0');
      expect(parsed.matches.length).toBe(1);
      expect(parsed.teams.length).toBe(1);
      expect(parsed.tournaments.length).toBe(1);
      expect(parsed.grounds.length).toBe(1);
      expect(parsed.matchEvents.length).toBeGreaterThan(0);
    });

    it('restores all records accurately from exported JSON backup into IndexedDB', async () => {
      const sampleBackup = {
        app: 'Cric Scorer Pro',
        version: '2.5.0',
        exportedAt: new Date().toISOString(),
        matches: [
          {
            id: 'match_restored_1',
            teamA: 'Sylhet Strikers',
            teamB: 'Rangpur Riders',
            totalOvers: 20,
            status: 'COMPLETED',
            winner: 'Sylhet Strikers',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        matchEvents: [],
        teams: [
          {
            id: 'team_sylhet',
            name: 'Sylhet Strikers',
            captain: 'Mashrafe',
            manager: 'Rajin',
            players: ['Mashrafe', 'Shanto', 'Zakir'],
            createdAt: new Date().toISOString(),
          },
        ],
        tournaments: [
          {
            id: 'tourney_cup',
            name: 'Independence Cup',
            format: 'KNOCKOUT',
            teams: [],
            fixtures: [],
            createdAt: new Date().toISOString(),
            status: 'UPCOMING',
          },
        ],
        grounds: [
          {
            id: 'ground_sylhet_id',
            name: 'Sylhet International Cricket Stadium',
            city: 'Sylhet',
            country: 'Bangladesh',
            latitude: 24.9194,
            longitude: 91.8708,
            source: 'MANUAL',
            createdAt: new Date().toISOString(),
          },
        ],
      };

      const result = await StorageManagerService.importDatabase(JSON.stringify(sampleBackup));

      expect(result.success).toBe(true);
      expect(result.restored.matches).toBe(1);
      expect(result.restored.teams).toBe(1);
      expect(result.restored.tournaments).toBe(1);
      expect(result.restored.grounds).toBe(1);

      // Verify records are indeed in IndexedDB
      const restoredMatch = await db.matches.get('match_restored_1');
      expect(restoredMatch?.winner).toBe('Sylhet Strikers');

      const restoredTeam = await db.teams.get('team_sylhet');
      expect(restoredTeam?.captain).toBe('Mashrafe');

      const restoredGround = await db.grounds.get('ground_sylhet_id');
      expect((restoredGround as any)?.city).toBe('Sylhet');
    });

    it('safely handles corrupted or invalid JSON without crashing', async () => {
      const invalidJson = '{"broken": json...}';
      const result = await StorageManagerService.importDatabase(invalidJson);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      const nonBackupJson = JSON.stringify({ hello: 'world' });
      const result2 = await StorageManagerService.importDatabase(nonBackupJson);

      expect(result2.success).toBe(false);
      expect(result2.error).toContain('recognized Cric Scorer Pro records');
    });
  });
});
