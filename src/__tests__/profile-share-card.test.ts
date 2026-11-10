/**
 * Profile share cards (TAIMUR, 2026-11-10): the layout builders
 * are pure, so the full card content — every section of both
 * profiles in one image — is pinned here without a canvas.
 */
import { describe, it, expect } from 'vitest';
import {
  buildBatsmanCardLayout,
  buildBowlerCardLayout,
  ballTokenColors,
  profileCardFilename,
  type BatsmanCardInput,
  type BowlerCardInput,
  type CardOp,
} from '@/features/scoring/share/ProfileShareCard';

const texts = (ops: CardOp[]) =>
  ops.filter((o): o is Extract<CardOp, { kind: 'text' }> => o.kind === 'text').map((o) => o.text);
const circles = (ops: CardOp[]) => ops.filter((o) => o.kind === 'circle');

const batsmanInput: BatsmanCardInput = {
  name: 'Sanaj',
  hand: 'Right-hand Batsman',
  status: 'Not Out*',
  statusColor: '#34d399',
  crease: { text: '★ STRIKER', color: '#34d399' },
  context: 'Thunder Storm vs Hungry Eleven • 2nd Innings',
  intent: 'Attacking',
  intentDescription: 'Dominant strokeplay putting regular pressure on bowlers',
  intentGradient: ['#7f1d2d', '#9f1239'],
  runs: 17,
  balls: 6,
  strikeRate: '283.3',
  fours: 2,
  sixes: 1,
  boundaryRuns: 14,
  boundaryPct: 82.4,
  runningRuns: 3,
  runningPct: 17.6,
  dotBalls: 1,
  dotPct: '17',
  scoringBalls: 5,
  scoringPct: '83',
  shotControl: '83',
  maxDotStreak: 1,
  encounters: [
    { bowler: 'Naeem', runs: 11, balls: 4, econ: '16.50', sr: '275.0' },
    { bowler: 'Rakibul', runs: 6, balls: 2, econ: '18.00', sr: '300.0' },
  ],
  ballLog: ['4', '1', '6', '0', '4', '2'],
};

const bowlerInput: BowlerCardInput = {
  name: 'Naeem',
  context: 'Thunder Storm vs Hungry Eleven • 2nd Innings',
  oversText: '3.3',
  econText: '6.00',
  econColor: '#34d399',
  isCurrentlyBowling: true,
  ballsBowled: 21,
  maidens: 1,
  runs: 21,
  wickets: 1,
  dotBalls: 11,
  dotPct: '52',
  wides: 1,
  noBalls: 0,
  overs: [
    { label: 'Over 1', isOngoing: false, log: ['0', '4', '1', '4', 'W', '1'], runs: 10, wickets: [{ player: 'Roman', detail: '2-18, 0.5 ov' }] },
    { label: 'Over 2', isOngoing: false, log: ['0', '0', '0', '0', '0', '0'], runs: 0, wickets: [] },
    { label: 'Cur Over', isOngoing: true, log: ['0', '1', '1'], runs: 2, wickets: [] },
  ],
  wicketsTaken: [{ player: 'Roman', detail: '1-18 (0.5 ov)' }],
};

describe('buildBatsmanCardLayout', () => {
  const layout = buildBatsmanCardLayout(batsmanInput);
  const all = texts(layout.ops);

  it('is a single portrait card taller than wide', () => {
    expect(layout.width).toBe(1080);
    expect(layout.height).toBeGreaterThan(layout.width);
  });

  it('carries brand, context, identity and status', () => {
    expect(all).toContain('CRICKET SCORER PRO');
    // Long contexts drop the innings suffix rather than ellipsizing
    // mid-word (cardHeader) — the teams line is what survives here.
    expect(all).toContain('Thunder Storm vs Hungry Eleven');
    expect(all).toContain('SANAJ');
    expect(all).toContain('★ STRIKER');
    expect(all).toContain('Not Out*');
  });

  it('includes the intent banner and every stat section', () => {
    expect(all).toContain('BATTING INTENT');
    expect(all).toContain('ATTACKING');
    expect(all).toContain('STRIKE RATE');
    expect(all).toContain('283.3');
    expect(all).toContain('RUN PRODUCTION SOURCES');
    expect(all).toContain('Boundaries 14r (82%)');
    expect(all).toContain('DOT BALL & SHOT CONTROL');
    expect(all).toContain('MAX DOT STREAK');
  });

  it('includes the encounter table with the Econ column', () => {
    expect(all).toContain('ENCOUNTER VS BOWLERS');
    expect(all).toContain('ECON');
    expect(all).toContain('16.50');
    expect(all).toContain('Naeem');
  });

  it('includes one circle per delivery faced', () => {
    expect(all.some((t) => t.startsWith('DELIVERIES FACED (6)'))).toBe(true);
    // 6 ball circles + striker dot + 2 legend dots
    expect(circles(layout.ops).length).toBe(6 + 3);
  });

  it('omits empty sections', () => {
    const empty = buildBatsmanCardLayout({ ...batsmanInput, encounters: [], ballLog: [] });
    const t = texts(empty.ops);
    expect(t).not.toContain('ENCOUNTER VS BOWLERS');
    expect(t.some((x) => x.startsWith('DELIVERIES FACED'))).toBe(false);
    expect(empty.height).toBeLessThan(layout.height);
  });
});

describe('buildBowlerCardLayout', () => {
  const layout = buildBowlerCardLayout(bowlerInput);
  const all = texts(layout.ops);

  it('carries identity, figures and pressure strips', () => {
    expect(all).toContain('NAEEM');
    expect(all).toContain('CURRENT BOWLER');
    expect(all).toContain('MAIDENS');
    expect(all).toContain('DOT %');
    expect(all).toContain('52%');
  });

  it('renders overs as equation rows with totals and MAIDEN', () => {
    expect(all.some((t) => t.startsWith('OVER-BY-OVER DELIVERIES (3)'))).toBe(true);
    expect(all).toContain('=');
    expect(all).toContain('10 runs');
    expect(all).toContain('MAIDEN');
    expect(all).toContain('LIVE');
    // Econ in the section header
    expect(all).toContain('6.00');
  });

  it('includes wickets taken and per-over wicket rows', () => {
    expect(all.some((t) => t.startsWith('WICKETS TAKEN IN MATCH (1)'))).toBe(true);
    expect(all.filter((t) => t === 'Roman').length).toBeGreaterThanOrEqual(2);
  });

  it('omits the wickets section at zero wickets', () => {
    const none = buildBowlerCardLayout({ ...bowlerInput, wicketsTaken: [], overs: bowlerInput.overs.map((o) => ({ ...o, wickets: [] })) });
    expect(texts(none.ops).some((t) => t.startsWith('WICKETS TAKEN'))).toBe(false);
  });
});

describe('ballTokenColors + filename', () => {
  it('mirrors the modal token palette', () => {
    expect(ballTokenColors('4').fill).toBe('#059669');
    expect(ballTokenColors('W').fill).toBe('#dc2626');
    expect(ballTokenColors('0').text).toBe('#94a3b8');
    expect(ballTokenColors('Wd').text).toBe('#fcd34d');
    expect(ballTokenColors('2').fill).toBe('#334155');
  });

  it('slugs filenames per player and kind', () => {
    expect(profileCardFilename('batsman', 'Sanaj Mia')).toBe('sanaj-mia-batsman-profile.png');
    expect(profileCardFilename('bowler', 'Naeem')).toBe('naeem-bowler-profile.png');
  });
});
