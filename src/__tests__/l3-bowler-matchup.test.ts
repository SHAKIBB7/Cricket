import { describe, expect, it } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import {
  bowlerMatchupKey,
  bowlerNamesById,
  matchupBreakdown,
  matchupKeyBelongsToBowler,
} from '../domain/cricket/analytics/bowlerMatchup';
import { buildPlayerIdentityIndex } from '../domain/cricket/analytics/playerIdentityIndex';
import type { TeamPlayer } from '../domain/teams/playerIdentity';
import type { MatchScorecard, Player } from '../domain/cricket/types';

/**
 * L3 (code-limitation bundle): Player.bowlersFaced / runsVsBowler are
 * now keyed by the bowler's stable playerId when the bowler carries
 * one, with the historical name key as the fallback for guests and
 * legacy records. Readers understand both shapes, so a renamed bowler
 * keeps one unified matchup line and two same-named bowlers no longer
 * merge. No stored data is migrated.
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

function barePlayer(overrides: Partial<Player>): Player {
  return {
    id: 'p_x',
    name: 'Batter',
    battingHand: 'Right-hand Batsman',
    battingPosition: '1',
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    dotBalls: 0,
    ballLog: [],
    bowlersFaced: {},
    runsVsBowler: {},
    isDismissed: false,
    ...overrides,
  } as Player;
}

describe('L3 bowler matchup re-keying', () => {
  it('keys the write helper by stable id, falling back to the name', () => {
    expect(bowlerMatchupKey({ playerId: 'pl_shaheen', name: 'Shaheen' })).toBe('pl_shaheen');
    expect(bowlerMatchupKey({ name: 'Guest' })).toBe('Guest');
    expect(bowlerMatchupKey({ playerId: '', name: 'Guest' })).toBe('Guest');
  });

  it('engine writes matchup entries under the bowler stable id', () => {
    const e = makeMatch();
    e.scoreBall({ runsScored: 4 });
    e.scoreBall({ runsScored: 2 });
    const striker = e.currentInnings.players[e.currentInnings.strikerIdx];
    expect(striker.bowlersFaced).toEqual({ pl_shaheen: 2 });
    expect(striker.runsVsBowler).toEqual({ pl_shaheen: 6 });
  });

  it('engine writes name keys for a bowler without a stable id', () => {
    const e = new EventSourcedMatchEngine({
      teamA: 'Tigers',
      teamB: 'Lions',
      tossWinner: 'Tigers',
      tossDecision: 'Batting',
      totalOvers: 5,
      strikerName: 'Tamim',
      nonStrikerName: 'Litton',
      bowlerName: 'Walk-in Bowler',
    });
    e.scoreBall({ runsScored: 2 });
    const striker = e.currentInnings.players[e.currentInnings.strikerIdx];
    expect(striker.bowlersFaced).toEqual({ 'Walk-in Bowler': 1 });
    expect(striker.runsVsBowler).toEqual({ 'Walk-in Bowler': 2 });
  });

  it('a mid-match bowler rename leaves id-keyed entries intact and resolvable', () => {
    const e = makeMatch();
    e.scoreBall({ runsScored: 4 });
    const inn = e.currentInnings;
    const bowler = inn.bowlers[inn.currentBowlerIdx];
    e.renamePlayer(bowler.id, 'Shaheen Afridi');
    const striker = inn.players[inn.strikerIdx];
    // The entry stayed under the stable id (no name re-key happened)…
    expect(Object.keys(striker.bowlersFaced)).toEqual(['pl_shaheen']);
    // …and the breakdown resolves it to the CURRENT name.
    const rows = matchupBreakdown(striker, bowlerNamesById([inn]));
    expect(rows).toEqual([{ label: 'Shaheen Afridi', balls: 1, runs: 4 }]);
  });

  it('breakdown merges id-keyed and legacy name-keyed entries for one bowler', () => {
    const p = barePlayer({
      bowlersFaced: { pl_shaheen: 6, Shaheen: 4, 'Babar Azam': 3 },
      runsVsBowler: { pl_shaheen: 10, Shaheen: 5, 'Babar Azam': 7 },
    });
    const rows = matchupBreakdown(p, { pl_shaheen: 'Shaheen' });
    expect(rows).toEqual([
      { label: 'Shaheen', balls: 10, runs: 15 },
      { label: 'Babar Azam', balls: 3, runs: 7 },
    ]);
  });

  it('H2H predicate matches id keys through identity-index name variants', () => {
    const card = {
      id: 'm1',
      firstInnings: {
        players: [],
        bowlers: [{ id: 'b_1_1', name: 'Shaheen Afridi', playerId: 'pl_shaheen' }],
      },
      secondInnings: { players: [], bowlers: [] },
    } as unknown as MatchScorecard;
    const index = buildPlayerIdentityIndex([card]);
    // The id was only ever seen under the NEW name; both spellings match.
    expect(matchupKeyBelongsToBowler('pl_shaheen', 'Shaheen Afridi', index)).toBe(true);
    expect(matchupKeyBelongsToBowler('pl_shaheen', 'Shaheen', index)).toBe(false);
    // Legacy name keys keep the exact cleaned-name behaviour.
    expect(matchupKeyBelongsToBowler('Shaheen', 'Shaheen', index)).toBe(true);
    expect(matchupKeyBelongsToBowler('Shaheen', 'Shaheen Afridi', index)).toBe(false);
  });
});
