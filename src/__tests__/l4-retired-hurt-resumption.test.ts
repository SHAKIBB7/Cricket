import { describe, expect, it } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { isRetiredHurt } from '../domain/cricket/battingCard';
import type { TeamPlayer } from '../domain/teams/playerIdentity';

/**
 * L4 (code-limitation bundle): a retired-hurt batter may resume his
 * innings when a wicket falls (Laws of Cricket). Before L4 the
 * score page blocked the selection, and picking the name anywhere
 * renamed a fresh slot — splitting one innings across two records.
 * Resumption now reuses the ORIGINAL Player record through both
 * flows: the OutModal's newBatsmanName on the wicket ball, and the
 * post-wicket batter selector (engine.resumeRetiredBatter).
 */

const squadA: TeamPlayer[] = [
  { id: 'pl_tamim', name: 'Tamim' },
  { id: 'pl_litton', name: 'Litton' },
  { id: 'pl_shakib', name: 'Shakib' },
  { id: 'pl_mushfiq', name: 'Mushfiq' },
  { id: 'pl_mahmudullah', name: 'Mahmudullah' },
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

/** Tamim 6 off 2, retires hurt; the scorer names the replacement
 * Shakib through the selector (renamePlayer), as the app does —
 * engine slots beyond the openers start as generic placeholders. */
function matchWithRetiredHurt() {
  const e = makeMatch();
  e.scoreBall({ runsScored: 4 });
  e.scoreBall({ runsScored: 2 });
  const ok = e.retirePlayer(true, 'Retire Hurt');
  expect(ok).toBe(true);
  const inn = e.currentInnings;
  expect(isRetiredHurt(inn.players[0])).toBe(true);
  const placeholder = inn.players[inn.strikerIdx];
  expect(e.renamePlayer(placeholder.id, 'Shakib').success).toBe(true);
  expect(inn.players[inn.strikerIdx].name).toBe('Shakib');
  return e;
}

describe('L4 retired-hurt resumption', () => {
  it('OutModal flow: naming the retired-hurt batter on the wicket ball resumes his record', () => {
    const e = matchWithRetiredHurt();
    const inn = e.currentInnings;
    const nextBefore = inn.nextPlayerIdx;

    e.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled', isStrikerOut: true, newBatsmanName: 'Tamim' });

    // The striker is Tamim's ORIGINAL record (slot 0), figures intact.
    expect(inn.strikerIdx).toBe(0);
    const tamim = inn.players[0];
    expect(tamim.name).toBe('Tamim');
    expect(tamim.runs).toBe(6);
    expect(tamim.balls).toBe(2);
    expect(tamim.dismissalType).toBeUndefined();
    expect(tamim.isDismissed).toBe(false);
    // No fresh slot was consumed and no duplicate record exists.
    expect(inn.nextPlayerIdx).toBe(nextBefore);
    expect(inn.players.filter((p) => p.name.startsWith('Tamim')).length).toBe(1);

    // He keeps batting on the same record.
    e.scoreBall({ runsScored: 4 });
    expect(inn.players[0].runs).toBe(10);
    expect(inn.players[0].balls).toBe(3);
  });

  it('selector flow: resumeRetiredBatter swaps the fresh placeholder back out', () => {
    const e = matchWithRetiredHurt();
    const inn = e.currentInnings;
    // Wicket falls with no named incoming batter: a fresh, still
    // unnamed placeholder slot comes in.
    e.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled', isStrikerOut: true });
    const placeholderIdx = inn.strikerIdx;
    const placeholderName = inn.players[placeholderIdx].name;
    expect(inn.players[placeholderIdx].balls).toBe(0);

    expect(e.canResumeRetiredBatter(true)).toBe(true);
    const res = e.resumeRetiredBatter('Tamim', true);
    expect(res.success).toBe(true);

    expect(inn.strikerIdx).toBe(0);
    expect(inn.players[0].runs).toBe(6);
    expect(isRetiredHurt(inn.players[0])).toBe(false);
    // The placeholder slot is the next unused slot again, untouched.
    expect(inn.nextPlayerIdx).toBe(placeholderIdx);
    expect(inn.players[placeholderIdx].name).toBe(placeholderName);
    expect(inn.players[placeholderIdx].balls).toBe(0);

    // The next wicket consumes that same slot normally.
    e.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled', isStrikerOut: true });
    expect(inn.strikerIdx).toBe(placeholderIdx);
  });

  it('refuses resumption once the placeholder has batted, and for unknown names', () => {
    const e = matchWithRetiredHurt();
    // Shakib (the retirement replacement) faces a ball: no wicket has
    // just fallen at his end any more.
    e.scoreBall({ runsScored: 1 });
    expect(e.canResumeRetiredBatter(true)).toBe(false);
    const res = e.resumeRetiredBatter('Tamim', true);
    expect(res.success).toBe(false);
    expect(e.resumeRetiredBatter('Nobody', true).success).toBe(false);
    // Tamim is still simply retired hurt.
    expect(isRetiredHurt(e.currentInnings.players[0])).toBe(true);
  });

  it('retired OUT is not resumable: the name on a wicket ball opens a fresh record', () => {
    const e = makeMatch();
    e.scoreBall({ runsScored: 4 });
    e.retirePlayer(true, 'Retire Out');
    const inn = e.currentInnings;
    e.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled', isStrikerOut: true, newBatsmanName: 'Tamim' });
    const records = inn.players.filter((p) => p.name.startsWith('Tamim'));
    expect(records.length).toBe(2);
    expect(records[0].isDismissed).toBe(true);
    expect(inn.players[inn.strikerIdx].runs).toBe(0);
  });

  it('undo after a selector-flow resumption restores the placeholder state', () => {
    const e = matchWithRetiredHurt();
    const inn = e.currentInnings;
    e.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled', isStrikerOut: true });
    const placeholderIdx = inn.strikerIdx;
    expect(e.resumeRetiredBatter('Tamim', true).success).toBe(true);
    expect(inn.strikerIdx).toBe(0);
    expect(e.undo()).toBe(true);
    // undo() restores a snapshot object — re-read the live innings.
    const restored = e.currentInnings;
    expect(restored.strikerIdx).toBe(placeholderIdx);
    expect(isRetiredHurt(restored.players[0])).toBe(true);
  });

  it('event replay reproduces resumption exactly (both flows)', () => {
    const e = matchWithRetiredHurt();
    e.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled', isStrikerOut: true, newBatsmanName: 'Tamim' });
    e.scoreBall({ runsScored: 6 });
    const replayed = EventSourcedMatchEngine.fromEvents(e.events);
    const a = e.currentInnings;
    const b = replayed.currentInnings;
    expect(b.players[b.strikerIdx].name).toBe('Tamim');
    expect(b.players[0].runs).toBe(a.players[0].runs);
    expect(b.players[0].balls).toBe(a.players[0].balls);
    expect(b.nextPlayerIdx).toBe(a.nextPlayerIdx);
    expect(b.totalRuns).toBe(a.totalRuns);

    const e2 = matchWithRetiredHurt();
    e2.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled', isStrikerOut: true });
    expect(e2.resumeRetiredBatter('Tamim', true).success).toBe(true);
    const replayed2 = EventSourcedMatchEngine.fromEvents(e2.events);
    const c = replayed2.currentInnings;
    expect(c.players[c.strikerIdx].name).toBe('Tamim');
    expect(c.players[0].runs).toBe(6);
    expect(c.nextPlayerIdx).toBe(e2.currentInnings.nextPlayerIdx);
  });
});
