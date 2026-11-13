import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { wicketsTakenByBowler, isPenaltyToken } from '../domain/cricket/analytics/wicketsTaken';
import { overRunsScored } from '../domain/cricket/analytics/overLog';
import {
  buildBatsmanCardLayout,
  buildBowlerCardLayout,
  estTextWidth,
  type BatsmanCardInput,
  type BowlerCardInput,
} from '../features/scoring/share/ProfileShareCard';
import type { FallOfWicket } from '../domain/cricket/types';

/**
 * Day-audit regression tests (2026-11-10 evening): every verified
 * finding from the four-cluster review of the day's work gets a pin.
 */

const fow = (partial: Partial<FallOfWicket>): FallOfWicket =>
  ({
    player: 'Victim',
    dismissal: '',
    bowler: '',
    score: 50,
    wicket: 3,
    over: '7.2',
    ...partial,
  }) as FallOfWicket;

describe('wicketsTakenByBowler — one matcher for modal and card', () => {
  const naeem = { id: 'b_1_1', name: 'Naeem' };
  it('credits by bowlerId', () => {
    expect(wicketsTakenByBowler([fow({ bowlerId: 'b_1_1' })], naeem)).toHaveLength(1);
    expect(wicketsTakenByBowler([fow({ bowlerId: 'b_1_2' })], naeem)).toHaveLength(0);
  });
  it('credits by the stamped bowler name', () => {
    expect(wicketsTakenByBowler([fow({ bowler: 'Naeem' })], naeem)).toHaveLength(1);
  });
  it('credits the dismissal bowled-by slot (legacy text-only data)', () => {
    expect(wicketsTakenByBowler([fow({ dismissal: 'c Roman b Naeem' })], naeem)).toHaveLength(1);
    expect(wicketsTakenByBowler([fow({ dismissal: 'c & b Naeem' })], naeem)).toHaveLength(1);
    expect(wicketsTakenByBowler([fow({ dismissal: 'b Naeem' })], naeem)).toHaveLength(1);
  });
  it('does NOT credit fielders or run-out actors (the old substring bug)', () => {
    expect(wicketsTakenByBowler([fow({ dismissal: 'c Naeem b Rakibul' })], naeem)).toHaveLength(0);
    expect(wicketsTakenByBowler([fow({ dismissal: 'run out (Naeem)' })], naeem)).toHaveLength(0);
  });
  it('a short name does not substring-match a stranger', () => {
    const rana = { id: 'b_1_3', name: 'Rana' };
    expect(wicketsTakenByBowler([fow({ dismissal: 'c Ranajit b Shakib' })], rana)).toHaveLength(0);
    expect(wicketsTakenByBowler([fow({ dismissal: 'c X b Rana' })], rana)).toHaveLength(1);
  });
});

describe('isPenaltyToken', () => {
  it('matches only the penalty shapes', () => {
    expect(isPenaltyToken('+5P')).toBe(true);
    expect(isPenaltyToken('-5P')).toBe(true);
    expect(isPenaltyToken('Wd+3+W')).toBe(false);
    expect(isPenaltyToken('4')).toBe(false);
    expect(isPenaltyToken('B2')).toBe(false);
  });
});

describe('overRunsScored — mirrors the engine maiden accounting', () => {
  it('a bye/leg-bye over is NOT scoreless', () => {
    expect(overRunsScored(['B4', '0', '0', '0', '0', '0'])).toBe(4);
    expect(overRunsScored(['4', 'B2', '0', '0', '0', '0'])).toBe(6);
    expect(overRunsScored(['LB1', '0', '0', '0', '0', '0'])).toBe(1);
  });
  it('penalty entries never corrupt the total', () => {
    expect(overRunsScored(['1', '1', '1', '-5P'])).toBe(3);
    expect(overRunsScored(['4', '1', '-5P'])).toBe(5);
    expect(overRunsScored(['0', '0', '+5P'])).toBe(0);
  });
  it('run-out completed runs count; wickets do not', () => {
    expect(overRunsScored(['2+W', '0'])).toBe(2);
    expect(overRunsScored(['W', 'Out', '0'])).toBe(0);
  });
  it('wide/no-ball charges honour advanced settings', () => {
    expect(overRunsScored(['Wd', '0'])).toBe(1);
    expect(overRunsScored(['Wd', '0'], { wideRun: 2 })).toBe(2);
    expect(overRunsScored(['Nb1', '0'])).toBe(2);
    expect(overRunsScored(['Nb', '0'], { noBallRun: 3 })).toBe(3);
  });
  it('a true maiden over totals zero', () => {
    expect(overRunsScored(['0', '0', '0', '0', '0', '0'])).toBe(0);
  });
});

const batsmanBase: BatsmanCardInput = {
  name: 'Sanaj',
  hand: 'Right-hand Batsman',
  status: 'Not Out*',
  statusColor: '#34d399',
  crease: { text: '★ STRIKER', color: '#34d399' },
  position: 3,
  intent: 'Attacking',
  intentDescription: 'Dominant strokeplay putting regular pressure on bowlers',
  intentGradient: ['#7f1d2d', '#9f1239'],
  runs: 17,
  balls: 6,
  strikeRate: '283.3',
  fours: 2,
  sixes: 1,
  boundaryRuns: 14,
  boundaryPct: 82,
  runningRuns: 3,
  runningPct: 18,
  dotBalls: 1,
  dotPct: '17',
  scoringBalls: 5,
  scoringPct: '83',
  shotControl: '83',
  maxDotStreak: 1,
  encounters: [{ bowler: 'Naeem', runs: 11, balls: 4, econ: '16.50', sr: '275.0' }],
  ballLog: ['4', '1', '6', '0', '4', '2'],
};

const textOps = (layout: ReturnType<typeof buildBatsmanCardLayout>) =>
  layout.ops.filter((o) => o.kind === 'text') as Extract<(typeof layout.ops)[number], { kind: 'text' }>[];

describe('profile share card — audit fixes', () => {
  it('an ongoing over at 0 runs is NOT labelled MAIDEN; a completed one is', () => {
    const input: BowlerCardInput = {
      name: 'Naeem',
      oversText: '1.0',
      econText: '0.00',
      econColor: '#34d399',
      isCurrentlyBowling: true,
      ballsBowled: 6,
      maidens: 1,
      runs: 0,
      wickets: 0,
      dotBalls: 6,
      dotPct: '100',
      wides: 0,
      noBalls: 0,
      overs: [
        { label: 'Over 1', isOngoing: false, log: ['0', '0', '0', '0', '0', '0'], runs: 0, wickets: [] },
        { label: 'Cur Over', isOngoing: true, log: ['0', '0'], runs: 0, wickets: [] },
      ],
      wicketsTaken: [],
    };
    const texts = textOps(buildBowlerCardLayout(input)).map((o) => o.text);
    expect(texts.filter((t) => t === 'MAIDEN')).toHaveLength(1);
    expect(texts).toContain('0 runs');
  });

  it('a long dismissal status is truncated inside the card edge', () => {
    const layout = buildBatsmanCardLayout({
      ...batsmanBase,
      status: 'c Mohammad Rakibul Hasan b Naeem Islam',
      statusColor: '#f87171',
      crease: undefined,
    });
    // Meta row sits at identity top+96; header is 138 + panel offsets.
    for (const op of textOps(layout)) {
      if (op.align === 'left') {
        const w = estTextWidth(op.text, parseInt(/(\d+)px/.exec(op.font)?.[1] || '25', 10));
        expect(op.x + w).toBeLessThanOrEqual(1080 - 36 + 40); // panel edge + tolerance
      }
    }
    const status = textOps(layout).find((o) => o.text.includes('Rakibul'));
    expect(status).toBeDefined();
    expect(status!.text.endsWith('…')).toBe(true);
  });

  it('a yet-to-bat player gets no intent banner and no dot strip', () => {
    const layout = buildBatsmanCardLayout({ ...batsmanBase, balls: 0, ballLog: [], encounters: [] });
    const texts = textOps(layout).map((o) => o.text);
    expect(texts).not.toContain('BATTING INTENT');
    expect(texts).not.toContain('DOT BALL & SHOT CONTROL');
    expect(texts).toContain('RUN PRODUCTION SOURCES');
  });

  it('the position chip is rendered beside the name', () => {
    const texts = textOps(buildBatsmanCardLayout(batsmanBase)).map((o) => o.text);
    expect(texts).toContain('#3');
  });

  it('the Running legend dot clears a three-digit running total', () => {
    const layout = buildBatsmanCardLayout({
      ...batsmanBase,
      runs: 150,
      boundaryRuns: 45,
      boundaryPct: 30,
      runningRuns: 105,
      runningPct: 70,
    });
    const dot = layout.ops.find(
      (o) => o.kind === 'circle' && o.fill === '#2563eb'
    ) as Extract<(typeof layout.ops)[number], { kind: 'circle' }> | undefined;
    expect(dot).toBeDefined();
    const runningText = 'Running 105r (70%)';
    const textStart = 84 + 912 - estTextWidth(runningText, 24, 600);
    expect(dot!.cx + 8).toBeLessThan(textStart);
  });

  it('the bowler pressure strip hides when a bowled bowler has no over data', () => {
    const base: BowlerCardInput = {
      name: 'Legacy',
      oversText: '4.0',
      econText: '7.50',
      econColor: '#fbbf24',
      isCurrentlyBowling: false,
      ballsBowled: 24,
      maidens: 0,
      runs: 30,
      wickets: 1,
      dotBalls: 0,
      dotPct: '0',
      wides: 0,
      noBalls: 0,
      overs: [],
      wicketsTaken: [],
    };
    const hidden = textOps(buildBowlerCardLayout(base)).map((o) => o.text);
    expect(hidden).not.toContain('DOT BALLS');
    const fresh = textOps(buildBowlerCardLayout({ ...base, ballsBowled: 0, oversText: '0.0' })).map((o) => o.text);
    expect(fresh).toContain('DOT BALLS');
  });
});

describe('source pins — audit fixes stay in place', () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
  it('bowler modal: MAIDEN gated on completion + shared matchers wired', () => {
    const src = read('src/components/modals/BowlerProfileModal.tsx');
    expect(src).toContain('overRuns === 0 && !ov.isOngoing');
    expect(src).toContain('wicketsTakenByBowler');
    expect(src).toContain('hasOverData');
    expect(src).toContain('countBowlerDotBallsFromOvers(allOvers), ballsBowled');
    expect(src).toContain("outcome === 'failed'");
  });
  it('batsman modal: analytics gated on balls faced', () => {
    const src = read('src/components/modals/BatsmanProfileModal.tsx');
    expect(src.split('{balls > 0 && (<>').length - 1).toBe(2);
    expect(src).toContain("outcome === 'failed'");
  });
  it('score page: chase openers collect batting hands', () => {
    const src = read('src/app/matches/score/[matchId]/client.tsx');
    expect(src).toContain('inn2StrikerHand');
    expect(src).toContain('inn2NonStrikerHand');
  });
  it('summary page: modals receive the selected player’s own innings', () => {
    const src = read('src/app/matches/summary/[matchId]/client.tsx');
    expect(src).toContain('summaryBatsmanInnings?.fallOfWickets');
    expect(src).toContain('summaryBowlerInnings?.fallOfWickets');
  });
  it('bowler grid: subtext wraps, tracks widened', () => {
    const src = read('src/components/modals/PlayerSelectionModal.tsx');
    expect(src).toContain('1.75rem_1.9rem_1.9rem_2.75rem_5.3rem');
    expect(src).toContain('flex flex-wrap items-center gap-x-1 gap-y-0.5');
  });
});
