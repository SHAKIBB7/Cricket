/**
 * @vitest-environment jsdom
 *
 * Feature run — tournaments schedule/bracket + platform quality:
 *  A: round-robin fixture generation (circle method), top-4
 *     knockout bracket generation, match linking and bracket
 *     advancement (src/features/tournaments/fixtures.ts).
 *  B1: the in-house error reporter's ring buffer behaviour
 *     (src/lib/errorReporter.ts) and its profile section render.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { MatchScorecard } from '@/domain/cricket/types';
import {
  generateRoundRobinFixtures,
  generateKnockoutFixtures,
  linkScheduleToMatches,
  resolveKnockoutAdvancement,
  resolveSchedule,
  WINNER_SF1_PLACEHOLDER,
  WINNER_SF2_PLACEHOLDER,
  type ScheduleFixture,
} from '@/features/tournaments/fixtures';
import {
  reportError,
  getErrorLog,
  clearErrorLog,
  installErrorHandlers,
  ERROR_LOG_STORAGE_KEY,
  MAX_ERROR_LOG_ENTRIES,
} from '@/lib/errorReporter';
import { ErrorLogSection } from '@/components/profile/ErrorLogSection';
import { renderToHtml } from './helpers/render-dom';

function pairingKey(f: ScheduleFixture): string {
  return [f.homeTeam, f.awayTeam].sort().join(' vs ');
}

function playedPairings(fixtures: ScheduleFixture[]): string[] {
  return fixtures.filter((f) => f.awayTeam).map(pairingKey).sort();
}

function allPairings(teams: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      out.push([teams[i], teams[j]].sort().join(' vs '));
    }
  }
  return out.sort();
}

describe('generateRoundRobinFixtures (circle method)', () => {
  it('4 teams: 3 rounds, 6 fixtures, every pairing exactly once', () => {
    const teams = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
    const fixtures = generateRoundRobinFixtures(teams, { idPrefix: 't1' });

    expect(fixtures).toHaveLength(6);
    expect(new Set(fixtures.map((f) => f.round))).toEqual(new Set([1, 2, 3]));
    for (const round of [1, 2, 3]) {
      expect(fixtures.filter((f) => f.round === round)).toHaveLength(2);
    }
    expect(playedPairings(fixtures)).toEqual(allPairings(teams));
    expect(fixtures.every((f) => f.stage === 'LEAGUE')).toBe(true);
    expect(fixtures.every((f) => f.status === 'SCHEDULED')).toBe(true);
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(fixtures.length);
    // No team plays itself or twice in one round.
    for (const round of [1, 2, 3]) {
      const inRound = fixtures.filter((f) => f.round === round);
      const names = inRound.flatMap((f) => [f.homeTeam, f.awayTeam]);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('5 teams: 5 rounds, 10 matches + one bye per team', () => {
    const teams = ['A', 'B', 'C', 'D', 'E'];
    const fixtures = generateRoundRobinFixtures(teams);

    expect(fixtures.filter((f) => f.awayTeam)).toHaveLength(10);
    expect(new Set(fixtures.map((f) => f.round))).toEqual(
      new Set([1, 2, 3, 4, 5])
    );
    expect(playedPairings(fixtures)).toEqual(allPairings(teams));

    const byes = fixtures.filter((f) => !f.awayTeam);
    expect(byes).toHaveLength(5);
    expect(byes.map((f) => f.homeTeam).sort()).toEqual([...teams].sort());
  });

  it('6 teams: 5 rounds, 15 fixtures, 3 per round', () => {
    const teams = ['A', 'B', 'C', 'D', 'E', 'F'];
    const fixtures = generateRoundRobinFixtures(teams);

    expect(fixtures).toHaveLength(15);
    for (let round = 1; round <= 5; round++) {
      expect(fixtures.filter((f) => f.round === round)).toHaveLength(3);
    }
    expect(playedPairings(fixtures)).toEqual(allPairings(teams));
  });

  it('honours startRound and rejects fewer than 2 teams', () => {
    const fixtures = generateRoundRobinFixtures(['A', 'B'], { startRound: 4 });
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].round).toBe(4);
    expect(generateRoundRobinFixtures(['Solo'])).toEqual([]);
    expect(generateRoundRobinFixtures([])).toEqual([]);
  });
});

describe('knockout bracket', () => {
  const seeds = ['Lions', 'Tigers', 'Bears', 'Wolves'];

  it('generates SF 1v4, SF 2v3 and a placeholder Final', () => {
    const bracket = generateKnockoutFixtures(seeds, { startRound: 6 });
    expect(bracket).toHaveLength(3);
    const [sf1, sf2, final] = bracket;
    expect(sf1.stage).toBe('SEMI');
    expect(sf1.homeTeam).toBe('Lions');
    expect(sf1.awayTeam).toBe('Wolves');
    expect(sf2.homeTeam).toBe('Tigers');
    expect(sf2.awayTeam).toBe('Bears');
    expect(final.stage).toBe('FINAL');
    expect(final.homeTeam).toBe(WINNER_SF1_PLACEHOLDER);
    expect(final.awayTeam).toBe(WINNER_SF2_PLACEHOLDER);
    expect(final.round).toBe(7);
    expect(generateKnockoutFixtures(['A', 'B', 'C'])).toEqual([]);
  });

  it('advances semi winners into the Final only when both are known', () => {
    let bracket = generateKnockoutFixtures(seeds);
    bracket = bracket.map((f) =>
      f.id.endsWith('-sf1') ? { ...f, winner: 'Lions', status: 'COMPLETED' as const } : f
    );
    const partial = resolveKnockoutAdvancement(bracket);
    expect(partial.find((f) => f.stage === 'FINAL')?.homeTeam).toBe(
      WINNER_SF1_PLACEHOLDER
    );

    bracket = bracket.map((f) =>
      f.id.endsWith('-sf2') ? { ...f, winner: 'Bears', status: 'COMPLETED' as const } : f
    );
    const resolved = resolveKnockoutAdvancement(bracket);
    const final = resolved.find((f) => f.stage === 'FINAL');
    expect(final?.homeTeam).toBe('Lions');
    expect(final?.awayTeam).toBe('Bears');
  });
});

function fakeMatch(partial: Partial<MatchScorecard>): MatchScorecard {
  return {
    id: 'm-1',
    teamA: 'Lions',
    teamB: 'Wolves',
    status: 'COMPLETED',
    winner: 'Lions',
    result: 'Lions won by 5 wickets',
    createdAt: '2026-11-09T10:00:00.000Z',
    advancedSettings: { tournamentId: 'tourn-1' },
    ...partial,
  } as MatchScorecard;
}

describe('match linking', () => {
  it('links a completed match by pairing (either orientation) and fills the result', () => {
    const bracket = generateKnockoutFixtures(['Lions', 'Tigers', 'Bears', 'Wolves'], {
      idPrefix: 'sched-tourn-1',
    });
    // Match recorded with the pairing reversed (Wolves listed first).
    const match = fakeMatch({ teamA: 'Wolves', teamB: 'Lions' });
    const linked = linkScheduleToMatches(bracket, [match], 'tourn-1');
    const sf1 = linked.find((f) => f.id.endsWith('-sf1'));
    expect(sf1?.matchId).toBe('m-1');
    expect(sf1?.status).toBe('COMPLETED');
    expect(sf1?.winner).toBe('Lions');
    expect(sf1?.resultText).toBe('Lions won by 5 wickets');
  });

  it('ignores matches from other tournaments and never double-claims', () => {
    const fixtures = generateRoundRobinFixtures(['Lions', 'Wolves'], {
      idPrefix: 'x',
    });
    const foreign = fakeMatch({
      advancedSettings: { tournamentId: 'other' } as MatchScorecard['advancedSettings'],
    });
    expect(linkScheduleToMatches(fixtures, [foreign], 'tourn-1')[0].matchId).toBeUndefined();
  });

  it('resolveSchedule advances the bracket from linked semi results in one pass', () => {
    const bracket = generateKnockoutFixtures(['Lions', 'Tigers', 'Bears', 'Wolves'], {
      idPrefix: 'sched-tourn-1',
    });
    const matches = [
      fakeMatch({ id: 'm-sf1' }),
      fakeMatch({
        id: 'm-sf2',
        teamA: 'Tigers',
        teamB: 'Bears',
        winner: 'Bears',
        result: 'Bears won by 12 runs',
        createdAt: '2026-11-09T11:00:00.000Z',
      }),
    ];
    const resolved = resolveSchedule(bracket, matches, 'tourn-1');
    const final = resolved.find((f) => f.stage === 'FINAL');
    expect(final?.homeTeam).toBe('Lions');
    expect(final?.awayTeam).toBe('Bears');
  });
});

describe('errorReporter ring buffer', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearErrorLog();
  });
  afterEach(() => {
    clearErrorLog();
  });

  it('records errors newest-first with source and persists them', () => {
    reportError(new Error('first boom'), 'test');
    reportError('second boom', 'manual');
    const log = getErrorLog();
    expect(log).toHaveLength(2);
    expect(log[0].message).toBe('second boom');
    expect(log[1].message).toBe('first boom');
    expect(log[1].source).toBe('test');
    expect(log[1].stack).toContain('first boom');

    const persisted = JSON.parse(
      window.localStorage.getItem(ERROR_LOG_STORAGE_KEY) || '[]'
    );
    expect(persisted).toHaveLength(2);
  });

  it('caps the buffer at MAX entries, keeping the newest', () => {
    for (let i = 0; i < MAX_ERROR_LOG_ENTRIES + 10; i++) {
      reportError(new Error(`err-${i}`), 'flood');
    }
    const log = getErrorLog();
    expect(log).toHaveLength(MAX_ERROR_LOG_ENTRIES);
    expect(log[0].message).toBe(`err-${MAX_ERROR_LOG_ENTRIES + 9}`);
  });

  it('clearErrorLog empties the buffer and storage', () => {
    reportError(new Error('to clear'), 'test');
    clearErrorLog();
    expect(getErrorLog()).toEqual([]);
    expect(window.localStorage.getItem(ERROR_LOG_STORAGE_KEY)).toBeNull();
  });

  it('global handlers capture window errors', () => {
    const uninstall = installErrorHandlers();
    window.dispatchEvent(new ErrorEvent('error', { message: 'kaboom' }));
    const log = getErrorLog();
    expect(log.some((e) => e.source === 'window.onerror')).toBe(true);
    uninstall();
  });
});

describe('ErrorLogSection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearErrorLog();
  });

  it('renders captured errors with a count', () => {
    reportError(new Error('render me'), 'test');
    reportError(new Error('me too'), 'test');
    const html = renderToHtml(<ErrorLogSection />);
    expect(html).toContain('Error Log (2)');
    expect(html).toContain('render me');
    expect(html).toContain('me too');
  });

  it('renders the empty state when nothing was captured', () => {
    const html = renderToHtml(<ErrorLogSection />);
    expect(html).toContain('Error Log (0)');
    expect(html).toContain('No errors captured');
  });
});
