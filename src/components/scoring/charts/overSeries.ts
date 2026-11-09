/**
 * Per-over series builder for the Worm / Manhattan charts.
 *
 * Data source — what a stored MatchScorecard ACTUALLY records:
 * every bowler's `overHistory` (the completed overs, each with its
 * ball-by-ball log tokens) plus the innings' `thisOverLog` for the
 * over still in progress when the innings ended. No other per-over
 * progression survives in the scorecard, so this is an honest
 * reconstruction from the recorded logs — not a re-simulation.
 *
 * Token grammar (written by EventSourcedMatchEngine.scoreBall):
 *   '4'            plain runs            'W' / '2+W'   wicket (+runs)
 *   'Wd' / 'Wd2'   wide (+ extra runs)   'Wd+2+W'      wide, runs, out
 *   'Nb' / 'Nb2'   no-ball (+ runs)      'Nb+W'        no-ball + out
 *   'B2' / 'LB1'   byes / leg-byes       'B+2+W'       byes + out
 *   '+5P' / '-5P'  penalty runs (the '-' form is awarded AGAINST
 *                  the batting side: it never enters this innings'
 *                  total, so it contributes 0 here)
 * Legacy shapes from earlier writers ('W2', 'W-Bowled', 'Out') are
 * recognised defensively.
 *
 * Wide / no-ball penalty values come from the match's
 * advancedSettings (wideRun / noBallRun, default 1 each) — the same
 * values the engine added to the team total when scoring.
 *
 * Limits: matches whose scorecards carry no overHistory at all
 * (very old imports) yield an EMPTY series, and the chart
 * components render their empty state. A partial final over is
 * included when the innings ended mid-over (totalBalls % 6 !== 0);
 * at an exact over boundary thisOverLog already duplicates the
 * last completed over inside overHistory and is not double-counted
 * (the same rule DotBallAnalytics uses).
 */

import type { InningsData, MatchScorecard } from '@/domain/cricket/types';

export interface OverSeriesEntry {
  /** 1-based over number within the innings. */
  over: number;
  /** Team runs scored in the over (all extras included). */
  runs: number;
  /** Wickets fallen in the over. */
  wickets: number;
  /** Cumulative team runs at the end of the over. */
  cumulative: number;
}

export interface OverSeriesSettings {
  wideRun?: number;
  noBallRun?: number;
}

function firstInt(s: string): number {
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) || 0 : 0;
}

/** Team runs contributed by one over-log token. */
export function overLogTokenRuns(
  token: string,
  settings: OverSeriesSettings = {}
): number {
  const t = (token || '').trim();
  if (!t) return 0;
  const wideRun = settings.wideRun || 1;
  const noBallRun = settings.noBallRun || 1;

  // Penalty entries: '+5P' adds to this innings; '-5P' is awarded
  // against the batting side and never enters its total.
  const penalty = t.match(/^([+-])(\d+)P$/);
  if (penalty) return penalty[1] === '+' ? parseInt(penalty[2], 10) || 0 : 0;

  if (t.startsWith('Wd')) return wideRun + firstInt(t.slice(2));
  if (t.startsWith('Nb')) return noBallRun + firstInt(t.slice(2));
  if (t.startsWith('LB')) return firstInt(t.slice(2));
  if (t.startsWith('B')) return firstInt(t.slice(1));
  if (t.startsWith('W')) {
    // 'W' = 0; legacy 'W2' / 'W+2' = run-out with completed runs.
    const m = t.match(/^W[+-]?(\d+)/);
    return m ? parseInt(m[1], 10) || 0 : 0;
  }
  // Plain runs ('0'..'6') and run-out-with-runs ('2+W'): parseInt
  // reads the leading number in both cases.
  return parseInt(t, 10) || 0;
}

/** Does this over-log token record a wicket? ('Wd' alone does not.) */
export function overLogTokenIsWicket(token: string): boolean {
  const t = (token || '').trim();
  if (!t) return false;
  return (
    t === 'W' ||
    t === 'Out' ||
    t.includes('+W') ||
    t.startsWith('W-') ||
    /^W\d/.test(t)
  );
}

/** Build the per-over series for one innings. */
export function buildOverSeriesFromInnings(
  innings: InningsData | undefined,
  settings: OverSeriesSettings = {}
): OverSeriesEntry[] {
  if (!innings) return [];

  const byOver = new Map<number, string[]>();
  for (const bowler of innings.bowlers || []) {
    for (const rec of bowler.overHistory || []) {
      if (!rec || !Array.isArray(rec.log)) continue;
      const overNo = rec.overNumber;
      if (!overNo || overNo < 1) continue;
      const existing = byOver.get(overNo);
      // Each over is bowled by exactly one bowler; if legacy data
      // ever duplicates an over number, keep the fuller log.
      if (!existing || rec.log.length > existing.length) {
        byOver.set(overNo, rec.log);
      }
    }
  }

  // The in-progress / final partial over lives only in thisOverLog.
  const partial = innings.thisOverLog;
  if (Array.isArray(partial) && partial.length > 0) {
    const totalBalls = innings.totalBalls || 0;
    const midOver = totalBalls % 6 !== 0;
    const firstOverInProgress = totalBalls === 0 && byOver.size === 0;
    if (midOver || firstOverInProgress) {
      const overNo = Math.floor(totalBalls / 6) + 1;
      if (!byOver.has(overNo)) byOver.set(overNo, partial);
    }
  }

  const overs = [...byOver.keys()].sort((a, b) => a - b);
  let cumulative = 0;
  return overs.map((over) => {
    const log = byOver.get(over) || [];
    let runs = 0;
    let wickets = 0;
    for (const token of log) {
      runs += overLogTokenRuns(token, settings);
      if (overLogTokenIsWicket(token)) wickets += 1;
    }
    cumulative += runs;
    return { over, runs, wickets, cumulative };
  });
}

/** Build the per-over series for one innings of a stored scorecard. */
export function buildOverSeries(
  scorecard: MatchScorecard,
  inningsNumber: 1 | 2
): OverSeriesEntry[] {
  if (!scorecard) return [];
  const innings =
    inningsNumber === 1 ? scorecard.firstInnings : scorecard.secondInnings;
  return buildOverSeriesFromInnings(innings, {
    wideRun: scorecard.advancedSettings?.wideRun,
    noBallRun: scorecard.advancedSettings?.noBallRun,
  });
}
