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
import { getBattedPlayers } from '../cricket/battingCard';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Mirrors EventSourcedMatchEngine.maxWickets. */
function maxWicketsFor(scorecard: MatchScorecard): number {
  if (scorecard.advancedSettings?.isSuperOver) return 2;
  return Math.max(2, scorecard.advancedSettings?.players ?? 11) - 1;
}

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

function inningsSummary(inn: InningsData): LiveInningsSummary {
  // Bug hunt 2026-11-26 C-L3: the old hand-rolled predicate dropped a
  // not-out batter who had faced only wides once the match completed
  // (the crease-pair clause was disabled by `!completed`). The domain
  // batting card already classifies this correctly — reuse it.
  const batting = getBattedPlayers(inn).map(batterLine);
  // C-L2: a bowler whose only deliveries are wides still belongs on
  // the card (runs conceded, possibly a stumping wicket).
  const bowling = inn.bowlers
    .filter((b) => b.ballsBowled > 0 || b.wickets > 0 || b.runs > 0)
    .map(bowlerLine);
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

interface PenaltyEventView {
  ev: DomainEvent;
  overText: string;
  /** Over (1-based) the award lands in — the over in progress. */
  over: number;
  runs: number;
  awardedToBattingTeam: boolean;
}

/** Where innings 2 begins in the log (for attributing PENALTY_AWARDED
 * events, whose payloads carry no innings number). */
function secondInningsStartIndex(events: DomainEvent[]): number {
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.type === 'INNINGS_STARTED' && (ev.payload?.inningsNumber ?? 1) === 2) return i;
    if (isBallScored(ev) && (ballScoredPayload(ev).inningsNumber ?? 1) === 2) return i;
  }
  return Number.POSITIVE_INFINITY;
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
    // Bug hunt 2026-11-26 C-L1: an extra is broadcast against the
    // NEXT legal ball's number (two wides opening an over are both
    // "0.1", not a duplicated "0.0").
    const ballPart = p.isLegalBall ? after : Math.min(6, after + 1);
    views.push({ ev, overText: `${over - 1}.${ballPart}`, token: ballToken(p) });
  }
  return views;
}

/** Bug hunt 2026-11-26 C-L6: penalty awards are PENALTY_AWARDED events,
 * not balls — the old builder ignored them, so the Overs tab never
 * reconciled with the innings total and the feed showed an
 * unexplained jump. Attribute each award to the over in progress at
 * its position in the log (the engine does the same via thisOverLog). */
function penaltyEventViews(events: DomainEvent[], inningsNumber: number): PenaltyEventView[] {
  const views: PenaltyEventView[] = [];
  const split = secondInningsStartIndex(events);
  let legalSoFar = 0;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const segment = i < split ? 1 : 2;
    if (isBallScored(ev)) {
      const p = ballScoredPayload(ev);
      if ((p.inningsNumber ?? 1) === inningsNumber && p.isLegalBall) legalSoFar += 1;
      continue;
    }
    if (ev.type !== 'PENALTY_AWARDED' || segment !== inningsNumber) continue;
    const runs = typeof ev.payload?.runs === 'number' ? ev.payload.runs : 0;
    // An award logged exactly at an over boundary belongs to the
    // over just completed (the incident happened in it; the scorer
    // confirms the award after the ball) — grouping it into the
    // next over would invent a phantom over row with runs but no
    // balls.
    const over = legalSoFar === 0 ? 1 : Math.floor((legalSoFar - 1) / 6) + 1;
    views.push({
      ev,
      overText: `${over - 1}.${legalSoFar % 6}`,
      over,
      runs,
      awardedToBattingTeam: ev.payload?.awardedToBattingTeam !== false,
    });
  }
  return views;
}

function overSummaries(views: BallEventView[], penalties: PenaltyEventView[]): LiveOverSummary[] {
  const byOver = new Map<number, LiveOverSummary>();
  const rowFor = (over: number): LiveOverSummary => {
    let row = byOver.get(over);
    if (!row) {
      row = { over, runs: 0, wickets: 0, balls: [] };
      byOver.set(over, row);
    }
    return row;
  };
  for (const v of views) {
    const p = ballScoredPayload(v.ev);
    const row = rowFor(p.overNumber ?? 1);
    row.runs += p.totalRunsGained ?? p.runsScored ?? 0;
    if (p.isWicket) row.wickets += 1;
    row.balls.push(v.token);
  }
  // C-L6: penalties AGAINST the batting side never touch this
  // innings' total (they credit the other innings), so only
  // batting-side awards reconcile the over with the total.
  for (const pv of penalties) {
    if (pv.awardedToBattingTeam) rowFor(pv.over).runs += pv.runs;
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
  // Bug hunt 2026-11-26 C-M1: ABANDONED is terminal too — a match
  // concluded below the DLS minimum overs used to be published as
  // 'live' with a chase status line until the 6h age-out.
  const completed = scorecard.status === 'COMPLETED' || scorecard.status === 'ABANDONED';
  const inningsList: InningsData[] = [];
  if (scorecard.firstInnings) inningsList.push(scorecard.firstInnings);
  if (scorecard.secondInnings) inningsList.push(scorecard.secondInnings);

  const currentInn =
    scorecard.currentInnings === 2 && scorecard.secondInnings
      ? scorecard.secondInnings
      : scorecard.firstInnings ?? null;

  const innings: LiveInningsSummary[] = inningsList.map((inn) => inningsSummary(inn));

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
    // Bug hunt 2026-11-26 C-M2: never publish negative chase figures
    // (a winning boundary used to produce "REQ -4.00" until the
    // completion publish landed).
    const runsNeeded = target != null ? Math.max(0, target - currentInn.totalRuns) : null;
    const crr = currentInn.totalBalls > 0 ? round2((currentInn.totalRuns * 6) / currentInn.totalBalls) : 0;
    const reqRate =
      runsNeeded != null && runsNeeded > 0 && ballsLeft != null && ballsLeft > 0
        ? round2((runsNeeded * 6) / ballsLeft)
        : null;

    const strikerP = currentInn.players[currentInn.strikerIdx];
    const nonStrikerP = currentInn.players[currentInn.nonStrikerIdx];
    const bowlerB = currentInn.bowlers[currentInn.currentBowlerIdx];

    const penalties = penaltyEventViews(events, currentInn.inningsNumber);
    // C-L6 (cont.): merge penalty entries into the feed in log order
    // so an award explains the score jump it caused.
    const feedItems: LiveFeedItem[] = [
      ...views.map((v) => {
        const { text, kind } = ballFeedText(ballScoredPayload(v.ev));
        return { overText: v.overText, text, kind, ts: v.ev.timestamp };
      }),
      ...penalties.map((pv) => ({
        overText: pv.overText,
        text: pv.awardedToBattingTeam
          ? `Penalty runs — ${pv.runs} awarded to the batting side`
          : `Penalty runs — ${pv.runs} awarded against the batting side`,
        kind: 'normal' as const,
        ts: pv.ev.timestamp,
      })),
    ].sort((a, b) => a.ts - b.ts);
    const feed: LiveFeedItem[] = feedItems.slice(-30).reverse();

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
      overs: overSummaries(views, penalties),
      winPct:
        isChase && !completed && runsNeeded != null && ballsLeft != null
          ? predictChaseWinPct({
              runsNeeded,
              ballsLeft,
              ballsBowled: currentInn.totalBalls,
              // Bug hunt 2026-11-26 C-M3: wickets in hand come from
              // the match's real limit (players per side - 1, or 2
              // for a Super Over) — not a hard-coded 10.
              wicketsLeft: Math.max(0, maxWicketsFor(scorecard) - currentInn.totalWickets),
              totalOvers: scorecard.totalOvers,
            })
          : null,
    };

    if (completed) {
      statusLine =
        scorecard.result ??
        (scorecard.status === 'ABANDONED' ? 'Match abandoned' : 'Match completed');
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
