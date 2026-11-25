/**
 * Builds the public LiveMatchSnapshot from the scorer's local match
 * state (MatchScorecard + DomainEvents). Pure and synchronous — the
 * publish layer adds ownerUid/updatedAtMs, the viewer renders the
 * snapshot as-is.
 */

import type { DomainEvent, InningsData, MatchScorecard } from '../cricket/types';
import { ballFeedText, ballScoredPayload, ballToken, isBallScored } from './ballText';
import type {
  LiveBatterLine,
  LiveBowlerLine,
  LiveCurrentState,
  LiveFeedItem,
  LiveInningsSummary,
  LiveMatchSnapshot,
  LiveOverSummary,
} from './types';
import { predictChaseWinPct } from './winPredictor';

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function oversTextFromBalls(ballsBowled: number): string {
  return `${Math.floor(ballsBowled / 6)}.${ballsBowled % 6}`;
}

function batterLine(p: InningsData['players'][number]): LiveBatterLine {
  return {
    name: p.name,
    runs: p.runs,
    balls: p.balls,
    fours: p.fours,
    sixes: p.sixes,
    out: !!p.isDismissed,
    dismissalText: p.dismissalText ?? p.dismissal ?? p.dismissalInfo ?? undefined,
  };
}

function bowlerLine(b: InningsData['bowlers'][number]): LiveBowlerLine {
  return {
    name: b.name,
    oversText: oversTextFromBalls(b.ballsBowled),
    ballsBowled: b.ballsBowled,
    maidens: b.maidens,
    runs: b.runs,
    wickets: b.wickets,
  };
}

function inningsSummary(inn: InningsData, includeCreasePair: boolean): LiveInningsSummary {
  const batting = inn.players
    .filter(
      (p, idx) =>
        p.balls > 0 ||
        p.runs > 0 ||
        p.isDismissed ||
        (includeCreasePair && (idx === inn.strikerIdx || idx === inn.nonStrikerIdx)),
    )
    .map(batterLine);
  const bowling = inn.bowlers.filter((b) => b.ballsBowled > 0).map(bowlerLine);
  return {
    inningsNumber: inn.inningsNumber,
    team: inn.team,
    bowlingTeam: inn.bowlingTeam,
    runs: inn.totalRuns,
    wickets: inn.totalWickets,
    oversText: inn.oversString,
    ballsBowled: inn.totalBalls,
    batting,
    bowling,
  };
}

interface BallEventView {
  ev: DomainEvent;
  overText: string;
  token: string;
}

/** Walks one innings' BALL_SCORED events once, deriving broadcast over
 * notation (legal-ball counting) and display tokens. */
function ballEventViews(events: DomainEvent[], inningsNumber: number): BallEventView[] {
  const views: BallEventView[] = [];
  const legalInOver = new Map<number, number>();
  for (const ev of events) {
    if (!isBallScored(ev)) continue;
    const p = ballScoredPayload(ev);
    if ((p.inningsNumber ?? 1) !== inningsNumber) continue;
    const over = p.overNumber ?? 1;
    const before = legalInOver.get(over) ?? 0;
    const after = before + (p.isLegalBall ? 1 : 0);
    legalInOver.set(over, after);
    views.push({ ev, overText: `${over - 1}.${after}`, token: ballToken(p) });
  }
  return views;
}

function overSummaries(views: BallEventView[]): LiveOverSummary[] {
  const byOver = new Map<number, LiveOverSummary>();
  for (const v of views) {
    const p = ballScoredPayload(v.ev);
    const over = p.overNumber ?? 1;
    let row = byOver.get(over);
    if (!row) {
      row = { over, runs: 0, wickets: 0, balls: [] };
      byOver.set(over, row);
    }
    row.runs += p.totalRunsGained ?? p.runsScored ?? 0;
    if (p.isWicket) row.wickets += 1;
    row.balls.push(v.token);
  }
  return [...byOver.values()].sort((a, b) => a.over - b.over);
}

export interface BuildLiveSnapshotOptions {
  tournamentName?: string | null;
}

export function buildLiveSnapshot(
  scorecard: MatchScorecard,
  events: DomainEvent[],
  options: BuildLiveSnapshotOptions = {},
): LiveMatchSnapshot {
  const completed = scorecard.status === 'COMPLETED';
  const inningsList: InningsData[] = [];
  if (scorecard.firstInnings) inningsList.push(scorecard.firstInnings);
  if (scorecard.secondInnings) inningsList.push(scorecard.secondInnings);

  const currentInn =
    scorecard.currentInnings === 2 && scorecard.secondInnings
      ? scorecard.secondInnings
      : scorecard.firstInnings ?? null;

  const innings: LiveInningsSummary[] = inningsList.map((inn) =>
    inningsSummary(inn, currentInn != null && inn.inningsNumber === currentInn.inningsNumber && !completed),
  );

  let current: LiveCurrentState | null = null;
  let statusLine = `${scorecard.teamA} vs ${scorecard.teamB}`;

  if (currentInn) {
    const views = ballEventViews(events, currentInn.inningsNumber);
    const isChase = currentInn.inningsNumber === 2;
    const target = isChase
      ? scorecard.targetScore > 0
        ? scorecard.targetScore
        : scorecard.firstInnings
          ? scorecard.firstInnings.totalRuns + 1
          : null
      : null;
    const totalBallsInMatch = scorecard.totalOvers * 6;
    const ballsLeft = isChase ? Math.max(0, totalBallsInMatch - currentInn.totalBalls) : null;
    const runsNeeded = target != null ? target - currentInn.totalRuns : null;
    const crr = currentInn.totalBalls > 0 ? round2((currentInn.totalRuns * 6) / currentInn.totalBalls) : 0;
    const reqRate =
      runsNeeded != null && ballsLeft != null && ballsLeft > 0
        ? round2((runsNeeded * 6) / ballsLeft)
        : null;

    const strikerP = currentInn.players[currentInn.strikerIdx];
    const nonStrikerP = currentInn.players[currentInn.nonStrikerIdx];
    const bowlerB = currentInn.bowlers[currentInn.currentBowlerIdx];

    const feed: LiveFeedItem[] = views
      .slice(-30)
      .reverse()
      .map((v) => {
        const { text, kind } = ballFeedText(ballScoredPayload(v.ev));
        return { overText: v.overText, text, kind, ts: v.ev.timestamp };
      });

    current = {
      battingTeam: currentInn.team,
      bowlingTeam: currentInn.bowlingTeam,
      runs: currentInn.totalRuns,
      wickets: currentInn.totalWickets,
      oversText: currentInn.oversString,
      ballsBowled: currentInn.totalBalls,
      target,
      crr,
      reqRate,
      runsNeeded,
      ballsLeft,
      striker: strikerP ? batterLine(strikerP) : null,
      nonStriker: nonStrikerP ? batterLine(nonStrikerP) : null,
      bowler: bowlerB && bowlerB.ballsBowled >= 0 ? bowlerLine(bowlerB) : null,
      recentBalls: views.slice(-10).map((v) => v.token),
      feed,
      overs: overSummaries(views),
      winPct:
        isChase && !completed && runsNeeded != null && ballsLeft != null
          ? predictChaseWinPct({
              runsNeeded,
              ballsLeft,
              ballsBowled: currentInn.totalBalls,
              wicketsLeft: 10 - currentInn.totalWickets,
            })
          : null,
    };

    if (completed) {
      statusLine = scorecard.result ?? 'Match completed';
    } else if (isChase && runsNeeded != null && ballsLeft != null) {
      statusLine =
        runsNeeded > 0
          ? `${currentInn.team} need ${runsNeeded} off ${ballsLeft} balls`
          : `${currentInn.team} won the chase`;
    } else {
      statusLine = `${currentInn.team} ${currentInn.totalRuns}/${currentInn.totalWickets} (${currentInn.oversString} ov) · CRR ${crr.toFixed(2)}`;
    }
  }

  if (completed && scorecard.result) statusLine = scorecard.result;

  const formatLabel =
    scorecard.totalOvers === 20
      ? 'T20'
      : scorecard.totalOvers === 10
        ? 'T10'
        : scorecard.totalOvers === 50
          ? 'ODI · 50 overs'
          : `${scorecard.totalOvers} overs`;

  return {
    schemaVersion: 1,
    matchId: scorecard.id,
    status: completed ? 'completed' : 'live',
    teamA: scorecard.teamA,
    teamB: scorecard.teamB,
    tournamentName: options.tournamentName ?? null,
    venue: scorecard.venue ?? null,
    formatLabel,
    tossText: scorecard.tossWinner
      ? `${scorecard.tossWinner} won the toss & elected to ${scorecard.tossDecision === 'Batting' ? 'bat' : 'bowl'}`
      : null,
    innings,
    current,
    statusLine,
    resultText: scorecard.result ?? null,
    startedAt: scorecard.createdAt,
  };
}
