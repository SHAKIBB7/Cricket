import { describe, expect, it } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { normalizeSquadPlayers, type TeamPlayer } from '../domain/teams/playerIdentity';

/**
 * F9-β3: stable identities thread from saved squads into innings
 * records. Openers, incoming batters and bowlers who belong to a
 * squad are stamped with their playerId; guests and legacy matches
 * stay unstamped; the positional per-innings `id` is untouched.
 */
const squadA: TeamPlayer[] = [
  { id: 'pl_tamim', name: 'Tamim' },
  { id: 'pl_litton', name: 'Litton' },
  { id: 'pl_shakib', name: 'Shakib' },
  { id: 'pl_mushfiq', name: 'Mushfiq' },
];
const squadB: TeamPlayer[] = [
  { id: 'pl_babar', name: 'Babar' },
  { id: 'pl_rizwan', name: 'Rizwan' },
  { id: 'pl_shaheen', name: 'Shaheen' },
  { id: 'pl_haris', name: 'Haris' },
];

function makeMatch() {
  return new EventSourcedMatchEngine({
    teamA: 'Tigers',
    teamB: 'Lions',
    tossWinner: 'Tigers',
    tossDecision: 'Batting',
    totalOvers: 5,
    strikerName: 'Tamim',
    nonStrikerName: 'Litton',
    bowlerName: 'Shaheen',
    advancedSettings: { players: 11, teamASquad: squadA, teamBSquad: squadB },
  });
}

describe('β3 threading', () => {
  it('stamps openers and the opening bowler from the squads', () => {
    const e = makeMatch();
    const inn = e.currentInnings;
    expect(inn.players[0]).toMatchObject({ name: 'Tamim', playerId: 'pl_tamim' });
    expect(inn.players[1]).toMatchObject({ name: 'Litton', playerId: 'pl_litton' });
    expect(inn.bowlers[0]).toMatchObject({ name: 'Shaheen', playerId: 'pl_shaheen' });
    // Positional ids are unchanged.
    expect(inn.players[0].id).toBe('p_1_1');
    expect(inn.bowlers[0].id).toBe('b_1_1');
  });

  it('stamps an incoming batter who is a squad member; guests stay unstamped', () => {
    const e = makeMatch();
    e.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled', newBatsmanName: 'Shakib' });
    const shakib = e.currentInnings.players.find((p) => p.name === 'Shakib');
    expect(shakib?.playerId).toBe('pl_shakib');

    const e2 = makeMatch();
    e2.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled', newBatsmanName: 'Guest Player' });
    const guest = e2.currentInnings.players.find((p) => p.name === 'Guest Player');
    expect(guest).toBeDefined();
    expect(guest?.playerId).toBeUndefined();
  });

  it('stamps bowler changes from the bowling squad', () => {
    const e = makeMatch();
    const res = e.changeBowler('Haris');
    expect(res.success).toBe(true);
    const haris = e.currentInnings.bowlers.find((b) => b.name === 'Haris');
    expect(haris?.playerId).toBe('pl_haris');

    const res2 = e.changeBowler('Mystery Guest');
    expect(res2.success).toBe(true);
    const guest = e.currentInnings.bowlers.find((b) => b.name === 'Mystery Guest');
    expect(guest?.playerId).toBeUndefined();
  });

  it('second innings openers are stamped from the other squad', () => {
    const e = makeMatch();
    e.startSecondInnings('Babar', 'Rizwan', 'Shakib');
    const inn2 = e.currentInnings;
    expect(inn2.inningsNumber).toBe(2);
    expect(inn2.players[0]).toMatchObject({ name: 'Babar', playerId: 'pl_babar' });
    expect(inn2.players[1]).toMatchObject({ name: 'Rizwan', playerId: 'pl_rizwan' });
    expect(inn2.bowlers[0]).toMatchObject({ name: 'Shakib', playerId: 'pl_shakib' });
  });

  it('scorecard round-trip preserves squad objects and stamped playerIds', () => {
    const e = makeMatch();
    e.scoreBall({ runsScored: 4 });
    const card = e.toScorecard();
    expect(card.teamASquad).toEqual(squadA);
    expect(card.firstInnings?.players[0].playerId).toBe('pl_tamim');

    const restored = EventSourcedMatchEngine.fromScorecard(card, e.events);
    expect(restored.currentInnings.players[0].playerId).toBe('pl_tamim');
    expect(restored.advancedSettings.teamBSquad).toEqual(squadB);
  });

  it('legacy string squads normalise without inventing identities', () => {
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
        // Stored scorecards from before β3 carry bare names.
        teamASquad: ['Tamim', 'Litton'] as unknown as TeamPlayer[],
        teamBSquad: ['Shaheen'] as unknown as TeamPlayer[],
      },
    });
    expect(e.advancedSettings.teamASquad).toEqual([
      { id: '', name: 'Tamim' },
      { id: '', name: 'Litton' },
    ]);
    expect(e.currentInnings.players[0].playerId).toBeUndefined();
    expect(e.currentInnings.bowlers[0].playerId).toBeUndefined();
    // The match still scores normally.
    e.scoreBall({ runsScored: 6 });
    expect(e.currentInnings.totalRuns).toBe(6);
  });
});

describe('normalizeSquadPlayers', () => {
  it('keeps object ids, never mints ids for bare names', () => {
    expect(normalizeSquadPlayers([{ id: 'pl_x', name: 'A' }, 'B', { name: 'C' }, '', null])).toEqual([
      { id: 'pl_x', name: 'A' },
      { id: '', name: 'B' },
      { id: '', name: 'C' },
    ]);
    expect(normalizeSquadPlayers(undefined)).toEqual([]);
  });
});
