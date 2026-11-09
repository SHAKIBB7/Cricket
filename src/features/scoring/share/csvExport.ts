/**
 * CSV exports (improvement run — sharing & exports).
 *
 * scorecardToCsv: a spreadsheet-friendly rendering of one
 * match — per innings: batting rows, extras, totals, fall of
 * wickets and bowling rows, in the same shape the match
 * center presents them.
 *
 * tournamentToCsv: standings + batting/bowling leaderboards.
 * The numbers are NOT recomputed here — they come straight
 * from TournamentEngine.standings() and
 * NetRunRateEngine.generateLeaderboard(), the exact read
 * paths the tournament page renders, so a CSV can never
 * disagree with the screen.
 */
import type { InningsData, MatchScorecard } from '@/domain/cricket/types';
import { cleanPlayerName, economyRate, strikeRate } from '@/domain/cricket/formatters';
import type { Tournament } from '@/domain/tournament/types';
import { TournamentEngine } from '@/domain/tournament/TournamentEngine';
import { NetRunRateEngine } from '@/domain/tournament/NetRunRateEngine';

/** RFC 4180 cell escaping: quote when the value needs it, double inner quotes. */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(...cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}

function oversNotation(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function dismissalText(player: InningsData['players'][number]): string {
  if (player.isDismissed) {
    return player.dismissalText || player.dismissalType || 'out';
  }
  if (player.dismissalType === 'Retire Hurt' || player.dismissalType === 'Retired Hurt') {
    return 'retired hurt (not out)';
  }
  return 'not out';
}

/** Mirrors the match center's "who actually batted" filter. */
function battedPlayers(inn: InningsData) {
  return inn.players.filter(
    (p) => p.balls > 0 || p.runs > 0 || p.isDismissed || !!p.dismissalType
  );
}

function inningsCsv(inn: InningsData, label: string): string[] {
  const lines: string[] = [];
  lines.push(csvRow(label));
  lines.push(csvRow('Batting'));
  lines.push(csvRow('Batsman', 'Dismissal', 'Runs', 'Balls', '4s', '6s', 'SR'));

  const batted = battedPlayers(inn);
  for (const p of batted) {
    lines.push(
      csvRow(
        cleanPlayerName(p.name),
        dismissalText(p),
        p.runs,
        p.balls,
        p.fours,
        p.sixes,
        strikeRate(p.runs, p.balls).toFixed(1)
      )
    );
  }

  const didNotBat = inn.players.filter(
    (p) => !batted.includes(p) && p.name && p.name.trim() !== '' && p.name !== 'Select Player'
  );
  if (didNotBat.length > 0) {
    lines.push(csvRow('Did not bat', didNotBat.map((p) => cleanPlayerName(p.name)).join('; ')));
  }

  const extrasTotal =
    inn.wideRuns + inn.nbRuns + inn.byeRuns + inn.lbRuns + inn.penaltyRuns;
  lines.push(
    csvRow(
      'Extras',
      extrasTotal,
      `(b ${inn.byeRuns}, lb ${inn.lbRuns}, w ${inn.wideRuns}, nb ${inn.nbRuns}, pen ${inn.penaltyRuns})`
    )
  );
  lines.push(
    csvRow('Total', `${inn.totalRuns}/${inn.totalWickets}`, `(${inn.oversString} ov)`)
  );

  if (inn.fallOfWickets && inn.fallOfWickets.length > 0) {
    lines.push('');
    lines.push(csvRow('Fall of Wickets'));
    lines.push(csvRow('Wicket', 'Score', 'Batsman', 'Over'));
    for (const f of inn.fallOfWickets) {
      lines.push(csvRow(f.wicket, f.score, cleanPlayerName(f.player), f.over));
    }
  }

  lines.push('');
  lines.push(csvRow(`Bowling — ${inn.bowlingTeam}`));
  lines.push(csvRow('Bowler', 'Overs', 'Maidens', 'Runs', 'Wickets', 'Economy'));
  for (const b of inn.bowlers) {
    if (!(b.ballsBowled > 0 || b.runs > 0 || b.wickets > 0)) continue;
    lines.push(
      csvRow(
        cleanPlayerName(b.name),
        oversNotation(b.ballsBowled),
        b.maidens,
        b.runs,
        b.wickets,
        economyRate(b.runs, b.ballsBowled).toFixed(2)
      )
    );
  }

  return lines;
}

export function scorecardToCsv(scorecard: MatchScorecard): string {
  const lines: string[] = [];
  lines.push(csvRow('Cric Scorer Pro — Match Scorecard'));
  lines.push(csvRow('Match', `${scorecard.teamA} vs ${scorecard.teamB}`));
  if (scorecard.venue) lines.push(csvRow('Venue', scorecard.venue));
  if (scorecard.createdAt) lines.push(csvRow('Date', scorecard.createdAt.slice(0, 10)));
  lines.push(csvRow('Overs', scorecard.totalOvers));
  lines.push(csvRow('Status', scorecard.status));
  if (scorecard.tossWinner) {
    lines.push(csvRow('Toss', `${scorecard.tossWinner} chose to ${scorecard.tossDecision}`));
  }
  if (scorecard.result) lines.push(csvRow('Result', scorecard.result));

  if (scorecard.firstInnings) {
    lines.push('');
    lines.push(...inningsCsv(scorecard.firstInnings, `Innings 1 — ${scorecard.firstInnings.team}`));
  }
  if (scorecard.secondInnings) {
    lines.push('');
    lines.push(...inningsCsv(scorecard.secondInnings, `Innings 2 — ${scorecard.secondInnings.team}`));
  }

  if (scorecard.status === 'COMPLETED') {
    const momName = scorecard.momStats?.name || scorecard.mom;
    if (momName) {
      lines.push('');
      lines.push(csvRow('Player of the Match', cleanPlayerName(momName)));
    }
  }

  return lines.join('\n') + '\n';
}

export function tournamentToCsv(tournament: Tournament, matches: MatchScorecard[]): string {
  const lines: string[] = [];
  lines.push(csvRow('Cric Scorer Pro — Tournament Export'));
  lines.push(csvRow('Tournament', tournament.name));
  lines.push(csvRow('Format', tournament.format));
  lines.push(csvRow('Overs', tournament.matchOvers));
  if (tournament.champion) lines.push(csvRow('Champion', tournament.champion));

  lines.push('');
  lines.push(csvRow('Standings'));
  lines.push(
    csvRow(
      'Pos', 'Team', 'Played', 'Won', 'Lost', 'Tied', 'Points', 'NRR',
      'Runs For', 'Balls For', 'Runs Against', 'Balls Against'
    )
  );
  TournamentEngine.standings(tournament, matches).forEach((row, i) => {
    lines.push(
      csvRow(
        i + 1, row.team, row.played, row.wins, row.losses, row.ties, row.points,
        row.netRunRate.toFixed(3), row.runsFor, row.ballsFor, row.runsAgainst, row.ballsAgainst
      )
    );
  });

  const { battingLeaders, bowlingLeaders } = NetRunRateEngine.generateLeaderboard(
    tournament.id,
    matches
  );

  lines.push('');
  lines.push(csvRow('Batting Leaders'));
  lines.push(
    csvRow(
      'Player', 'Team', 'Innings', 'Runs', 'Balls', 'High Score', '50s', '100s',
      'Average', 'Strike Rate', '4s', '6s'
    )
  );
  for (const b of battingLeaders) {
    lines.push(
      csvRow(
        b.name, b.team, b.innings, b.runs, b.balls, b.highScore, b.fifties, b.hundreds,
        b.average.toFixed(2), b.strikeRate.toFixed(1), b.fours, b.sixes
      )
    );
  }

  lines.push('');
  lines.push(csvRow('Bowling Leaders'));
  lines.push(
    csvRow(
      'Player', 'Team', 'Innings', 'Overs', 'Runs', 'Wickets', 'Best',
      'Economy', 'Average', 'Strike Rate', 'Maidens'
    )
  );
  for (const b of bowlingLeaders) {
    lines.push(
      csvRow(
        b.name, b.team, b.innings, oversNotation(b.balls), b.runs, b.wickets,
        b.bestFigures, b.economy.toFixed(2), b.average.toFixed(2),
        b.strikeRate.toFixed(1), b.maidens
      )
    );
  }

  return lines.join('\n') + '\n';
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'match'
  );
}

export function scorecardCsvFilename(scorecard: MatchScorecard): string {
  return `${slugify(`${scorecard.teamA}-vs-${scorecard.teamB}`)}-scorecard.csv`;
}

export function tournamentCsvFilename(tournament: Tournament): string {
  return `${slugify(tournament.name)}-tournament.csv`;
}

/** Blob + temporary anchor download (same pattern as the backup downloads). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
