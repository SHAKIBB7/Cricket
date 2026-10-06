/**
 * Man of the Match (Impact Score) Calculator
 * Ported from Flutter full_scoreboard_screen.dart & REUSABLE_LOGIC_GUIDE_BN.md §6
 */

import { Player, Bowler, InningsData } from '../types';
import { strikeRate, economyRate, cleanPlayerName } from '../formatters';

export interface PlayerImpactScore {
  name: string;
  battingPoints: number;
  bowlingPoints: number;
  totalPoints: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  wickets: number;
  bowlingRuns: number;
  ballsBowled: number;
  role: 'Batsman' | 'Bowler' | 'All-rounder';
}

export class ManOfTheMatchEngine {
  static calculateBattingPoints(player: Player): number {
    const runs = player.runs || 0;
    const balls = player.balls || 0;
    const fours = player.fours || 0;
    const sixes = player.sixes || 0;

    let pts = runs + fours * 1 + sixes * 2;
    const sr = strikeRate(runs, balls);

    if (runs >= 30 && sr >= 150) {
      pts += 10;
    }
    if (runs >= 50) {
      pts += 20;
    }
    return pts;
  }

  static calculateBowlingPoints(bowler: Bowler): number {
    const wickets = bowler.wickets || 0;
    const maidens = bowler.maidens || 0;
    const runs = bowler.runs || 0;
    const ballsBowled = bowler.ballsBowled || 0;

    let pts = wickets * 25 + maidens * 15;
    const er = economyRate(runs, ballsBowled);

    if (wickets >= 3) {
      pts += 20;
    }
    if (ballsBowled >= 12 && er <= 6.0) {
      pts += 15;
    }
    return pts;
  }

  static calculateForMatch(
    firstInnings?: InningsData,
    secondInnings?: InningsData
  ): PlayerImpactScore | null {
    const scores = new Map<string, PlayerImpactScore>();

    const processInnings = (innings?: InningsData) => {
      if (!innings) return;

      // Process Batters
      for (const player of innings.players || []) {
        const cleanName = cleanPlayerName(player.name);
        if (!cleanName) continue;
        const key = cleanName.toLowerCase();

        const batPts = this.calculateBattingPoints(player);
        const existing = scores.get(key);

        if (existing) {
          existing.battingPoints += batPts;
          existing.totalPoints += batPts;
          existing.runs += player.runs;
          existing.balls += player.balls;
          existing.fours += player.fours;
          existing.sixes += player.sixes;
        } else {
          scores.set(key, {
            name: cleanName,
            battingPoints: batPts,
            bowlingPoints: 0,
            totalPoints: batPts,
            runs: player.runs,
            balls: player.balls,
            fours: player.fours,
            sixes: player.sixes,
            wickets: 0,
            bowlingRuns: 0,
            ballsBowled: 0,
            role: 'Batsman',
          });
        }
      }

      // Process Bowlers
      for (const bowler of innings.bowlers || []) {
        const cleanName = cleanPlayerName(bowler.name);
        if (!cleanName) continue;
        const key = cleanName.toLowerCase();

        const bowlPts = this.calculateBowlingPoints(bowler);
        const existing = scores.get(key);

        if (existing) {
          existing.bowlingPoints += bowlPts;
          existing.totalPoints += bowlPts;
          existing.wickets += bowler.wickets;
          existing.bowlingRuns += bowler.runs;
          existing.ballsBowled += bowler.ballsBowled;
        } else {
          scores.set(key, {
            name: cleanName,
            battingPoints: 0,
            bowlingPoints: bowlPts,
            totalPoints: bowlPts,
            runs: 0,
            balls: 0,
            fours: 0,
            sixes: 0,
            wickets: bowler.wickets,
            bowlingRuns: bowler.runs,
            ballsBowled: bowler.ballsBowled,
            role: 'Bowler',
          });
        }
      }
    };

    processInnings(firstInnings);
    processInnings(secondInnings);

    if (scores.size === 0) return null;

    let bestPlayer: PlayerImpactScore | null = null;

    for (const item of scores.values()) {
      if (item.balls > 0 && item.ballsBowled > 0) {
        item.role = 'All-rounder';
      } else if (item.ballsBowled > 0) {
        item.role = 'Bowler';
      } else {
        item.role = 'Batsman';
      }

      if (item.totalPoints > 0) {
        if (!bestPlayer || item.totalPoints > bestPlayer.totalPoints) {
          bestPlayer = item;
        }
      }
    }

    return bestPlayer;
  }
}
