import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../infrastructure/database/dexie-db';
import { GoogleDriveService } from '../infrastructure/storage/GoogleDriveService';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { ManOfTheMatchEngine } from '../domain/cricket/analytics/ManOfTheMatchEngine';
import { normalizeTeamPlayers, type TeamPlayer } from '../domain/teams/playerIdentity';

/**
 * F9-β5 hardening: the identity data survives every storage boundary
 * the programme touched, and the MoM cache behaves correctly for
 * playerId-bearing scorecards.
 */
const teamPlayers: TeamPlayer[] = [
  { id: 'pl_tamim', name: 'Tamim' },
  { id: 'pl_litton', name: 'Litton' },
  { id: 'pl_shakib', name: 'Shakib' },
];

describe('Drive round-trip (β5)', () => {
  beforeEach(async () => {
    await db.teams.clear();
    await db.matches.clear();
    await db.match_events.clear();
    await db.tournaments.clear();
    await db.grounds.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('object players survive backup → wipe → restore with ids intact', async () => {
    await db.teams.put({
      id: 'team_rt',
      name: 'Round Trip XI',
      captain: 'Tamim',
      manager: '',
      players: teamPlayers,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const payload = await GoogleDriveService.createBackupPayload('user_1');
    const backedUp = payload.teams.find((t: any) => t.id === 'team_rt');
    expect(backedUp.players).toEqual(teamPlayers);

    await db.teams.clear();
    await GoogleDriveService.restoreToIndexedDb(payload, { mode: 'replace' });

    const restored = await db.teams.get('team_rt');
    expect(restored?.players).toEqual(teamPlayers);
  });

  it('a legacy string-player backup restores as objects with fresh ids', async () => {
    const legacyPayload: any = {
      app: 'Cric Scorer Pro',
      schemaVersion: 3,
      userUid: 'user_1',
      matches: [],
      matchEvents: [],
      tournaments: [],
      grounds: [],
      teams: [
        {
          id: 'team_legacy',
          name: 'Legacy XI',
          captain: 'Rahim',
          manager: '',
          players: ['Rahim', 'Karim'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    await GoogleDriveService.restoreToIndexedDb(legacyPayload, { mode: 'replace' });
    const restored = await db.teams.get('team_legacy');
    expect(restored?.players.map((p) => p.name)).toEqual(['Rahim', 'Karim']);
    expect(restored?.players.every((p) => p.id.startsWith('pl_'))).toBe(true);
  });
});

describe('Sync intake boundary (β5) — the exact normaliser calls SyncEngine makes', () => {
  it('a legacy string-writing client cannot orphan local identities', () => {
    const local = teamPlayers;
    const remoteStrings = ['Tamim', 'Litton', 'Shakib'];
    expect(normalizeTeamPlayers(remoteStrings, local)).toEqual(teamPlayers);
  });

  it('object-form remote players keep their own ids', () => {
    const remote = [
      { id: 'pl_tamim', name: 'Tamim Iqbal' }, // renamed remotely
      { id: 'pl_new', name: 'New Recruit' },
    ];
    expect(normalizeTeamPlayers(remote, teamPlayers)).toEqual(remote);
  });
});

describe('MoM cache with playerId-bearing scorecards (β5)', () => {
  function buildCard() {
    const e = new EventSourcedMatchEngine({
      teamA: 'Tigers',
      teamB: 'Lions',
      tossWinner: 'Tigers',
      tossDecision: 'Batting',
      totalOvers: 5,
      strikerName: 'Tamim',
      nonStrikerName: 'Litton',
      bowlerName: 'Shaheen',
      advancedSettings: {
        players: 11,
        teamASquad: teamPlayers,
        teamBSquad: [
          { id: 'pl_shaheen', name: 'Shaheen' },
          { id: 'pl_babar', name: 'Babar' },
        ],
      },
    });
    for (let i = 0; i < 12; i++) e.scoreBall({ runsScored: 4 });
    const card = e.toScorecard();
    card.status = 'COMPLETED';
    (card as any).winner = 'Tigers';
    return card;
  }

  it('resolves, caches, and serves the same winner while the card is unchanged', () => {
    const card = buildCard();
    const first = ManOfTheMatchEngine.resolveForMatch(card);
    expect(first).not.toBeNull();
    expect(card.momStats?.matchHash).toBeTruthy();
    const hash1 = card.momStats!.matchHash;

    const second = ManOfTheMatchEngine.resolveForMatch(card);
    expect(second!.name).toBe(first!.name);
    expect(card.momStats!.matchHash).toBe(hash1);
  });

  it('a post-finalization edit invalidates the cache and recomputes', () => {
    const card = buildCard();
    ManOfTheMatchEngine.resolveForMatch(card);
    const hash1 = card.momStats!.matchHash;

    card.firstInnings!.players[1].runs = 60;
    card.firstInnings!.players[1].balls = 30;
    const after = ManOfTheMatchEngine.resolveForMatch(card);
    expect(after).not.toBeNull();
    expect(card.momStats!.matchHash).not.toBe(hash1);
  });
});
