/**
 * Live Spectating — public snapshot types (feature approved 2026-11-25).
 *
 * A snapshot is a compact, self-contained, PUBLIC view of one live match,
 * built from the local MatchScorecard + ball events by
 * buildLiveSnapshot() and published to Firestore `live_matches/{matchId}`
 * by LivePublishService. Viewers (no sign-in) render everything from this
 * one document, so nothing here may carry private data (no user emails,
 * no sync metadata) — names, scores and ball events only.
 */

export interface LiveBatterLine {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  dismissalText?: string;
}

export interface LiveBowlerLine {
  name: string;
  oversText: string;
  ballsBowled: number;
  maidens: number;
  runs: number;
  wickets: number;
}

export interface LiveInningsSummary {
  inningsNumber: number;
  team: string;
  bowlingTeam: string;
  runs: number;
  wickets: number;
  oversText: string;
  ballsBowled: number;
  batting: LiveBatterLine[];
  bowling: LiveBowlerLine[];
}

export type LiveFeedKind = 'wicket' | 'six' | 'four' | 'normal';

export interface LiveFeedItem {
  /** Broadcast over notation, e.g. "16.3" (over.ball, legal balls only). */
  overText: string;
  text: string;
  kind: LiveFeedKind;
  /** Event timestamp (epoch ms) from the scoring device. */
  ts: number;
}

export interface LiveOverSummary {
  /** 1-based over number within the innings. */
  over: number;
  runs: number;
  wickets: number;
  /** Ball tokens in delivery order, e.g. ["1","wd","4","W"]. */
  balls: string[];
}

export interface LiveCurrentState {
  battingTeam: string;
  bowlingTeam: string;
  runs: number;
  wickets: number;
  oversText: string;
  ballsBowled: number;
  /** Chase target (runs to win) in the 2nd innings, else null. */
  target: number | null;
  crr: number;
  reqRate: number | null;
  runsNeeded: number | null;
  ballsLeft: number | null;
  striker: LiveBatterLine | null;
  nonStriker: LiveBatterLine | null;
  bowler: LiveBowlerLine | null;
  /** Last 10 ball tokens of the current innings, chronological. */
  recentBalls: string[];
  /** Last 30 balls of the current innings, newest first. */
  feed: LiveFeedItem[];
  overs: LiveOverSummary[];
  /** Batting team's win probability 2..98 during a chase, else null. */
  winPct: number | null;
}

export interface LiveMatchSnapshot {
  schemaVersion: 1;
  matchId: string;
  status: 'live' | 'completed';
  teamA: string;
  teamB: string;
  tournamentName: string | null;
  venue: string | null;
  /** "T20" for 20 overs, "ODI · 50 overs" for 50, else "N overs". */
  formatLabel: string;
  tossText: string | null;
  innings: LiveInningsSummary[];
  current: LiveCurrentState | null;
  /** One-line headline for home cards, e.g. "PASASH need 41 off 21 balls". */
  statusLine: string;
  resultText: string | null;
  /** ISO timestamp of match creation (scorecard.createdAt). */
  startedAt: string;
}

/** The Firestore document: the snapshot plus ownership + publish time. */
export interface LiveMatchDocument extends LiveMatchSnapshot {
  ownerUid: string;
  /** Epoch ms of the last publish (client clock; ordering hint only). */
  updatedAtMs: number;
}
