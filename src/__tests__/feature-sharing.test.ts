/**
 * @vitest-environment jsdom
 *
 * Improvement run — SHARING & EXPORTS partition:
 *  1. Live share link: canonical match-center URL builder,
 *     private-match detection, share/clipboard outcome machine
 *     and the AppToast copy for each outcome (a private match
 *     must always warn that only the owner can open the link).
 *  2. Score share card: the pure layout builder (result card
 *     for completed matches, live-score card for in-progress
 *     ones) plus the thin canvas wrapper, exercised through a
 *     stubbed 2d context because jsdom ships no canvas backend.
 *  3. CSV exports: scorecard CSV content on a fixture match
 *     (headers, a known batting row, the extras line, totals,
 *     fall of wickets, bowling) and tournament CSV sections
 *     fed by the real TournamentEngine / NetRunRateEngine.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  scorecardToCsv,
  tournamentToCsv,
  csvCell,
  scorecardCsvFilename,
  tournamentCsvFilename,
} from '@/features/scoring/share/csvExport';
import {
  buildMatchCenterPath,
  buildMatchCenterUrl,
  isPrivateMatch,
  shareMatchCenterLink,
  shareToastMessage,
} from '@/features/scoring/share/shareLink';
import {
  buildShareCardLayout,
  generateScoreCardImage,
  SHARE_CARD_WIDTH,
  SHARE_CARD_HEIGHT,
} from '@/features/scoring/share/ScoreShareCard';
import type { MatchScorecard } from '@/domain/cricket/types';
import type { Tournament } from '@/domain/tournament/types';

// ── Fixtures ─────────────────────────────────────────────────

function batter(p: Record<string, unknown>) {
  return {
    id: String(p.name),
    battingHand: 'Right',
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    dotBalls: 0,
    ballLog: [],
    isDismissed: false,
    ...p,
  };
}

function bowler(p: Record<string, unknown>) {
  return {
    id: String(p.name),
    ballsBowled: 0,
    maidens: 0,
    runs: 0,
    wickets: 0,
    overHistory: [],
    ...p,
  };
}

function innings(p: Record<string, unknown>) {
  return {
    inningsNumber: 1,
    totalRuns: 0,
    totalWickets: 0,
    totalBalls: 0,
    oversString: '0.0',
    wideRuns: 0,
    nbRuns: 0,
    byeRuns: 0,
    lbRuns: 0,
    penaltyRuns: 0,
    penaltyRunsAgainst: 0,
    players: [],
    bowlers: [],
    fallOfWickets: [],
    pastPartnerships: [],
    thisOverLog: [],
    strikerIdx: 0,
    nonStrikerIdx: 1,
    ...p,
  };
}

const firstInnings = innings({
  inningsNumber: 1,
  team: 'Tigers',
  bowlingTeam: 'Lions',
  totalRuns: 186,
  totalWickets: 7,
  totalBalls: 120,
  oversString: '20.0',
  wideRuns: 5,
  nbRuns: 2,
  byeRuns: 1,
  lbRuns: 3,
  players: [
    batter({
      name: 'Arif',
      runs: 75,
      balls: 42,
      fours: 8,
      sixes: 2,
      isDismissed: true,
      dismissalText: 'c Rahim b Shakil',
      dismissalType: 'Caught',
    }),
    batter({
      name: 'Babul',
      runs: 61,
      balls: 30,
      fours: 6,
      sixes: 3,
      isDismissed: true,
      dismissalText: 'b Shakil',
      dismissalType: 'Bowled',
    }),
    batter({ name: 'Nasim', runs: 12, balls: 10, fours: 1 }),
    batter({ name: 'Unused', runs: 0, balls: 0 }),
  ],
  bowlers: [
    bowler({ name: 'Shakil', ballsBowled: 24, maidens: 0, runs: 28, wickets: 3 }),
    bowler({ name: 'Rahim', ballsBowled: 24, maidens: 1, runs: 35, wickets: 1 }),
  ],
  fallOfWickets: [
    { score: 98, wicket: 1, over: '11.2', player: 'Arif', dismissalType: 'Caught' },
    { score: 160, wicket: 2, over: '17.4', player: 'Babul', dismissalType: 'Bowled' },
  ],
});

const secondInnings = innings({
  inningsNumber: 2,
  team: 'Lions',
  bowlingTeam: 'Tigers',
  totalRuns: 162,
  totalWickets: 9,
  totalBalls: 120,
  oversString: '20.0',
  wideRuns: 3,
  lbRuns: 2,
  players: [
    batter({
      name: 'Imran',
      runs: 55,
      balls: 38,
      fours: 5,
      sixes: 1,
      isDismissed: true,
      dismissalText: 'c Arif b Nasim',
      dismissalType: 'Caught',
    }),
    batter({ name: 'Karim', runs: 40, balls: 33, fours: 3 }),
  ],
  bowlers: [bowler({ name: 'Nasim', ballsBowled: 24, maidens: 0, runs: 30, wickets: 2 })],
  fallOfWickets: [{ score: 88, wicket: 1, over: '10.3', player: 'Imran', dismissalType: 'Caught' }],
});

function makeScorecard(overrides: Record<string, unknown> = {}): MatchScorecard {
  return {
    id: 'm1',
    teamA: 'Tigers',
    teamB: 'Lions',
    tossWinner: 'Tigers',
    tossDecision: 'bat',
    totalOvers: 20,
    status: 'COMPLETED',
    currentInnings: 2,
    targetScore: 187,
    venue: 'Shere Bangla Stadium',
    createdAt: '2026-11-09T10:00:00.000Z',
    updatedAt: '2026-11-09T12:00:00.000Z',
    winner: 'Tigers',
    result: 'Tigers won by 24 runs',
    mom: 'Arif',
    momStats: {
      name: 'Arif',
      runs: 75,
      balls: 42,
      fours: 8,
      sixes: 2,
      wickets: 0,
      bowlingRuns: 0,
      ballsBowled: 0,
      points: 90,
    },
    firstInnings,
    secondInnings,
    advancedSettings: { tournamentId: 't1' },
    ...overrides,
  } as unknown as MatchScorecard;
}

function makeTournament(): Tournament {
  return {
    id: 't1',
    name: 'Dhaka Premier League',
    format: 'league',
    teams: ['Tigers', 'Lions'],
    fixtures: [
      {
        id: 'f1',
        round: 1,
        homeTeam: 'Tigers',
        awayTeam: 'Lions',
        winner: 'Tigers',
        loser: 'Lions',
        isTie: false,
        stage: 'league',
        matchId: 'm1',
      },
    ],
    leagueMeetings: 1,
    matchOvers: 20,
    createdAt: '2026-11-01T00:00:00.000Z',
  } as unknown as Tournament;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── 1. Share link ────────────────────────────────────────────

describe('share link builder', () => {
  it('builds the canonical match-center path and URL', () => {
    expect(buildMatchCenterPath('m1')).toBe('/matches/center/m1');
    expect(buildMatchCenterUrl('m1', 'https://app.test')).toBe(
      'https://app.test/matches/center/m1'
    );
    expect(buildMatchCenterUrl('m1', 'https://app.test/')).toBe(
      'https://app.test/matches/center/m1'
    );
  });

  it('treats only an explicit isPublic=false as private', () => {
    expect(isPrivateMatch({ isPublic: false })).toBe(true);
    expect(isPrivateMatch({ isPublic: true })).toBe(false);
    expect(isPrivateMatch({})).toBe(false);
  });
});

describe('shareMatchCenterLink outcomes', () => {
  it('copies the center link when Web Share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const result = await shareMatchCenterLink(makeScorecard(), 'https://app.test');
    expect(result.outcome).toBe('copied');
    expect(result.url).toBe('https://app.test/matches/center/m1');
    expect(writeText).toHaveBeenCalledWith('https://app.test/matches/center/m1');
  });

  it('prefers navigator.share and never touches the clipboard', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    const result = await shareMatchCenterLink(makeScorecard(), 'https://app.test');
    expect(result.outcome).toBe('shared');
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://app.test/matches/center/m1' })
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it('reports an aborted share without falling back to the clipboard', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const share = vi.fn().mockRejectedValue(abort);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    const result = await shareMatchCenterLink(makeScorecard(), 'https://app.test');
    expect(result.outcome).toBe('aborted');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when share fails for another reason', async () => {
    const share = vi.fn().mockRejectedValue(new Error('not allowed'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    const result = await shareMatchCenterLink(makeScorecard(), 'https://app.test');
    expect(result.outcome).toBe('copied');
  });

  it('reports unavailable when neither path exists', async () => {
    vi.stubGlobal('navigator', {});
    const result = await shareMatchCenterLink(makeScorecard(), 'https://app.test');
    expect(result.outcome).toBe('unavailable');
  });

  it('flags private matches in the result', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const result = await shareMatchCenterLink(
      makeScorecard({ isPublic: false }),
      'https://app.test'
    );
    expect(result.isPrivate).toBe(true);
  });
});

describe('shareToastMessage', () => {
  const base = { url: 'https://app.test/matches/center/m1' };

  it('confirms a public clipboard copy', () => {
    expect(shareToastMessage({ ...base, outcome: 'copied', isPrivate: false })).toBe(
      'Match link copied to clipboard!'
    );
  });

  it('warns that a copied private link only opens for the owner', () => {
    const msg = shareToastMessage({ ...base, outcome: 'copied', isPrivate: true });
    expect(msg).toContain('private match');
    expect(msg).toContain('only you can open it');
  });

  it('stays silent after a successful public share or an abort', () => {
    expect(shareToastMessage({ ...base, outcome: 'shared', isPrivate: false })).toBeNull();
    expect(shareToastMessage({ ...base, outcome: 'aborted', isPrivate: false })).toBeNull();
  });

  it('still warns after sharing a private match via the OS sheet', () => {
    const msg = shareToastMessage({ ...base, outcome: 'shared', isPrivate: true });
    expect(msg).toContain('Private match');
    expect(msg).toContain('only you can open this link');
  });

  it('surfaces failures', () => {
    expect(shareToastMessage({ ...base, outcome: 'unavailable', isPrivate: false })).toBe(
      'Unable to copy match link.'
    );
  });
});

// ── 2. Score share card ──────────────────────────────────────

describe('buildShareCardLayout — completed match', () => {
  const layout = buildShareCardLayout(makeScorecard());
  const byKind = (kind: string) => layout.lines.filter((l) => l.kind === kind);

  it('uses the documented 1200x630 canvas with the dark palette', () => {
    expect(layout.width).toBe(SHARE_CARD_WIDTH);
    expect(layout.height).toBe(SHARE_CARD_HEIGHT);
    expect(SHARE_CARD_WIDTH).toBe(1200);
    expect(SHARE_CARD_HEIGHT).toBe(630);
    expect(layout.background).toBe('#090d16');
  });

  it('labels the card as a match result with both innings scores', () => {
    expect(byKind('status')[0].text).toBe('MATCH RESULT');
    expect(byKind('title')[0].text).toBe('Tigers vs Lions');
    const scores = byKind('inningsScore').map((l) => l.text);
    expect(scores[0]).toContain('186/7');
    expect(scores[0]).toContain('20.0 ov');
    expect(scores[1]).toContain('162/9');
  });

  it('shows the result text and the player of the match', () => {
    expect(byKind('result')[0].text).toBe('Tigers won by 24 runs');
    const mom = byKind('mom');
    expect(mom).toHaveLength(1);
    expect(mom[0].text).toContain('Player of the Match: Arif');
    expect(mom[0].text).toContain('75 (42b)');
  });

  it('lists top scorers and the app footer', () => {
    const performers = byKind('performers');
    expect(performers).toHaveLength(1);
    expect(performers[0].text).toContain('Arif 75 (42b)');
    expect(performers[0].text).toContain('Babul 61 (30b)');
    expect(byKind('footer')[0].text).toContain('Cric Scorer Pro');
  });
});

describe('buildShareCardLayout — in-progress match', () => {
  it('labels the card LIVE and computes the chase line, with no MoM', () => {
    const live = makeScorecard({
      status: 'ONGOING',
      winner: undefined,
      result: undefined,
      secondInnings: innings({
        inningsNumber: 2,
        team: 'Lions',
        bowlingTeam: 'Tigers',
        totalRuns: 100,
        totalWickets: 3,
        totalBalls: 60,
        oversString: '10.0',
        players: [batter({ name: 'Imran', runs: 55, balls: 38 })],
        bowlers: [],
      }),
    });
    const layout = buildShareCardLayout(live);
    const byKind = (kind: string) => layout.lines.filter((l) => l.kind === kind);
    expect(byKind('status')[0].text).toBe('LIVE SCORE');
    expect(byKind('result')[0].text).toBe('Lions need 87 off 60 balls');
    expect(byKind('mom')).toHaveLength(0);
  });

  it('marks the side that has not batted yet', () => {
    const live = makeScorecard({
      status: 'ONGOING',
      secondInnings: undefined,
      winner: undefined,
      result: undefined,
    });
    const layout = buildShareCardLayout(live);
    const scores = layout.lines.filter((l) => l.kind === 'inningsScore');
    expect(scores).toHaveLength(2);
    expect(scores[1].text).toBe('Yet to bat');
  });

  it('truncates very long fixture names deterministically', () => {
    const long = makeScorecard({
      teamA: 'A Very Long Named Cricket Club Of Somewhere',
      teamB: 'Another Extremely Long Named Touring Side',
    });
    const title = buildShareCardLayout(long).lines.find((l) => l.kind === 'title');
    expect(title!.text.length).toBeLessThanOrEqual(46);
    expect(title!.text.endsWith('…')).toBe(true);
  });
});

describe('generateScoreCardImage (stubbed canvas)', () => {
  function fakeContext() {
    return {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: 'left' as CanvasTextAlign,
      textBaseline: 'alphabetic' as CanvasTextBaseline,
      beginPath: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
    };
  }

  it('paints the layout and resolves a PNG blob', async () => {
    const ctx = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback
    ) {
      cb(new Blob(['png-bytes'], { type: 'image/png' }));
    });

    const blob = await generateScoreCardImage(makeScorecard());
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalledWith(
      'MATCH RESULT',
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('rejects with a clear error when no 2d context exists', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(generateScoreCardImage(makeScorecard())).rejects.toThrow(/Canvas 2D/);
  });
});

// ── 3. CSV exports ───────────────────────────────────────────

describe('scorecardToCsv', () => {
  const csv = scorecardToCsv(makeScorecard());
  const lines = csv.split('\n');

  it('carries the match header, result and player of the match', () => {
    expect(lines[0]).toBe('Cric Scorer Pro — Match Scorecard');
    expect(csv).toContain('Match,Tigers vs Lions');
    expect(csv).toContain('Result,Tigers won by 24 runs');
    expect(csv).toContain('Player of the Match,Arif');
  });

  it('renders the batting table with headers and a known row', () => {
    expect(csv).toContain('Batsman,Dismissal,Runs,Balls,4s,6s,SR');
    expect(csv).toContain('Arif,c Rahim b Shakil,75,42,8,2,178.6');
    expect(csv).toContain('Nasim,not out,12,10,1,0,120.0');
    expect(csv).toContain('Did not bat,Unused');
  });

  it('renders the extras breakdown and innings totals', () => {
    // The breakdown cell contains commas, so it is RFC 4180 quoted.
    expect(csv).toContain('Extras,11,"(b 1, lb 3, w 5, nb 2, pen 0)"');
    expect(csv).toContain('Total,186/7,(20.0 ov)');
    expect(csv).toContain('Extras,5,"(b 0, lb 2, w 3, nb 0, pen 0)"');
    expect(csv).toContain('Total,162/9,(20.0 ov)');
  });

  it('renders fall of wickets and bowling rows', () => {
    expect(csv).toContain('Wicket,Score,Batsman,Over');
    expect(csv).toContain('1,98,Arif,11.2');
    expect(csv).toContain('2,160,Babul,17.4');
    expect(csv).toContain('Bowler,Overs,Maidens,Runs,Wickets,Economy');
    expect(csv).toContain('Shakil,4.0,0,28,3,7.00');
  });

  it('escapes commas and quotes per RFC 4180', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('plain')).toBe('plain');
    const commaCsv = scorecardToCsv(makeScorecard({ teamA: 'Tigers, XI' }));
    expect(commaCsv).toContain('Match,"Tigers, XI vs Lions"');
  });

  it('builds a slugged filename', () => {
    expect(scorecardCsvFilename(makeScorecard())).toBe('tigers-vs-lions-scorecard.csv');
  });
});

describe('tournamentToCsv', () => {
  const csv = tournamentToCsv(makeTournament(), [makeScorecard()]);

  it('renders the standings from TournamentEngine with points and NRR columns', () => {
    expect(csv).toContain('Tournament,Dhaka Premier League');
    expect(csv).toContain('Pos,Team,Played,Won,Lost,Tied,Points,NRR');
    expect(csv).toMatch(/1,Tigers,1,1,0,0,2,/);
    expect(csv).toMatch(/2,Lions,1,0,1,0,0,/);
  });

  it('renders batting and bowling leaderboards from the engines', () => {
    expect(csv).toContain('Batting Leaders');
    expect(csv).toContain('Player,Team,Innings,Runs,Balls,High Score,50s,100s,Average,Strike Rate,4s,6s');
    expect(csv).toMatch(/Arif,Tigers,1,75,42,75,1,0,/);
    expect(csv).toContain('Bowling Leaders');
    expect(csv).toContain('Shakil,Lions,1,4.0,28,3,3/28');
  });

  it('builds a slugged filename', () => {
    expect(tournamentCsvFilename(makeTournament())).toBe('dhaka-premier-league-tournament.csv');
  });
});
