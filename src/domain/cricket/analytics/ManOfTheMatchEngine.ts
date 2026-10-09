/**
 * Universal AI Man of the Match Engine
 * 
 * Dynamic, Explainable, Context-Aware, and Length-Adaptive.
 * Supports any configured match length: 5, 6, 10, 15, 20, 25, 50 overs, etc.
 * Never hard-codes 20-over assumptions.
 */

import { Player, Bowler, InningsData, MatchScorecard, FallOfWicket, DismissalType, DomainEvent } from '../types';
import { strikeRate, economyRate, cleanPlayerName } from '../formatters';
import { DotBallAnalytics } from './DotBallAnalytics';

export type PlayerRole = 'Batsman' | 'Bowler' | 'All-rounder' | 'Wicketkeeper';

export interface MotmBreakdown {
  battingImpact: number;
  bowlingImpact: number;
  fieldingImpact: number;
  pressureImpact: number;
  resultImpact: number;
}

export interface MotmWeights {
  batting: number;
  bowling: number;
  fielding: number;
  pressure: number;
  result: number;
}

export interface UniversalMotmCandidate {
  playerId: string;
  playerName: string;
  team: string;
  role: PlayerRole;
  finalScore: number;
  baseScore: number;
  contextModifier: number;
  confidence: number;
  breakdown: MotmBreakdown;
  weights: MotmWeights;
  stats: {
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    strikeRate: number;
    wickets: number;
    bowlingRuns: number;
    ballsBowled: number;
    economy: number;
    maidens: number;
    dotBalls: number;
    catches: number;
    runOuts: number;
    stumpings: number;
  };
  details: {
    teamRunsShare: number;
    strikeRateDiff: number;
    economyDiff: number;
    isFinisherNotOut: boolean;
    crisisRecovery: boolean;
    deathOversImpact: boolean;
    powerplayImpact: boolean;
  };
  rawEvidence: string[];
}

export interface UniversalMotmResult {
  manOfTheMatch: {
    playerId: string;
    playerName: string;
    team: string;
    role: PlayerRole;
    finalScore: number;
    confidence: number;
  };
  breakdown: MotmBreakdown;
  runnerUp?: {
    playerId: string;
    playerName: string;
    team: string;
    role: PlayerRole;
    finalScore: number;
  };
  reason: string;
  allCandidates: UniversalMotmCandidate[];
  matchMetadata: {
    actualOvers: number;
    isReduced: boolean;
    parRunRate: number;
    totalRuns: number;
    totalWickets: number;
    resultText: string;
    winner?: string;
  };
}

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
  role: PlayerRole;
  // Extended universal properties
  playerId?: string;
  team?: string;
  finalScore?: number;
  confidence?: number;
  breakdown?: MotmBreakdown;
  runnerUp?: {
    playerId: string;
    playerName: string;
    team: string;
    role: PlayerRole;
    finalScore: number;
  };
  reason?: string;
  manOfTheMatch?: {
    playerId: string;
    playerName: string;
    team: string;
    role: PlayerRole;
    finalScore: number;
    confidence: number;
  };
  allCandidates?: UniversalMotmCandidate[];
}

export interface MotmOptions {
  totalOvers?: number;
  actualAvailableOvers?: number;
  isReducedMatch?: boolean;
  dlsTarget?: number;
  targetScore?: number;
  winner?: string;
  loser?: string;
  result?: string;
  ballsRemaining?: number;
  events?: DomainEvent[];
  superOver?: {
    innings1?: InningsData;
    innings2?: InningsData;
    winner?: string;
  };
  match?: MatchScorecard;
}

export interface MatchBenchmarks {
  actualOvers: number;
  parRunRate: number;
  parStrikeRate: number;
  benchmarkRuns: number;
  benchmarkWickets: number;
  bowlerQuota: number;
  powerplayBalls: number;
  middleBalls: number;
  deathBalls: number;
  isLowScoringMatch: boolean;
}

export class ManOfTheMatchEngine {
  /**
   * Legacy method for backward compatibility
   */
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

  /**
   * Legacy method for backward compatibility
   */
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

  /**
   * Determine dynamic match phases based on innings delivery percentage.
   * Powerplay: 0% - 30%
   * Middle: 30% - 75%
   * Death: 75% - 100%
   */
  static getMatchPhase(ballNumber: number, actualOvers: number): 'Powerplay' | 'Middle' | 'Death' {
    const totalBalls = Math.max(6, actualOvers * 6);
    const progress = Math.min(1.0, Math.max(0, ballNumber / totalBalls));

    if (progress <= 0.30) return 'Powerplay';
    if (progress <= 0.75) return 'Middle';
    return 'Death';
  }

  /**
   * Dynamically calculate format-aware and pitch-aware statistical benchmarks.
   */
  static getBenchmarks(
    actualOvers: number,
    totalRunsInMatch: number = 0,
    totalBallsInMatch: number = 0
  ): MatchBenchmarks {
    const overs = Math.max(1, actualOvers);
    const totalBalls = overs * 6;

    // Theoretical par run rate adapts smoothly to match length
    const theoreticalParRpo = 5.0 + 22.0 / (Math.sqrt(overs) + 1.8);

    let parRunRate = theoreticalParRpo;
    let isLowScoringMatch = false;

    if (totalBallsInMatch >= 12 && totalRunsInMatch > 0) {
      const matchRpo = (totalRunsInMatch / totalBallsInMatch) * 6;
      // Detect low-scoring condition (e.g. pitch minefield where run rate is <= 70% of theoretical par)
      if (matchRpo <= theoreticalParRpo * 0.75) {
        isLowScoringMatch = true;
      }
      // Blend 55% theoretical par with 45% actual pitch conditions
      parRunRate = Math.max(4.5, Math.min(14.0, 0.55 * theoreticalParRpo + 0.45 * matchRpo));
    }

    const parStrikeRate = (parRunRate / 6.0) * 100;

    // Expected top individual score benchmark scales with sqrt(overs)
    const benchmarkRuns = Math.max(16, Math.min(100, Math.round(15.0 * Math.sqrt(overs))));

    // Benchmark wickets: in limited-overs cricket, 2 wickets (5-10 overs) or 3-3.5 wickets (20 overs) is match-winning
    const benchmarkWickets = Math.max(1.8, Math.min(4.2, Number((0.65 * Math.sqrt(overs) + 0.5).toFixed(2))));

    // Max overs quota per bowler
    const bowlerQuota = Math.max(1, Math.round(overs / 5));

    const powerplayBalls = Math.round(totalBalls * 0.30);
    const middleBalls = Math.round(totalBalls * 0.75);
    const deathBalls = totalBalls;

    return {
      actualOvers: overs,
      parRunRate,
      parStrikeRate,
      benchmarkRuns,
      benchmarkWickets,
      bowlerQuota,
      powerplayBalls,
      middleBalls,
      deathBalls,
      isLowScoringMatch,
    };
  }

  /**
   * Primary evaluation entry point for a match
   */
  static evaluateMatch(
    matchOrInnings1: MatchScorecard | InningsData | undefined,
    secondInningsOrOptions?: InningsData | MotmOptions,
    maybeOptions?: MotmOptions
  ): UniversalMotmResult | null {
    let firstInnings: InningsData | undefined;
    let secondInnings: InningsData | undefined;
    let options: MotmOptions = {};

    // Detect parameter configuration
    if (matchOrInnings1 && 'firstInnings' in matchOrInnings1) {
      // Called with (match, options)
      const match = matchOrInnings1 as MatchScorecard;
      firstInnings = match.firstInnings;
      secondInnings = match.secondInnings;
      options = {
        totalOvers: match.totalOvers,
        winner: match.winner,
        loser: match.loser,
        result: match.result,
        targetScore: match.targetScore,
        ballsRemaining: match.ballsRemaining,
        match,
        ...(secondInningsOrOptions as MotmOptions),
      };
    } else {
      // Called with (firstInnings, secondInnings, options)
      firstInnings = matchOrInnings1 as InningsData | undefined;
      if (secondInningsOrOptions && 'totalRuns' in secondInningsOrOptions) {
        secondInnings = secondInningsOrOptions as InningsData;
        options = maybeOptions || {};
      } else {
        options = (secondInningsOrOptions as MotmOptions) || {};
      }
    }

    if (!firstInnings && !secondInnings) return null;

    // Resolve actual match length without hard-coded assumptions
    const inferredOvers = this.inferMatchOvers(firstInnings, secondInnings);
    const actualOvers = Math.max(
      1,
      options.actualAvailableOvers ??
      options.totalOvers ??
      options.match?.totalOvers ??
      inferredOvers
    );

    const isReduced = Boolean(options.isReducedMatch || (options.actualAvailableOvers && options.actualAvailableOvers < (options.totalOvers || actualOvers)));

    // Total runs and balls in match for pitch adaptation
    const totalRunsInMatch = (firstInnings?.totalRuns || 0) + (secondInnings?.totalRuns || 0);
    const totalBallsInMatch = (firstInnings?.totalBalls || 0) + (secondInnings?.totalBalls || 0);
    const totalWicketsInMatch = (firstInnings?.totalWickets || 0) + (secondInnings?.totalWickets || 0);

    const benchmarks = this.getBenchmarks(actualOvers, totalRunsInMatch, totalBallsInMatch);

    // Extract fielding events across the match
    const fieldingRecords = this.extractFieldingRecords(firstInnings, secondInnings);
    const hasFieldingData = fieldingRecords.totalEvents > 0;

    // Collate all participating players
    const candidatesMap = new Map<string, {
      id: string;
      name: string;
      team: string;
      player?: Player;
      bowler?: Bowler;
      inningsNumber: number;
    }>();

    // 1st Innings Batters & Bowlers
    if (firstInnings) {
      for (const p of firstInnings.players || []) {
        const cName = cleanPlayerName(p.name);
        if (!cName) continue;
        const key = cName.toLowerCase();
        candidatesMap.set(key, {
          id: p.id || key,
          name: cName,
          team: firstInnings.team,
          player: p,
          inningsNumber: 1,
        });
      }
      for (const b of firstInnings.bowlers || []) {
        const cName = cleanPlayerName(b.name);
        if (!cName) continue;
        const key = cName.toLowerCase();
        const existing = candidatesMap.get(key);
        if (existing) {
          existing.bowler = b;
        } else {
          candidatesMap.set(key, {
            id: b.id || key,
            name: cName,
            team: firstInnings.bowlingTeam,
            bowler: b,
            inningsNumber: 1,
          });
        }
      }
    }

    // 2nd Innings Batters & Bowlers
    if (secondInnings) {
      for (const p of secondInnings.players || []) {
        const cName = cleanPlayerName(p.name);
        if (!cName) continue;
        const key = cName.toLowerCase();
        const existing = candidatesMap.get(key);
        if (existing) {
          existing.player = p;
        } else {
          candidatesMap.set(key, {
            id: p.id || key,
            name: cName,
            team: secondInnings.team,
            player: p,
            inningsNumber: 2,
          });
        }
      }
      for (const b of secondInnings.bowlers || []) {
        const cName = cleanPlayerName(b.name);
        if (!cName) continue;
        const key = cName.toLowerCase();
        const existing = candidatesMap.get(key);
        if (existing) {
          existing.bowler = b;
        } else {
          candidatesMap.set(key, {
            id: b.id || key,
            name: cName,
            team: secondInnings.bowlingTeam,
            bowler: b,
            inningsNumber: 2,
          });
        }
      }
    }

    // Also include fielders who may not have batted or bowled yet took catches/runouts
    for (const [key, fData] of fieldingRecords.playerMap.entries()) {
      if (!candidatesMap.has(key)) {
        candidatesMap.set(key, {
          id: key,
          name: fData.name,
          team: fData.team,
          inningsNumber: 1,
        });
      }
    }

    if (candidatesMap.size === 0) return null;

    // Resolve match outcome
    const winner = options.winner || options.match?.winner;
    const loser = options.loser || options.match?.loser;
    const resultText = options.result || options.match?.result || 'Match Completed';

    // Evaluate each candidate
    const evaluatedCandidates: UniversalMotmCandidate[] = [];

    for (const item of candidatesMap.values()) {
      const candidate = this.evaluateCandidate({
        item,
        firstInnings,
        secondInnings,
        benchmarks,
        fieldingData: fieldingRecords.playerMap.get(item.name.toLowerCase()),
        hasFieldingDataAcrossMatch: hasFieldingData,
        winner,
        loser,
        options,
      });

      if (candidate.finalScore > 0 || candidate.stats.runs > 0 || candidate.stats.wickets > 0 || candidate.stats.catches > 0) {
        evaluatedCandidates.push(candidate);
      }
    }

    if (evaluatedCandidates.length === 0) return null;

    // Sort by final score descending with multi-tier tie-breakers
    evaluatedCandidates.sort((a, b) => this.compareCandidates(a, b));

    const topCandidate = evaluatedCandidates[0];
    const runnerUpCandidate = evaluatedCandidates.length > 1 ? evaluatedCandidates[1] : undefined;

    // Calculate dynamic confidence score
    const scoreGap = runnerUpCandidate ? topCandidate.finalScore - runnerUpCandidate.finalScore : 15;
    const confidence = this.calculateConfidenceScore({
      scoreGap,
      actualOvers,
      hasFieldingData,
      hasBallLogs: Boolean(firstInnings?.thisOverLog?.length || secondInnings?.thisOverLog?.length),
      winner: topCandidate,
      runnerUp: runnerUpCandidate,
    });
    topCandidate.confidence = confidence;

    // Generate evidence-based AI reasoning
    const reason = this.generateAiReason(topCandidate, runnerUpCandidate, benchmarks, winner, resultText, options);

    return {
      manOfTheMatch: {
        playerId: topCandidate.playerId,
        playerName: topCandidate.playerName,
        team: topCandidate.team,
        role: topCandidate.role,
        finalScore: topCandidate.finalScore,
        confidence,
      },
      breakdown: topCandidate.breakdown,
      runnerUp: runnerUpCandidate
        ? {
            playerId: runnerUpCandidate.playerId,
            playerName: runnerUpCandidate.playerName,
            team: runnerUpCandidate.team,
            role: runnerUpCandidate.role,
            finalScore: runnerUpCandidate.finalScore,
          }
        : undefined,
      reason,
      allCandidates: evaluatedCandidates,
      matchMetadata: {
        actualOvers,
        isReduced,
        parRunRate: Number(benchmarks.parRunRate.toFixed(2)),
        totalRuns: totalRunsInMatch,
        totalWickets: totalWicketsInMatch,
        resultText,
        winner,
      },
    };
  }

  /**
   * Backward-compatible entry point returning PlayerImpactScore with all legacy and new properties
   */
  static calculateForMatch(
    firstInnings?: InningsData,
    secondInnings?: InningsData,
    options?: MotmOptions
  ): PlayerImpactScore | null {
    const result = this.evaluateMatch(firstInnings, secondInnings, options);
    if (!result) return null;

    const top = result.allCandidates[0];
    if (!top) return null;

    return {
      name: top.playerName,
      role: top.role,
      battingPoints: Math.round(top.breakdown.battingImpact),
      bowlingPoints: Math.round(top.breakdown.bowlingImpact),
      totalPoints: Math.round(top.finalScore),
      runs: top.stats.runs,
      balls: top.stats.balls,
      fours: top.stats.fours,
      sixes: top.stats.sixes,
      wickets: top.stats.wickets,
      bowlingRuns: top.stats.bowlingRuns,
      ballsBowled: top.stats.ballsBowled,
      playerId: top.playerId,
      team: top.team,
      finalScore: top.finalScore,
      confidence: top.confidence,
      breakdown: top.breakdown,
      runnerUp: result.runnerUp,
      reason: result.reason,
      manOfTheMatch: result.manOfTheMatch,
      allCandidates: result.allCandidates,
    };
  }

  // ==========================================
  // CANDIDATE EVALUATION ENGINE
  // ==========================================

  private static evaluateCandidate(params: {
    item: {
      id: string;
      name: string;
      team: string;
      player?: Player;
      bowler?: Bowler;
      inningsNumber: number;
    };
    firstInnings?: InningsData;
    secondInnings?: InningsData;
    benchmarks: MatchBenchmarks;
    fieldingData?: { catches: number; runOuts: number; stumpings: number; team: string };
    hasFieldingDataAcrossMatch: boolean;
    winner?: string;
    loser?: string;
    options: MotmOptions;
  }): UniversalMotmCandidate {
    const { item, firstInnings, secondInnings, benchmarks, fieldingData, hasFieldingDataAcrossMatch, winner, options } = params;

    const batter = item.player;
    const bowler = item.bowler;

    const runs = batter?.runs || 0;
    const balls = batter?.balls || 0;
    const fours = batter?.fours || 0;
    const sixes = batter?.sixes || 0;
    const sr = strikeRate(runs, balls);

    const wickets = bowler?.wickets || 0;
    const bowlingRuns = bowler?.runs || 0;
    const ballsBowled = bowler?.ballsBowled || 0;
    const maidens = bowler?.maidens || 0;
    const er = economyRate(bowlingRuns, ballsBowled);
    const dotBalls = bowler ? DotBallAnalytics.countBowlerDotBallsFromOvers(bowler.overHistory) : 0;

    const catches = fieldingData?.catches || 0;
    const runOuts = fieldingData?.runOuts || 0;
    const stumpings = fieldingData?.stumpings || 0;

    const rawEvidence: string[] = [];

    // 1. Batting Impact (0 - 100)
    const battingResult = this.calculateBattingImpact({
      player: batter,
      firstInnings,
      secondInnings,
      benchmarks,
      team: item.team,
      winner,
      rawEvidence,
    });

    // 2. Bowling Impact (0 - 100)
    const bowlingResult = this.calculateBowlingImpact({
      bowler,
      firstInnings,
      secondInnings,
      benchmarks,
      team: item.team,
      winner,
      rawEvidence,
    });

    // 3. Fielding Impact (0 - 100)
    const fieldingResult = this.calculateFieldingImpact({
      catches,
      runOuts,
      stumpings,
      rawEvidence,
    });

    // 4. Pressure / Clutch Score (0 - 100)
    const pressureResult = this.calculatePressureImpact({
      batter,
      bowler,
      battingResult,
      bowlingResult,
      firstInnings,
      secondInnings,
      benchmarks,
      team: item.team,
      winner,
      superOver: options.superOver,
      rawEvidence,
    });

    // 5. Result Impact (0 - 100)
    const resultImpact = this.calculateResultImpact({
      team: item.team,
      winner,
      battingResult,
      bowlingResult,
      benchmarks,
      rawEvidence,
    });

    // Determine Player Role
    const hasBatting = balls > 0 || runs > 0;
    const hasBowling = ballsBowled > 0;
    let role: PlayerRole = 'Batsman';

    if (hasBatting && hasBowling) {
      const hasMeaningfulBatting = runs >= benchmarks.benchmarkRuns * 0.25 || balls >= 6;
      const hasMeaningfulBowling = ballsBowled >= 6 || wickets > 0;
      role = hasMeaningfulBatting && hasMeaningfulBowling ? 'All-rounder' : (hasMeaningfulBowling ? 'Bowler' : 'Batsman');
    } else if (hasBowling) {
      role = 'Bowler';
    } else if (stumpings > 0 && !hasBowling) {
      role = 'Wicketkeeper';
    } else {
      role = 'Batsman';
    }

    // Dynamic Weight Redistribution
    const weights = this.redistributeWeights({
      hasBatting,
      hasBowling,
      hasFieldingDataAcrossMatch,
      role,
      battingImpact: battingResult.score,
      bowlingImpact: bowlingResult.score,
    });

    // Context Modifier (0.90 to 1.10)
    const contextModifier = this.calculateContextModifier({
      battingResult,
      bowlingResult,
      benchmarks,
      isWinner: Boolean(winner && item.team.toLowerCase() === winner.toLowerCase()),
      role,
      rawEvidence,
    });

    // Weighted Base Score
    const baseScore =
      weights.batting * battingResult.score +
      weights.bowling * bowlingResult.score +
      weights.fielding * fieldingResult.score +
      weights.pressure * pressureResult.score +
      weights.result * resultImpact;

    // Final Clamped MOTM Score (0 - 100)
    const rawFinalScore = Math.max(0, Math.min(100, baseScore * contextModifier));
    const finalScore = Number(rawFinalScore.toFixed(1));

    const breakdown: MotmBreakdown = {
      battingImpact: Number((weights.batting * battingResult.score).toFixed(1)),
      bowlingImpact: Number((weights.bowling * bowlingResult.score).toFixed(1)),
      fieldingImpact: Number((weights.fielding * fieldingResult.score).toFixed(1)),
      pressureImpact: Number((weights.pressure * pressureResult.score).toFixed(1)),
      resultImpact: Number((weights.result * resultImpact).toFixed(1)),
    };

    return {
      playerId: item.id,
      playerName: item.name,
      team: item.team,
      role,
      finalScore,
      baseScore: Number(baseScore.toFixed(2)),
      contextModifier: Number(contextModifier.toFixed(3)),
      confidence: 0.9,
      breakdown,
      weights,
      stats: {
        runs,
        balls,
        fours,
        sixes,
        strikeRate: sr,
        wickets,
        bowlingRuns,
        ballsBowled,
        economy: er,
        maidens,
        dotBalls,
        catches,
        runOuts,
        stumpings,
      },
      details: {
        teamRunsShare: battingResult.teamShare,
        strikeRateDiff: Number((sr - benchmarks.parStrikeRate).toFixed(1)),
        economyDiff: Number((benchmarks.parRunRate - er).toFixed(1)),
        isFinisherNotOut: battingResult.isFinisherNotOut,
        crisisRecovery: battingResult.crisisRecovery,
        deathOversImpact: battingResult.deathOversImpact || bowlingResult.deathOversImpact,
        powerplayImpact: battingResult.powerplayImpact || bowlingResult.powerplayImpact,
      },
      rawEvidence,
    };
  }

  // ==========================================
  // 1. BATTING IMPACT CALCULATION (0 - 100)
  // ==========================================

  private static calculateBattingImpact(params: {
    player?: Player;
    firstInnings?: InningsData;
    secondInnings?: InningsData;
    benchmarks: MatchBenchmarks;
    team: string;
    winner?: string;
    rawEvidence: string[];
  }): {
    score: number;
    teamShare: number;
    isFinisherNotOut: boolean;
    crisisRecovery: boolean;
    deathOversImpact: boolean;
    powerplayImpact: boolean;
  } {
    const { player, firstInnings, secondInnings, benchmarks, team, winner, rawEvidence } = params;

    if (!player || (player.balls <= 0 && player.runs <= 0)) {
      return {
        score: 0,
        teamShare: 0,
        isFinisherNotOut: false,
        crisisRecovery: false,
        deathOversImpact: false,
        powerplayImpact: false,
      };
    }

    const runs = player.runs || 0;
    const balls = player.balls || 0;
    const fours = player.fours || 0;
    const sixes = player.sixes || 0;
    const sr = strikeRate(runs, balls);

    // Identify innings played by batter
    const innings = (firstInnings?.team.toLowerCase() === team.toLowerCase())
      ? firstInnings
      : secondInnings;
    const teamTotalRuns = Math.max(runs, innings?.totalRuns || runs);
    const teamShare = teamTotalRuns > 0 ? runs / teamTotalRuns : 0;

    // Detect chase difficulty in low-target matches
    // If target was very low (e.g. 50 in 20-over match), batting pressure was low
    let targetDifficulty = 1.0;
    if (secondInnings && secondInnings.team.toLowerCase() === team.toLowerCase()) {
      const parExpectedTotal = benchmarks.parRunRate * benchmarks.actualOvers;
      if (teamTotalRuns < parExpectedTotal * 0.45 && benchmarks.actualOvers >= 10) {
        // Very low chase: reduce batting volume multiplier so bowler who restricted opponent to 49 takes precedence
        targetDifficulty = 0.70;
      }
    }

    // 1. Volume Score (relative to dynamic match benchmark)
    const volumeRatio = Math.min(1.4, runs / benchmarks.benchmarkRuns);
    let volumePoints = (volumeRatio * 35) * targetDifficulty;
    volumePoints += Math.min(22, (teamShare * 42) * targetDifficulty);

    // 2. Efficiency / Strike Rate Score (up to 25 pts)
    const parSr = benchmarks.parStrikeRate;
    let efficiencyPoints = 12;
    if (balls >= 3) {
      const srDiff = sr - parSr;
      const srFactor = srDiff / (parSr * 0.4);
      efficiencyPoints = Math.max(0, Math.min(25, 12 + srFactor * 10));
    }

    // Boundary bonus
    const boundaryRuns = fours * 4 + sixes * 6;
    const boundaryPct = runs > 0 ? (boundaryRuns / runs) * 100 : 0;
    let boundaryBonus = 0;
    if (boundaryPct >= 60 && runs >= 15) {
      boundaryBonus = Math.min(8, (boundaryPct - 50) * 0.16);
    }
    boundaryBonus += Math.min(6, sixes * 1.5);

    // 3. Situational / Context Bonuses
    let situationBonus = 0;
    let isFinisherNotOut = false;
    let crisisRecovery = false;
    let deathOversImpact = false;
    let powerplayImpact = false;

    const isSecondInnings = (secondInnings?.team.toLowerCase() === team.toLowerCase());
    const isTeamWinner = Boolean(winner && team.toLowerCase() === winner.toLowerCase());

    // Finisher Not Out Bonus in Chase
    if (isSecondInnings && isTeamWinner && !player.isDismissed && runs >= benchmarks.benchmarkRuns * 0.35) {
      situationBonus += 15;
      isFinisherNotOut = true;
      rawEvidence.push(`Unbeaten match-finishing innings in a successful chase (${runs}* off ${balls}b)`);
    }

    // Crisis Recovery Bonus
    const battingPos = parseInt(player.battingPosition || '1', 10);
    if (battingPos >= 3 && innings?.fallOfWickets && innings.fallOfWickets.length >= 2) {
      const fow2 = innings.fallOfWickets[1];
      if (fow2 && fow2.score <= benchmarks.benchmarkRuns * 0.5) {
        situationBonus += 12;
        crisisRecovery = true;
        rawEvidence.push(`Rescued team after early collapse (${fow2.wicket}/${fow2.score})`);
      }
    }

    // Phase Impact
    const inningsTotalBalls = innings?.totalBalls || benchmarks.actualOvers * 6;
    if (inningsTotalBalls >= benchmarks.deathBalls * 0.8) {
      deathOversImpact = true;
    }

    const rawBattingScore = volumePoints + efficiencyPoints + boundaryBonus + situationBonus;
    const score = Math.max(0, Math.min(100, rawBattingScore));

    if (runs > 0) {
      rawEvidence.push(`Batting: ${runs} runs off ${balls} balls (SR: ${sr.toFixed(1)}, ${fours}x4, ${sixes}x6, ${(teamShare * 100).toFixed(0)}% of team total)`);
    }

    return {
      score: Number(score.toFixed(1)),
      teamShare: Number(teamShare.toFixed(3)),
      isFinisherNotOut,
      crisisRecovery,
      deathOversImpact,
      powerplayImpact,
    };
  }

  // ==========================================
  // 2. BOWLING IMPACT CALCULATION (0 - 100)
  // ==========================================

  private static calculateBowlingImpact(params: {
    bowler?: Bowler;
    firstInnings?: InningsData;
    secondInnings?: InningsData;
    benchmarks: MatchBenchmarks;
    team: string;
    winner?: string;
    rawEvidence: string[];
  }): {
    score: number;
    deathOversImpact: boolean;
    powerplayImpact: boolean;
  } {
    const { bowler, firstInnings, secondInnings, benchmarks, rawEvidence } = params;

    if (!bowler || (bowler.ballsBowled <= 0 && bowler.wickets <= 0)) {
      return { score: 0, deathOversImpact: false, powerplayImpact: false };
    }

    const wickets = bowler.wickets || 0;
    const runsConceded = bowler.runs || 0;
    const ballsBowled = bowler.ballsBowled || 0;
    const maidens = bowler.maidens || 0;
    const er = economyRate(runsConceded, ballsBowled);
    const dotBalls = DotBallAnalytics.countBowlerDotBallsFromOvers(bowler.overHistory);

    // 1. Normalized Wicket Volume (up to 60 pts)
    const wicketRatio = wickets / benchmarks.benchmarkWickets;
    let wicketPoints = Math.min(55, wicketRatio * 48);
    if (wickets >= benchmarks.benchmarkWickets) {
      wicketPoints += (wickets - benchmarks.benchmarkWickets + 1) * 9;
    }

    // 2. Economy & Run Prevention (up to 30 pts)
    const parEr = benchmarks.parRunRate;
    const erDiff = parEr - er; // Positive if bowler was more economical than par
    let economyPoints = 12;
    if (ballsBowled >= 6) {
      economyPoints = Math.max(0, Math.min(30, 12 + erDiff * 4.0));
    }

    // Dot balls and Maidens bonus
    const dotBallPct = ballsBowled > 0 ? (dotBalls / ballsBowled) * 100 : 0;
    let dotBonus = 0;
    if (dotBallPct >= 50 && ballsBowled >= 6) {
      dotBonus += Math.min(8, (dotBallPct - 40) * 0.16);
    }
    const maidenBonus = maidens * 12;

    // 3. Wicket Quality & Phase Impact
    let qualityBonus = 0;
    let deathOversImpact = false;
    let powerplayImpact = false;

    // Bowler in firstInnings bowled to firstInnings batting lineup
    // Bowler in secondInnings bowled to secondInnings batting lineup
    const isFirstInningsBowler = Boolean(firstInnings?.bowlers?.some(
      (b) => b.id === bowler.id || cleanPlayerName(b.name).toLowerCase() === cleanPlayerName(bowler.name).toLowerCase()
    ));
    const opposingInnings = isFirstInningsBowler ? firstInnings : secondInnings;

    if (opposingInnings && opposingInnings.fallOfWickets) {
      for (const fow of opposingInnings.fallOfWickets) {
        const overVal = parseFloat(fow.over || '0');
        const ballNum = Math.floor(overVal) * 6 + Math.round((overVal % 1) * 10);
        const phase = this.getMatchPhase(ballNum, benchmarks.actualOvers);

        if (phase === 'Powerplay') {
          powerplayImpact = true;
          qualityBonus += 3;
        } else if (phase === 'Death') {
          deathOversImpact = true;
          qualityBonus += 5;
        }

        const dismissedBatter = opposingInnings.players?.find(
          (p) => cleanPlayerName(p.name).toLowerCase() === cleanPlayerName(fow.player).toLowerCase()
        );
        if (dismissedBatter) {
          const pos = parseInt(dismissedBatter.battingPosition || '1', 10);
          if (pos <= 3 || dismissedBatter.runs >= benchmarks.benchmarkRuns * 0.4) {
            qualityBonus += 3;
          }
        }
      }
    }

    // Low-scoring pitch multiplier: taking wickets on a low total is premium
    let lowScoringBonus = 0;
    if (benchmarks.isLowScoringMatch && wickets >= 2) {
      lowScoringBonus = 12;
      rawEvidence.push('Dominant bowling spell on a challenging low-scoring pitch');
    }

    // Workload Quota Scaling: ensure a bowler who bowled only 1-2 balls isn't unfairly overrated
    const quotaBalls = Math.max(6, benchmarks.bowlerQuota * 6);
    const workloadFraction = Math.min(1.0, ballsBowled / quotaBalls);
    const workloadMultiplier = Math.max(0.65, workloadFraction);

    const rawScore = (wicketPoints + dotBonus + maidenBonus + qualityBonus + lowScoringBonus) + (economyPoints * workloadMultiplier);
    const score = Math.max(0, Math.min(100, rawScore));

    if (ballsBowled > 0 || wickets > 0) {
      const ovStr = `${Math.floor(ballsBowled / 6)}.${ballsBowled % 6}`;
      rawEvidence.push(`Bowling: ${wickets}/${runsConceded} in ${ovStr} overs (Econ: ${er.toFixed(2)}, ${maidens}m, ${dotBalls} dots)`);
    }

    return {
      score: Number(score.toFixed(1)),
      deathOversImpact,
      powerplayImpact,
    };
  }

  // ==========================================
  // 3. FIELDING IMPACT CALCULATION (0 - 100)
  // ==========================================

  private static calculateFieldingImpact(params: {
    catches: number;
    runOuts: number;
    stumpings: number;
    rawEvidence: string[];
  }): { score: number } {
    const { catches, runOuts, stumpings, rawEvidence } = params;

    if (catches === 0 && runOuts === 0 && stumpings === 0) {
      return { score: 0 };
    }

    const rawPoints = catches * 25 + runOuts * 30 + stumpings * 25;
    const score = Math.max(0, Math.min(100, rawPoints));

    const parts: string[] = [];
    if (catches > 0) parts.push(`${catches} catch${catches > 1 ? 'es' : ''}`);
    if (runOuts > 0) parts.push(`${runOuts} run-out${runOuts > 1 ? 's' : ''}`);
    if (stumpings > 0) parts.push(`${stumpings} stumping${stumpings > 1 ? 's' : ''}`);
    rawEvidence.push(`Fielding: ${parts.join(', ')}`);

    return { score: Number(score.toFixed(1)) };
  }

  // ==========================================
  // 4. PRESSURE / CLUTCH SCORE (0 - 100)
  // ==========================================

  private static calculatePressureImpact(params: {
    batter?: Player;
    bowler?: Bowler;
    battingResult: { score: number; isFinisherNotOut: boolean; crisisRecovery: boolean; deathOversImpact: boolean };
    bowlingResult: { score: number; deathOversImpact: boolean; powerplayImpact: boolean };
    firstInnings?: InningsData;
    secondInnings?: InningsData;
    benchmarks: MatchBenchmarks;
    team: string;
    winner?: string;
    superOver?: { winner?: string };
    rawEvidence: string[];
  }): { score: number } {
    const { batter, bowler, battingResult, bowlingResult, benchmarks, team, winner, superOver, rawEvidence } = params;

    let clutchPoints = 50;

    // Chase Pressure
    if (battingResult.isFinisherNotOut) {
      clutchPoints += 25;
    }
    if (battingResult.crisisRecovery) {
      clutchPoints += 20;
    }
    if (battingResult.deathOversImpact) {
      clutchPoints += 15;
    }

    // All-Round Dual-Threat Pressure bonus
    if (battingResult.score >= 40 && bowlingResult.score >= 40) {
      clutchPoints += 20;
    }

    // Bowling Pressure: Death Overs Defense
    if (bowlingResult.deathOversImpact) {
      const er = bowler ? economyRate(bowler.runs, bowler.ballsBowled) : 99;
      if (er <= benchmarks.parRunRate) {
        clutchPoints += 25;
        rawEvidence.push(`High-pressure death overs defense with sub-par economy (${er.toFixed(2)})`);
      }
    }

    // Super Over clutch contribution
    if (superOver) {
      clutchPoints += 25;
      rawEvidence.push('Super Over high-pressure performance');
    }

    // Defending low totals bonus
    const isWinner = Boolean(winner && team.toLowerCase() === winner.toLowerCase());
    if (isWinner && bowlingResult.score >= 50) {
      clutchPoints += 15;
    }

    const score = Math.max(0, Math.min(100, clutchPoints));
    return { score: Number(score.toFixed(1)) };
  }

  // ==========================================
  // 5. RESULT IMPACT (0 - 100)
  // ==========================================

  private static calculateResultImpact(params: {
    team: string;
    winner?: string;
    battingResult: { score: number; teamShare: number; isFinisherNotOut: boolean };
    bowlingResult: { score: number };
    benchmarks: MatchBenchmarks;
    rawEvidence: string[];
  }): number {
    const { team, winner, battingResult, bowlingResult, rawEvidence } = params;

    if (!winner) {
      return 55;
    }

    const isWinner = team.toLowerCase() === winner.toLowerCase();

    if (isWinner) {
      let winScore = 65;
      if (battingResult.teamShare >= 0.35 || battingResult.isFinisherNotOut) {
        winScore += 25;
      }
      if (bowlingResult.score >= 50) {
        winScore += 25;
      }
      return Math.min(100, winScore);
    } else {
      // Losing side (Requirement #14: Lone warrior protection)
      let lossScore = 25;
      if (battingResult.teamShare >= 0.50) {
        lossScore += 35; // Heroic lone battle!
        rawEvidence.push(`Sensational solo performance from losing side (${(battingResult.teamShare * 100).toFixed(0)}% of team total)`);
      } else if (battingResult.teamShare >= 0.35) {
        lossScore += 20;
      }
      if (bowlingResult.score >= 55) {
        lossScore += 30;
      }
      return Math.min(65, lossScore);
    }
  }

  // ==========================================
  // DYNAMIC WEIGHT REDISTRIBUTION
  // ==========================================

  private static redistributeWeights(params: {
    hasBatting: boolean;
    hasBowling: boolean;
    hasFieldingDataAcrossMatch: boolean;
    role: PlayerRole;
    battingImpact: number;
    bowlingImpact: number;
  }): MotmWeights {
    const { hasBatting, hasBowling, hasFieldingDataAcrossMatch, role, battingImpact, bowlingImpact } = params;

    let wBat = 0.40;
    let wBowl = 0.35;
    let wFld = hasFieldingDataAcrossMatch ? 0.10 : 0.00;
    let wPrs = 0.10;
    let wRes = 0.05;

    if (role === 'Batsman' || (!hasBowling && hasBatting)) {
      wBat = 0.75;
      wBowl = 0.00;
      wPrs = 0.10;
      wRes = 0.05;
      wFld = hasFieldingDataAcrossMatch ? 0.10 : 0.00;
    } else if (role === 'Bowler' || (!hasBatting && hasBowling)) {
      wBat = 0.00;
      wBowl = 0.75;
      wPrs = 0.10;
      wRes = 0.05;
      wFld = hasFieldingDataAcrossMatch ? 0.10 : 0.00;
    } else if (role === 'Wicketkeeper') {
      wBat = 0.65;
      wBowl = 0.00;
      wFld = 0.20;
      wPrs = 0.10;
      wRes = 0.05;
    } else {
      // Genuine All-rounder: Balanced allocation across both disciplines
      wBat = 0.40;
      wBowl = 0.35;
      wFld = hasFieldingDataAcrossMatch ? 0.10 : 0.00;
      wPrs = 0.10;
      wRes = 0.05;
    }

    const sum = wBat + wBowl + wFld + wPrs + wRes;
    return {
      batting: Number((wBat / sum).toFixed(3)),
      bowling: Number((wBowl / sum).toFixed(3)),
      fielding: Number((wFld / sum).toFixed(3)),
      pressure: Number((wPrs / sum).toFixed(3)),
      result: Number((wRes / sum).toFixed(3)),
    };
  }

  // ==========================================
  // CONTEXT MODIFIER (Strictly 0.90 to 1.10)
  // ==========================================

  private static calculateContextModifier(params: {
    battingResult: { score: number; teamShare: number };
    bowlingResult: { score: number };
    benchmarks: MatchBenchmarks;
    isWinner: boolean;
    role: PlayerRole;
    rawEvidence: string[];
  }): number {
    const { battingResult, bowlingResult, isWinner, benchmarks } = params;

    let modifier = 1.0;

    // Solo warrior carrying the team (e.g. scored > 50% of team runs)
    if (battingResult.teamShare >= 0.50) {
      modifier += 0.05;
    } else if (battingResult.teamShare >= 0.40) {
      modifier += 0.03;
    }

    // High all-round versatility bonus
    if (battingResult.score >= 40 && bowlingResult.score >= 40) {
      modifier += 0.07;
    }

    // Low-scoring dogfight defense
    if (benchmarks.isLowScoringMatch && bowlingResult.score >= 50) {
      modifier += 0.04;
    }

    // Winning match-winning contribution
    if (isWinner && (battingResult.score >= 70 || bowlingResult.score >= 70)) {
      modifier += 0.03;
    }

    // Clamp strictly within [0.90, 1.10] as per Requirement #21
    return Math.max(0.90, Math.min(1.10, modifier));
  }

  // ==========================================
  // CONFIDENCE SCORE CALCULATION
  // ==========================================

  private static calculateConfidenceScore(params: {
    scoreGap: number;
    actualOvers: number;
    hasFieldingData: boolean;
    hasBallLogs: boolean;
    winner: UniversalMotmCandidate;
    runnerUp?: UniversalMotmCandidate;
  }): number {
    const { scoreGap, actualOvers, hasFieldingData, hasBallLogs } = params;

    let confidence = 0.88;

    // Score gap between winner and runner-up
    if (scoreGap >= 10.0) {
      confidence += 0.07;
    } else if (scoreGap >= 5.0) {
      confidence += 0.04;
    } else if (scoreGap < 1.5) {
      confidence -= 0.12; // Very tight contest
    }

    // Data Completeness
    if (hasBallLogs) confidence += 0.02;
    if (hasFieldingData) confidence += 0.02;

    // Match Length confidence adjustment (5 overs has smaller sample size than 20 overs)
    if (actualOvers <= 5) {
      confidence -= 0.04;
    } else if (actualOvers >= 20) {
      confidence += 0.02;
    }

    return Number(Math.max(0.40, Math.min(0.98, confidence)).toFixed(2));
  }

  // ==========================================
  // TIE-BREAKER LOGIC (Requirement #24)
  // ==========================================

  private static compareCandidates(a: UniversalMotmCandidate, b: UniversalMotmCandidate): number {
    const scoreDiff = b.finalScore - a.finalScore;
    if (Math.abs(scoreDiff) >= 0.2) {
      return scoreDiff;
    }

    // Tier 1: Raw Unrounded Base Score
    const baseDiff = b.baseScore - a.baseScore;
    if (Math.abs(baseDiff) >= 0.1) return baseDiff;

    // Tier 2: Pressure Impact
    const prsDiff = b.breakdown.pressureImpact - a.breakdown.pressureImpact;
    if (Math.abs(prsDiff) >= 0.2) return prsDiff;

    // Tier 3: Decisive-Phase Contribution (Death phase performance)
    if (b.details.deathOversImpact !== a.details.deathOversImpact) {
      return b.details.deathOversImpact ? 1 : -1;
    }

    // Tier 4: Multi-Discipline Contribution (All-rounder over single discipline)
    if (a.role === 'All-rounder' && b.role !== 'All-rounder') return -1;
    if (b.role === 'All-rounder' && a.role !== 'All-rounder') return 1;

    // Tier 5: Result Impact
    const resDiff = b.breakdown.resultImpact - a.breakdown.resultImpact;
    if (Math.abs(resDiff) >= 0.1) return resDiff;

    // Tier 6: Overall normalized efficiency
    const effA = a.details.strikeRateDiff + a.details.economyDiff;
    const effB = b.details.strikeRateDiff + b.details.economyDiff;
    return effB - effA;
  }

  // ==========================================
  // EXPLAINABLE AI REASON GENERATION (Requirement #22)
  // ==========================================

  private static generateAiReason(
    winner: UniversalMotmCandidate,
    runnerUp: UniversalMotmCandidate | undefined,
    benchmarks: MatchBenchmarks,
    winningTeam?: string,
    resultText?: string,
    options?: MotmOptions
  ): string {
    const isWinnerTeam = Boolean(winningTeam && winner.team.toLowerCase() === winningTeam.toLowerCase());
    const stats = winner.stats;
    const ov = benchmarks.actualOvers;

    const parts: string[] = [];

    // Format Context
    parts.push(`In this ${ov}-over match`);

    // Discipline Highlights
    if (winner.role === 'All-rounder' || (stats.runs > 0 && stats.wickets > 0)) {
      const ovStr = `${Math.floor(stats.ballsBowled / 6)}.${stats.ballsBowled % 6}`;
      parts.push(
        `${winner.playerName} delivered a decisive all-round performance with ${stats.runs} runs (${stats.balls}b, SR ${stats.strikeRate.toFixed(1)}) and ${stats.wickets}/${stats.bowlingRuns} in ${ovStr} overs.`
      );
    } else if (stats.wickets > 0) {
      const ovStr = `${Math.floor(stats.ballsBowled / 6)}.${stats.ballsBowled % 6}`;
      parts.push(
        `${winner.playerName} dismantled the opposition with a match-winning bowling spell of ${stats.wickets}/${stats.bowlingRuns} in ${ovStr} overs (Economy: ${stats.economy.toFixed(2)}).`
      );
    } else {
      const finishText = winner.details.isFinisherNotOut ? 'unbeaten ' : '';
      parts.push(
        `${winner.playerName} anchored the innings with a ${finishText}${stats.runs} runs off ${stats.balls} balls at a strike rate of ${stats.strikeRate.toFixed(1)} (${stats.fours}x4, ${stats.sixes}x6).`
      );
    }

    // Clutch/Pressure Context
    if (winner.details.isFinisherNotOut) {
      parts.push('Steered the chase to victory under high required rate pressure.');
    } else if (winner.details.crisisRecovery) {
      parts.push('Rescued the side from an early top-order collapse.');
    } else if (winner.details.deathOversImpact) {
      parts.push('Excelled in the high-leverage death overs phase.');
    }

    // Super Over mention if present
    if (options?.superOver || winner.rawEvidence.some((e) => e.toLowerCase().includes('super over'))) {
      parts.push('Delivered under maximum pressure in the decisive Super Over.');
    }

    // Result context
    if (isWinnerTeam) {
      parts.push(`Created the highest match impact leading ${winner.team} to victory.`);
    } else {
      parts.push(`Delivered an extraordinary solo performance for ${winner.team} that dominated the match impact.`);
    }

    // Runner-up distinction if close
    if (runnerUp && Math.abs(winner.finalScore - runnerUp.finalScore) < 5.0) {
      parts.push(`Edged out runner-up ${runnerUp.playerName} (${runnerUp.finalScore} pts) on decisive contextual clutch value.`);
    }

    return parts.join(' ');
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private static inferMatchOvers(firstInnings?: InningsData, secondInnings?: InningsData): number {
    const balls1 = firstInnings?.totalBalls || 0;
    const balls2 = secondInnings?.totalBalls || 0;
    const maxBalls = Math.max(balls1, balls2);

    if (maxBalls <= 0) return 20;

    const overs = Math.ceil(maxBalls / 6);
    if (overs <= 5) return 5;
    if (overs <= 6) return 6;
    if (overs <= 10) return 10;
    if (overs <= 15) return 15;
    if (overs <= 20) return 20;
    if (overs <= 50) return 50;
    return overs;
  }

  private static extractFieldingRecords(
    firstInnings?: InningsData,
    secondInnings?: InningsData
  ): {
    totalEvents: number;
    playerMap: Map<string, { name: string; team: string; catches: number; runOuts: number; stumpings: number }>;
  } {
    const map = new Map<string, { name: string; team: string; catches: number; runOuts: number; stumpings: number }>();
    let totalEvents = 0;

    const processInnings = (inn?: InningsData) => {
      if (!inn) return;
      const fieldingTeam = inn.bowlingTeam;

      // 1. Check fallOfWickets
      for (const fow of inn.fallOfWickets || []) {
        if (!fow.fielder) continue;
        const cName = cleanPlayerName(fow.fielder);
        if (!cName) continue;
        const key = cName.toLowerCase();

        if (!map.has(key)) {
          map.set(key, { name: cName, team: fieldingTeam, catches: 0, runOuts: 0, stumpings: 0 });
        }
        const record = map.get(key)!;
        totalEvents++;

        const dType = fow.dismissalType;
        if (dType === 'Caught') record.catches++;
        else if (dType === 'Run Out') record.runOuts++;
        else if (dType === 'Stumped') record.stumpings++;
        else record.catches++;
      }

      // 2. Check individual player dismissal records
      for (const p of inn.players || []) {
        if (!p.isDismissed || !p.fielderName) continue;
        const cName = cleanPlayerName(p.fielderName);
        if (!cName) continue;
        const key = cName.toLowerCase();

        const existing = map.get(key);
        if (!existing) {
          map.set(key, { name: cName, team: fieldingTeam, catches: 0, runOuts: 0, stumpings: 0 });
          const record = map.get(key)!;
          totalEvents++;
          if (p.dismissalType === 'Caught') record.catches++;
          else if (p.dismissalType === 'Run Out') record.runOuts++;
          else if (p.dismissalType === 'Stumped') record.stumpings++;
          else record.catches++;
        }
      }
    };

    processInnings(firstInnings);
    processInnings(secondInnings);

    return { totalEvents, playerMap: map };
  }
}
