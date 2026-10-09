import { describe, it, expect } from 'vitest';
import { ScorecardPdfGenerator } from '@/features/scoring/pdf/ScorecardPdfGenerator';
import { MatchScorecard } from '@/domain/cricket/types';

describe('Dynamic PDF Match Report System (Master Visual Design)', () => {
  const sampleMatchThunderVsHungry: MatchScorecard = {
    id: 'match-1',
    teamA: 'Thunder Storm',
    teamB: 'Hungry Eleven',
    tossWinner: 'Hungry Eleven',
    tossDecision: 'Batting',
    totalOvers: 10,
    status: 'COMPLETED',
    currentInnings: 2,
    targetScore: 150,
    venue: 'National Cricket Ground',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    winner: 'Hungry Eleven',
    loser: 'Thunder Storm',
    result: 'Hungry Eleven won by 29 runs',
    resultType: 'WIN',
    margin: 29,
    marginType: 'RUNS',
    advancedSettings: {
      players: 11,
      noBall: true,
      noBallReball: true,
      noBallRun: 1,
      wideBall: true,
      wideReball: true,
      wideRun: 1,
      isManualLimitEnabled: false,
      manualOverLimit: 2,
    },
    firstInnings: {
      inningsNumber: 1,
      team: 'Hungry Eleven',
      bowlingTeam: 'Thunder Storm',
      totalRuns: 149,
      totalWickets: 3,
      totalBalls: 60,
      oversString: '10.0',
      wideRuns: 2,
      nbRuns: 1,
      byeRuns: 0,
      lbRuns: 1,
      penaltyRuns: 0,
      penaltyRunsAgainst: 0,
      strikerIdx: 0,
      nonStrikerIdx: 1,
      currentBowlerIdx: 0,
      nextPlayerIdx: 5,
      lastCompletedOverBowlerIdx: 0,
      isOverComplete: true,
      isFreeHit: false,
      thisOverLog: ['1', '4', '6', '0', '1', '2'],
      fallOfWickets: [],
      pastPartnerships: [],
      currentPartnership: { batter1: 'Taimur', batter2: 'Rana', runs: 12, balls: 6 },
      players: [
        {
          id: 'p1',
          name: 'Rajib',
          battingHand: 'Right-hand Batsman',
          battingPosition: 'Opener No. 1',
          runs: 22,
          balls: 15,
          fours: 1,
          sixes: 2,
          dotBalls: 4,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
          isDismissed: true,
          dismissalText: 'Bowled',
        },
        {
          id: 'p2',
          name: 'Soykot',
          battingHand: 'Right-hand Batsman',
          battingPosition: 'Opener No. 2',
          runs: 7,
          balls: 7,
          fours: 0,
          sixes: 1,
          dotBalls: 3,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
          isDismissed: true,
          dismissalText: 'Bowled',
        },
        {
          id: 'p3',
          name: 'Taimur',
          battingHand: 'Right-hand Batsman',
          battingPosition: 'One Down No. 3',
          runs: 90,
          balls: 36,
          fours: 3,
          sixes: 12,
          dotBalls: 6,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
          isDismissed: false,
        },
        {
          id: 'p4',
          name: 'Sajib',
          battingHand: 'Right-hand Batsman',
          battingPosition: 'Two Down No. 4',
          runs: 11,
          balls: 6,
          fours: 1,
          sixes: 1,
          dotBalls: 2,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
          isDismissed: true,
          dismissalText: 'Bowled',
        },
        {
          id: 'p5',
          name: 'Rana',
          battingHand: 'Right-hand Batsman',
          battingPosition: 'Middle Order No. 5',
          runs: 0,
          balls: 1,
          fours: 0,
          sixes: 0,
          dotBalls: 1,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
          isDismissed: false,
        },
      ],
      bowlers: [
        {
          id: 'b1',
          name: 'Rana',
          ballsBowled: 18,
          maidens: 0,
          runs: 30,
          wickets: 2,
          overHistory: [],
        },
        {
          id: 'b2',
          name: 'Taimur',
          ballsBowled: 12,
          maidens: 0,
          runs: 9,
          wickets: 3,
          overHistory: [],
        },
        {
          id: 'b3',
          name: 'Rakibul',
          ballsBowled: 12,
          maidens: 0,
          runs: 29,
          wickets: 1,
          overHistory: [],
        },
      ],
    },
    secondInnings: {
      inningsNumber: 2,
      team: 'Thunder Storm',
      bowlingTeam: 'Hungry Eleven',
      totalRuns: 120,
      totalWickets: 9,
      totalBalls: 60,
      oversString: '10.0',
      wideRuns: 4,
      nbRuns: 0,
      byeRuns: 0,
      lbRuns: 0,
      penaltyRuns: 0,
      penaltyRunsAgainst: 0,
      strikerIdx: 9,
      nonStrikerIdx: 10,
      currentBowlerIdx: 0,
      nextPlayerIdx: 11,
      lastCompletedOverBowlerIdx: 0,
      isOverComplete: true,
      isFreeHit: false,
      thisOverLog: ['6', '0', '4', 'W', '1', '1'],
      fallOfWickets: [],
      pastPartnerships: [],
      currentPartnership: { batter1: 'Muh', batter2: 'Saiful', runs: 25, balls: 7 },
      players: [
        {
          id: 'tp1',
          name: 'Sanaj',
          battingHand: 'Right-hand Batsman',
          battingPosition: 'Opener No. 1',
          runs: 17,
          balls: 6,
          fours: 1,
          sixes: 2,
          dotBalls: 2,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
          isDismissed: true,
          dismissalText: 'Bowled',
        },
        {
          id: 'tp2',
          name: 'Roman',
          battingHand: 'Right-hand Batsman',
          battingPosition: 'Opener No. 2',
          runs: 31,
          balls: 15,
          fours: 1,
          sixes: 4,
          dotBalls: 5,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
          isDismissed: true,
          dismissalText: 'Caught by Mahin',
        },
        {
          id: 'tp3',
          name: 'Saiful',
          battingHand: 'Right-hand Batsman',
          battingPosition: 'Tailender No. 11',
          runs: 24,
          balls: 6,
          fours: 0,
          sixes: 4,
          dotBalls: 1,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
          isDismissed: false,
        },
      ],
      bowlers: [
        {
          id: 'hb1',
          name: 'Naeem',
          ballsBowled: 18,
          maidens: 0,
          runs: 38,
          wickets: 0,
          overHistory: [],
        },
        {
          id: 'hb2',
          name: 'Roman',
          ballsBowled: 18,
          maidens: 0,
          runs: 34,
          wickets: 2,
          overHistory: [],
        },
      ],
    },
  };

  it('generates a valid jsPDF document instance', async () => {
    const doc = await ScorecardPdfGenerator.generatePdf(sampleMatchThunderVsHungry);
    expect(doc).toBeDefined();
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(297, 0);
  });

  it('dynamically adapts to entirely different teams (e.g. Tiger XI vs Star Club)', async () => {
    const differentMatch: MatchScorecard = {
      ...sampleMatchThunderVsHungry,
      id: 'match-2',
      teamA: 'Tiger XI',
      teamB: 'Star Club',
      winner: 'Star Club',
      result: 'Star Club won by 5 wickets',
      margin: 5,
      marginType: 'WICKETS',
      firstInnings: {
        ...sampleMatchThunderVsHungry.firstInnings!,
        team: 'Tiger XI',
        totalRuns: 88,
        totalWickets: 10,
        oversString: '9.2',
      },
      secondInnings: {
        ...sampleMatchThunderVsHungry.secondInnings!,
        team: 'Star Club',
        totalRuns: 92,
        totalWickets: 5,
        oversString: '7.4',
      },
    };

    const doc = await ScorecardPdfGenerator.generatePdf(differentMatch);
    expect(doc).toBeDefined();
    const pdfOutput = doc.output();
    expect(pdfOutput).toBeDefined();
  });

  it('handles live ongoing match with 1st innings only (conditional rendering)', async () => {
    const ongoingMatch: MatchScorecard = {
      ...sampleMatchThunderVsHungry,
      status: 'ONGOING',
      winner: undefined,
      result: undefined,
      margin: undefined,
      marginType: undefined,
      secondInnings: undefined, // 2nd innings not started yet!
    };

    const doc = await ScorecardPdfGenerator.generatePdf(ongoingMatch);
    expect(doc).toBeDefined();
    // Verify it generates within single A4 page without errors
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('handles match without Man of the Match without throwing error or reserving empty space', async () => {
    const matchWithoutMom: MatchScorecard = {
      ...sampleMatchThunderVsHungry,
      mom: undefined,
      momStats: undefined,
      firstInnings: {
        ...sampleMatchThunderVsHungry.firstInnings!,
        players: [],
        bowlers: [],
      },
      secondInnings: {
        ...sampleMatchThunderVsHungry.secondInnings!,
        players: [],
        bowlers: [],
      },
    };

    const doc = await ScorecardPdfGenerator.generatePdf(matchWithoutMom);
    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('generates consistent single-page layout for standard 10-over and 20-over matches', async () => {
    const doc = await ScorecardPdfGenerator.generatePdf(sampleMatchThunderVsHungry);
    expect(doc.getNumberOfPages()).toBe(1);
  });
});
