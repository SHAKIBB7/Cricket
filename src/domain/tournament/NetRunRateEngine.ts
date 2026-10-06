/**
 * NetRunRateEngine & Tournament Leaderboards
 * Strictly implements the official ICC Net Run Rate rule:
 * "If a team is all out before their allotted overs, their run rate is calculated
 * by dividing by their full quota of overs."
 */

import { MatchScorecard } from '../cricket/types';
import { DotBallAnalytics } from '../cricket/analytics/DotBallAnalytics';
import { BattingLeader, BowlingLeader } from './types';
import { cleanPlayerName, strikeRate, economyRate } from '../cricket/formatters';

export class NetRunRateEngine {
  /**
   * Calculates actual divider balls for an innings according to ICC rules
   */
  static getNrrBallsForInnings(
    wickets: number,
    actualBalls: number,
    matchTotalOvers: number,
    maxPlayers: number = 11
  ): number {
    const maxWickets = Math.max(1, maxPlayers - 1);
    if (matchTotalOvers > 0 && wickets >= maxWickets) {
      return matchTotalOvers * 6; // All-out rule: divide by full quota of allotted overs
    }
    return actualBalls;
  }

  static calculateNrr(
    runsFor: number,
    ballsFor: number,
    runsAgainst: number,
    ballsAgainst: number
  ): number {
    const oversFor = ballsFor > 0 ? ballsFor / 6.0 : 0;
    const oversAgainst = ballsAgainst > 0 ? ballsAgainst / 6.0 : 0;

    const forRate = oversFor > 0 ? runsFor / oversFor : 0;
    const againstRate = oversAgainst > 0 ? runsAgainst / oversAgainst : 0;

    return Number((forRate - againstRate).toFixed(3));
  }

  static generateLeaderboard(
    tournamentId: string,
    matches: MatchScorecard[]
  ): {
    battingLeaders: BattingLeader[];
    bowlingLeaders: BowlingLeader[];
  } {
    const battingMap = new Map<string, BattingLeader>();
    const bowlingMap = new Map<string, BowlingLeader>();

    for (const match of matches) {
      if (
        match.advancedSettings?.tournamentId !== tournamentId &&
        match.id !== tournamentId
      ) {
        // Continue if match does not belong to this tournament
        continue;
      }

      const processInnings = (inn: MatchScorecard['firstInnings']) => {
        if (!inn) return;
        const battingTeam = inn.team;
        const bowlingTeam = inn.bowlingTeam;

        // Track dismissed players in this innings
        const dismissedNames = new Set(
          (inn.fallOfWickets || []).map((f) => cleanPlayerName(f.player).toLowerCase())
        );

        // Batters
        for (const player of inn.players || []) {
          const cleanName = cleanPlayerName(player.name);
          if (!cleanName) continue;
          const key = cleanName.toLowerCase();

          let entry = battingMap.get(key);
          if (!entry) {
            entry = {
              name: cleanName,
              team: battingTeam,
              innings: 0,
              runs: 0,
              balls: 0,
              fours: 0,
              sixes: 0,
              dotBalls: 0,
              highScore: 0,
              fifties: 0,
              hundreds: 0,
              dismissals: 0,
              average: 0,
              strikeRate: 0,
            };
            battingMap.set(key, entry);
          }

          if (player.runs > 0 || player.balls > 0) {
            entry.innings += 1;
          }
          entry.runs += player.runs;
          entry.balls += player.balls;
          entry.fours += player.fours;
          entry.sixes += player.sixes;
          entry.dotBalls += DotBallAnalytics.countBatsmanDotBalls(
            player.dotBalls,
            player.ballLog
          );

          if (player.runs > entry.highScore) {
            entry.highScore = player.runs;
          }
          if (player.runs >= 100) {
            entry.hundreds += 1;
          } else if (player.runs >= 50) {
            entry.fifties += 1;
          }
          if (dismissedNames.has(key)) {
            entry.dismissals += 1;
          }
        }

        // Bowlers
        for (const bowler of inn.bowlers || []) {
          const cleanName = cleanPlayerName(bowler.name);
          if (!cleanName) continue;
          const key = cleanName.toLowerCase();

          let entry = bowlingMap.get(key);
          if (!entry) {
            entry = {
              name: cleanName,
              team: bowlingTeam,
              innings: 0,
              balls: 0,
              runs: 0,
              wickets: 0,
              maidens: 0,
              dotBalls: 0,
              bestWickets: 0,
              bestRuns: 999,
              bestFigures: '0/0',
              economy: 0,
              average: 0,
              strikeRate: 0,
            };
            bowlingMap.set(key, entry);
          }

          if (bowler.ballsBowled > 0) {
            entry.innings += 1;
          }
          entry.balls += bowler.ballsBowled;
          entry.runs += bowler.runs;
          entry.wickets += bowler.wickets;
          entry.maidens += bowler.maidens;
          entry.dotBalls += DotBallAnalytics.countBowlerDotBallsFromOvers(
            bowler.overHistory
          );

          if (
            bowler.wickets > entry.bestWickets ||
            (bowler.wickets === entry.bestWickets && bowler.runs < entry.bestRuns)
          ) {
            entry.bestWickets = bowler.wickets;
            entry.bestRuns = bowler.runs;
            entry.bestFigures = `${bowler.wickets}/${bowler.runs}`;
          }
        }
      };

      processInnings(match.firstInnings);
      processInnings(match.secondInnings);
    }

    // Finalize Batting stats
    const battingLeaders = Array.from(battingMap.values())
      .filter((b) => b.runs > 0 || b.balls > 0)
      .map((b) => {
        b.strikeRate = strikeRate(b.runs, b.balls);
        b.average =
          b.dismissals > 0 ? Number((b.runs / b.dismissals).toFixed(2)) : b.runs;
        return b;
      });

    battingLeaders.sort((a, b) => {
      if (b.runs !== a.runs) return b.runs - a.runs;
      if (b.strikeRate !== a.strikeRate) return b.strikeRate - a.strikeRate;
      return a.name.localeCompare(b.name);
    });

    // Finalize Bowling stats
    const bowlingLeaders = Array.from(bowlingMap.values())
      .filter((b) => b.balls > 0 || b.wickets > 0)
      .map((b) => {
        b.economy = economyRate(b.runs, b.balls);
        b.average =
          b.wickets > 0 ? Number((b.runs / b.wickets).toFixed(2)) : b.runs;
        b.strikeRate =
          b.wickets > 0 ? Number((b.balls / b.wickets).toFixed(1)) : b.balls;
        return b;
      });

    bowlingLeaders.sort((a, b) => {
      if (b.wickets !== a.wickets) return b.wickets - a.wickets;
      if (a.economy !== b.economy) return a.economy - b.economy;
      return a.name.localeCompare(b.name);
    });

    return { battingLeaders, bowlingLeaders };
  }
}
