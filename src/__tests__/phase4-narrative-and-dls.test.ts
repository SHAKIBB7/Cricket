import { describe, it, expect } from 'vitest';
import { DlsEngine } from '../domain/cricket/dls/DlsEngine';
import { MatchNarrativeEngine } from '../domain/cricket/analytics/MatchNarrativeEngine';
import { MatchScorecard } from '../domain/cricket/types';

describe('Phase 4: DLS Engine & AI Editorial Narrative Suite', () => {
  describe('1. Duckworth-Lewis-Stern (DLS) Engine', () => {
    it('calculates standard revised target when second innings is curtailed before start', () => {
      // 20-over match, Team 1 scored 180 runs.
      // Team 2 innings curtailed to 15 overs before play starts.
      const result = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 180,
        team2OversAvailable: 15,
        team2WicketsLost: 0,
        team2CurrentOversBowled: 0,
      });

      expect(result.revisedTarget).toBeGreaterThan(0);
      // Because overs are reduced from 20 to 15, revised target must be lower than original total + 1
      expect(result.revisedTarget).toBeLessThanOrEqual(181);
      expect(result.team1ResourcePct).toBeGreaterThan(result.team2ResourcePct);
      expect(result.oversAvailable).toBe(15);
      expect(result.runsNeeded).toBe(result.revisedTarget);
    });

    it('calculates revised target and par score during mid-innings rain interruption', () => {
      // Team 1 scored 160 in 20 overs.
      // In 2nd innings, Team 2 was 75/2 after 10 overs when rain struck and reduced match to 15 overs total.
      const result = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 160,
        team2OversAvailable: 15,
        team2WicketsLost: 2,
        team2CurrentOversBowled: 10,
        team2CurrentRuns: 75,
      });

      expect(result.revisedTarget).toBeGreaterThan(75);
      expect(result.parScore).toBeDefined();
      expect(result.parScore).toBeGreaterThan(0);
      expect(result.runsNeeded).toBe(result.revisedTarget - 75);
      expect(result.ballsRemaining).toBe(5 * 6);
    });

    it('enforces monotonic decrease in resource percentage as wickets fall', () => {
      const res0 = DlsEngine.getResourcePercentage(10, 0);
      const res2 = DlsEngine.getResourcePercentage(10, 2);
      const res5 = DlsEngine.getResourcePercentage(10, 5);
      const res8 = DlsEngine.getResourcePercentage(10, 8);
      const res9 = DlsEngine.getResourcePercentage(10, 9);
      const res10 = DlsEngine.getResourcePercentage(10, 10);

      expect(res0).toBeGreaterThan(res2);
      expect(res2).toBeGreaterThan(res5);
      expect(res5).toBeGreaterThan(res8);
      expect(res8).toBeGreaterThan(res9);
      expect(res9).toBeGreaterThan(res10);
      expect(res10).toBe(0);
    });

    it('returns original target when no overs are lost', () => {
      const result = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 150,
        team2OversAvailable: 20,
        team2WicketsLost: 0,
        team2CurrentOversBowled: 0,
      });

      expect(result.revisedTarget).toBe(151);
      expect(result.team1ResourcePct).toBe(result.team2ResourcePct);
    });

    it('handles edge case of 0 overs remaining gracefully without negative values', () => {
      const result = DlsEngine.calculate({
        originalOvers: 20,
        team1TotalRuns: 140,
        team2OversAvailable: 0,
        team2WicketsLost: 0,
        team2CurrentOversBowled: 0,
      });

      expect(result.revisedTarget).toBeGreaterThanOrEqual(1);
    });
  });

  describe('2. Match Narrative Engine (Sports Journalism & Reports)', () => {
    const mockCompletedMatch: MatchScorecard = {
      id: 'match_narrative_test_01',
      teamA: 'Dhaka Gladiators',
      teamB: 'Chittagong Kings',
      tossWinner: 'Dhaka Gladiators',
      tossDecision: 'Batting',
      totalOvers: 20,
      status: 'COMPLETED',
      currentInnings: 2,
      targetScore: 176,
      winner: 'Dhaka Gladiators',
      loser: 'Chittagong Kings',
      result: 'Dhaka Gladiators won by 15 runs',
      resultType: 'WIN',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      advancedSettings: {
        players: 11,
        noBall: true,
        noBallReball: true,
        noBallRun: 1,
        wideBall: true,
        wideReball: true,
        wideRun: 1,
        isManualLimitEnabled: false,
        manualOverLimit: 4,
      },
      firstInnings: {
        inningsNumber: 1,
        team: 'Dhaka Gladiators',
        bowlingTeam: 'Chittagong Kings',
        totalRuns: 175,
        totalWickets: 5,
        totalBalls: 120,
        oversString: '20.0',
        wideRuns: 4,
        nbRuns: 1,
        byeRuns: 0,
        lbRuns: 0,
        penaltyRuns: 0,
        penaltyRunsAgainst: 0,
        pastPartnerships: [],
        currentPartnership: { batter1: '', batter2: '', runs: 0, balls: 0 },
        isFreeHit: false,
        isOverComplete: true,
        strikerIdx: 0,
        nonStrikerIdx: 1,
        currentBowlerIdx: 0,
        nextPlayerIdx: 2,
        lastCompletedOverBowlerIdx: -1,
        players: [
          { id: 'p1', name: 'Tamim Iqbal', battingHand: 'Left-hand Batsman', runs: 78, balls: 48, fours: 7, sixes: 3, dotBalls: 12, ballLog: [], bowlersFaced: {}, runsVsBowler: {}, isDismissed: false, strikeRate: 162.5 },
          { id: 'p2', name: 'Anamul Haque', battingHand: 'Right-hand Batsman', runs: 35, balls: 24, fours: 3, sixes: 1, dotBalls: 8, ballLog: [], bowlersFaced: {}, runsVsBowler: {}, isDismissed: true, strikeRate: 145.8 },
        ],
        bowlers: [
          { id: 'b1', name: 'Taskin Ahmed', ballsBowled: 24, maidens: 0, runs: 28, wickets: 2, overHistory: [] },
        ],
        fallOfWickets: [],
        thisOverLog: [],
      },
      secondInnings: {
        inningsNumber: 2,
        team: 'Chittagong Kings',
        bowlingTeam: 'Dhaka Gladiators',
        totalRuns: 160,
        totalWickets: 8,
        totalBalls: 120,
        oversString: '20.0',
        wideRuns: 2,
        nbRuns: 0,
        byeRuns: 0,
        lbRuns: 0,
        penaltyRuns: 0,
        penaltyRunsAgainst: 0,
        pastPartnerships: [],
        currentPartnership: { batter1: '', batter2: '', runs: 0, balls: 0 },
        isFreeHit: false,
        isOverComplete: true,
        strikerIdx: 0,
        nonStrikerIdx: 1,
        currentBowlerIdx: 0,
        nextPlayerIdx: 2,
        lastCompletedOverBowlerIdx: -1,
        players: [
          { id: 'p3', name: 'Imrul Kayes', battingHand: 'Left-hand Batsman', runs: 52, balls: 38, fours: 5, sixes: 1, dotBalls: 10, ballLog: [], bowlersFaced: {}, runsVsBowler: {}, isDismissed: true, strikeRate: 136.8 },
        ],
        bowlers: [
          { id: 'b2', name: 'Mustafizur Rahman', ballsBowled: 24, maidens: 0, runs: 22, wickets: 3, overHistory: [] },
        ],
        fallOfWickets: [],
        thisOverLog: [],
      },
    };

    it('generates rich English match narrative with headline, summary, and highlights', () => {
      const narrative = MatchNarrativeEngine.generateNarrative(mockCompletedMatch);

      expect(narrative.headlineEn).toContain('Dhaka Gladiators');
      expect(narrative.summaryEn).toContain('175/5');
      expect(narrative.summaryEn).toContain('160/8');
      expect(narrative.battingHighlightsEn).toContain('Tamim Iqbal');
      expect(narrative.battingHighlightsEn).toContain('78');
      expect(narrative.bowlingHighlightsEn).toContain('Mustafizur Rahman');
      expect(narrative.bowlingHighlightsEn).toContain('3 wickets for 22 runs');
      expect(narrative.fullReportEn).toContain('Mustafizur Rahman');
    });

    it('generates authentic Bengali (বাংলা) match narrative with accurate grammar', () => {
      const narrative = MatchNarrativeEngine.generateNarrative(mockCompletedMatch);

      expect(narrative.headlineBn).toContain('Dhaka Gladiators');
      expect(narrative.headlineBn).toContain('জয়');
      expect(narrative.summaryBn).toContain('১৭৫/৫');
      expect(narrative.summaryBn).toContain('১৬০/৮');
      expect(narrative.battingHighlightsBn).toContain('Tamim Iqbal');
      expect(narrative.battingHighlightsBn).toContain('৭৮');
      expect(narrative.bowlingHighlightsBn).toContain('Mustafizur Rahman');
      expect(narrative.fullReportBn).toContain('Mustafizur Rahman');
    });

    it('generates customized thrilling narrative for Tied and Super Over matches', () => {
      const tiedMatch: MatchScorecard = {
        ...mockCompletedMatch,
        winner: undefined,
        loser: undefined,
        result: 'Match Tied',
        resultType: 'TIE',
      };

      const narrativeTied = MatchNarrativeEngine.generateNarrative(tiedMatch);
      expect(narrativeTied.headlineEn).toContain('Epic Tie');
      expect(narrativeTied.headlineBn).toContain('মহানাটকীয় সমতা');

      const superOverMatch: MatchScorecard = {
        ...mockCompletedMatch,
        superOverMatchId: 'so_101',
        superOverResult: {
          winner: 'Dhaka Gladiators',
          resultText: 'Dhaka Gladiators won by 4 runs',
          teamAScore: '14/1',
          teamBScore: '10/2',
        },
      };

      const narrativeSO = MatchNarrativeEngine.generateNarrative(superOverMatch);
      expect(narrativeSO.headlineEn).toContain('Super Over');
      expect(narrativeSO.headlineBn).toContain('সুপার ওভারে');
    });
  });
});
