import { describe, expect, it } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import type { TeamPlayer } from '../domain/teams/playerIdentity';

/**
 * L1 (code-limitation bundle): FallOfWicket records now carry the
 * innings-positional ids of the dismissed batter and the credited
 * bowler, stamped by the engine at the moment of dismissal. The
 * profile modals and scoreboard previously probed for these fields
 * through any-casts on data nothing ever wrote; the fields are now
 * part of the FallOfWicket type and are actually populated. Legacy
 * records simply leave them undefined and readers fall back to
 * name matching, exactly as before.
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

describe('L1 fall-of-wicket identity stamping', () => {
  it('stamps the dismissed batter positional id and the credited bowler id', () => {
    const e = makeMatch();
    const inn = e.currentInnings;
    const strikerId = inn.players[inn.strikerIdx].id;
    const bowlerId = inn.bowlers[inn.currentBowlerIdx].id;
    e.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled', newBatsmanName: 'Shakib' });
    const fow = inn.fallOfWickets[inn.fallOfWickets.length - 1];
    expect(fow.player).toBe('Tamim');
    expect(fow.playerId).toBe(strikerId);
    expect(fow.bowlerId).toBe(bowlerId);
  });

  it('leaves bowlerId off a run out (not credited to the bowler)', () => {
    const e = makeMatch();
    const inn = e.currentInnings;
    e.scoreBall({
      runsScored: 1,
      isWicket: true,
      dismissalType: 'Run Out',
      fielderName: 'Babar',
      newBatsmanName: 'Shakib',
    });
    const fow = inn.fallOfWickets[inn.fallOfWickets.length - 1];
    expect(fow.playerId).toBeTruthy();
    expect(fow.bowlerId).toBeUndefined();
  });

  it('stamps the retiring batter id on a retired-hurt entry', () => {
    const e = makeMatch();
    const inn = e.currentInnings;
    const strikerId = inn.players[inn.strikerIdx].id;
    e.retirePlayer(true, 'Retire Hurt');
    const fow = inn.fallOfWickets[inn.fallOfWickets.length - 1];
    expect(fow.dismissalType).toBe('Retire Hurt');
    expect(fow.playerId).toBe(strikerId);
    expect(fow.bowlerId).toBeUndefined();
  });
});
