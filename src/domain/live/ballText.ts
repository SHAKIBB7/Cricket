/**
 * Ball-by-ball display text for Live Spectating, derived ONLY from the
 * scoring engine's BALL_SCORED event payloads — factual text (runs,
 * wicket, extras). The engine records no shot direction/quality, so the
 * feed never invents descriptions like "launched over long-on".
 */

import type { DomainEvent } from '../cricket/types';
import type { LiveFeedItem } from './types';

export interface BallScoredPayload {
  inningsNumber?: number;
  overNumber?: number;
  runsScored?: number;
  totalRunsGained?: number;
  isWide?: boolean;
  isNoBall?: boolean;
  isByes?: boolean;
  isLegByes?: boolean;
  isWicket?: boolean;
  isLegalBall?: boolean;
  dismissalType?: string;
  striker?: string;
  /** The batter actually dismissed on a wicket ball (bug hunt
   * 2026-11-26 C-H1). Absent on pre-fix events — the feed then falls
   * back to the striker stamp. */
  dismissedBatter?: string;
  bowler?: string;
}

export function ballScoredPayload(ev: DomainEvent): BallScoredPayload {
  return (ev.payload ?? {}) as BallScoredPayload;
}

export function isBallScored(ev: DomainEvent): boolean {
  return ev.type === 'BALL_SCORED';
}

/**
 * Compact token for recent-balls strips and over summaries:
 * wicket "W", wide "wd", no-ball "nb", otherwise bat runs ("0".."6"),
 * with byes/leg-byes prefixed ("b1", "lb2") so extras stay truthful.
 */
export function ballToken(p: BallScoredPayload): string {
  if (p.isWicket) return 'W';
  if (p.isWide) {
    const extra = Math.max(0, (p.totalRunsGained ?? 1) - 1);
    return extra > 0 ? `${extra}wd` : 'wd';
  }
  if (p.isNoBall) {
    const bat = p.runsScored ?? 0;
    return bat > 0 ? `${bat}nb` : 'nb';
  }
  const runs = p.runsScored ?? 0;
  if (p.isByes) return `b${runs}`;
  if (p.isLegByes) return `lb${runs}`;
  return String(runs);
}

/** One factual feed line for a scored ball. */
export function ballFeedText(p: BallScoredPayload): { text: string; kind: LiveFeedItem['kind'] } {
  const striker = p.striker ?? 'Batter';
  const bowler = p.bowler ?? 'Bowler';
  if (p.isWicket) {
    const how = p.dismissalType ? ` (${p.dismissalType})` : '';
    return { text: `WICKET! ${bowler} removes ${p.dismissedBatter ?? striker}${how}`, kind: 'wicket' };
  }
  if (p.isWide) {
    const total = p.totalRunsGained ?? 1;
    return { text: `Wide ball — ${total} run${total === 1 ? '' : 's'} to the total`, kind: 'normal' };
  }
  if (p.isNoBall) {
    const bat = p.runsScored ?? 0;
    return {
      text: bat > 0 ? `No ball — and ${bat} run${bat === 1 ? '' : 's'} off the bat` : 'No ball called',
      kind: 'normal',
    };
  }
  const runs = p.runsScored ?? 0;
  if (p.isByes) return { text: `${runs} bye${runs === 1 ? '' : 's'} — beaten past the keeper`, kind: 'normal' };
  if (p.isLegByes) return { text: `${runs} leg bye${runs === 1 ? '' : 's'} off the pad`, kind: 'normal' };
  if (runs === 6) return { text: `SIX! ${bowler} to ${striker} — maximum!`, kind: 'six' };
  if (runs === 4) return { text: `FOUR! ${striker} finds the boundary off ${bowler}`, kind: 'four' };
  if (runs === 0) return { text: `Dot ball — ${bowler} to ${striker}, no run`, kind: 'normal' };
  return { text: `${runs} run${runs === 1 ? '' : 's'} — ${striker} keeps the score moving`, kind: 'normal' };
}
