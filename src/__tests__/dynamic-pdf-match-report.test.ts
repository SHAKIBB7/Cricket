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

  describe('Ground Information Section at PDF Top', () => {
    it('renders GROUND INFORMATION section with only Ground Name immediately at the top', async () => {
      const doc = await ScorecardPdfGenerator.generatePdf(sampleMatchThunderVsHungry);
      const pdfString = doc.output();

      // Verify Ground Information section and field are present
      expect(pdfString).toContain('GROUND INFORMATION');
      expect(pdfString).toContain('Ground Name:');
      expect(pdfString).toContain('National Cricket Ground');

      // Verify Ground Information appears immediately below header and before subsequent sections
      const headerIdx = pdfString.indexOf('THUNDER STORM');
      const groundInfoIdx = pdfString.indexOf('GROUND INFORMATION');
      const groundNameIdx = pdfString.indexOf('Ground Name:');
      const momIdx = pdfString.indexOf('MAN OF THE MATCH');
      const battingIdx = pdfString.indexOf('BATTING');

      expect(headerIdx).toBeGreaterThan(-1);
      expect(groundInfoIdx).toBeGreaterThan(headerIdx);
      expect(groundNameIdx).toBeGreaterThan(groundInfoIdx);
      expect(momIdx).toBeGreaterThan(groundNameIdx);
      expect(battingIdx).toBeGreaterThan(momIdx);

      // Verify no other ground fields are included
      expect(pdfString).not.toContain('Latitude:');
      expect(pdfString).not.toContain('Longitude:');
      expect(pdfString).not.toContain('Google Maps');
      expect(pdfString).not.toContain('Ground Status');
      expect(pdfString).not.toContain('Ground ID:');
    });

    it('resolves actual ground name from database when groundId is provided', async () => {
      const { db } = await import('@/infrastructure/database/dexie-db');
      await db.grounds.put({
        id: 'ground-saved-pdf-1',
        name: 'Char Sindur High School Ground',
        latitude: 23.99,
        longitude: 90.65,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const matchWithGroundId: MatchScorecard = {
        ...sampleMatchThunderVsHungry,
        groundId: 'ground-saved-pdf-1',
        venue: undefined,
      };

      const doc = await ScorecardPdfGenerator.generatePdf(matchWithGroundId);
      const pdfString = doc.output();
      expect(pdfString).toContain('GROUND INFORMATION');
      expect(pdfString).toContain('Ground Name:');
      expect(pdfString).toContain('Char Sindur High School Ground');
    });

    it('never displays numeric codes or numbered values instead of actual ground name', async () => {
      const { db } = await import('@/infrastructure/database/dexie-db');
      await db.grounds.put({
        id: 'ground-numeric-heal',
        name: '1',
        referencePlaceName: 'Palash Cricket Club',
        latitude: 23.95,
        longitude: 90.62,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const matchWithNumericVenue: MatchScorecard = {
        ...sampleMatchThunderVsHungry,
        groundId: 'ground-numeric-heal',
        venue: '1', // Numeric string should be rejected
      };

      const doc = await ScorecardPdfGenerator.generatePdf(matchWithNumericVenue);
      const pdfString = doc.output();

      // Ensure "1" is never rendered as the ground name
      expect(pdfString).not.toContain('Ground Name: 1');
      expect(pdfString).toContain('Ground Name:');
      // Should heal to the human-readable alphabetic name
      expect(pdfString).toContain('Palash Cricket Club');
    });

    it('gracefully handles missing ground name without inventing a fake name or breaking PDF generation', async () => {
      const matchWithoutGround: MatchScorecard = {
        ...sampleMatchThunderVsHungry,
        venue: undefined,
        groundId: undefined,
      };

      const doc = await ScorecardPdfGenerator.generatePdf(matchWithoutGround);
      expect(doc).toBeDefined();
      expect(doc.getNumberOfPages()).toBe(1);

      const pdfString = doc.output();
      expect(pdfString).toContain('GROUND INFORMATION');
      expect(pdfString).toContain('Ground Name:');
      expect(pdfString).toContain('Not Available');
      // Must not invent a fake name
      expect(pdfString).not.toContain('Local Cricket Ground');
      expect(pdfString).not.toContain('Standard Ground');
    });

    it('resolves ground name from advancedSettings when top-level groundId is undefined', async () => {
      const { db } = await import('@/infrastructure/database/dexie-db');
      await db.grounds.put({
        id: 'ground-adv-settings-1',
        name: 'Lord\'s Cricket Ground',
        latitude: 51.529,
        longitude: -0.172,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const matchWithAdvGround: MatchScorecard = {
        ...sampleMatchThunderVsHungry,
        groundId: undefined,
        venue: undefined,
        advancedSettings: {
          ...sampleMatchThunderVsHungry.advancedSettings!,
          groundId: 'ground-adv-settings-1',
        },
      };

      const doc = await ScorecardPdfGenerator.generatePdf(matchWithAdvGround);
      const pdfString = doc.output();
      expect(pdfString).toContain('GROUND INFORMATION');
      expect(pdfString).toContain('Ground Name:');
      expect(pdfString).toContain("Lord's Cricket Ground");
    });

    it('resolves ground name when venue field contains a groundId key pointing to database', async () => {
      const { db } = await import('@/infrastructure/database/dexie-db');
      await db.grounds.put({
        id: 'ground_sbns_01',
        name: 'Sher-e-Bangla National Cricket Stadium',
        latitude: 23.806,
        longitude: 90.363,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const matchWithVenueAsId: MatchScorecard = {
        ...sampleMatchThunderVsHungry,
        groundId: undefined,
        venue: 'ground_sbns_01', // ID stored in venue
      };

      const doc = await ScorecardPdfGenerator.generatePdf(matchWithVenueAsId);
      const pdfString = doc.output();
      expect(pdfString).toContain('GROUND INFORMATION');
      expect(pdfString).toContain('Ground Name:');
      expect(pdfString).toContain('Sher-e-Bangla National Cricket Stadium');
      expect(pdfString).not.toContain('Ground Name: ground_sbns_01');
    });

    it('maintains strict single-page constraint on dense 20-over match with full rosters and Ground Information', async () => {
      // Build high-density 20-over match with 10 batters and 5 bowlers in each innings
      const createRoster = (prefix: string) =>
        Array.from({ length: 10 }, (_, i) => ({
          id: `${prefix}_p${i + 1}`,
          name: `${prefix} Player ${i + 1}`,
          battingHand: 'Right-hand Batsman',
          runs: 10 + i * 2,
          balls: 8 + i,
          fours: 1,
          sixes: 1,
          dotBalls: 2,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
          isDismissed: i < 8,
          dismissalText: i < 8 ? 'Bowled' : 'Not out',
        }));

      const createBowlerRoster = (prefix: string) =>
        Array.from({ length: 5 }, (_, i) => ({
          id: `${prefix}_b${i + 1}`,
          name: `${prefix} Bowler ${i + 1}`,
          ballsBowled: 24,
          maidens: 0,
          runs: 25 + i * 3,
          wickets: i + 1,
          overHistory: [],
        }));

      const dense20OverMatch: MatchScorecard = {
        ...sampleMatchThunderVsHungry,
        id: 'dense-match-20ov',
        totalOvers: 20,
        venue: 'Melbourne Cricket Ground',
        firstInnings: {
          ...sampleMatchThunderVsHungry.firstInnings!,
          oversString: '20.0',
          totalRuns: 185,
          totalWickets: 8,
          players: createRoster('TeamA'),
          bowlers: createBowlerRoster('TeamB'),
        },
        secondInnings: {
          ...sampleMatchThunderVsHungry.secondInnings!,
          oversString: '19.4',
          totalRuns: 188,
          totalWickets: 7,
          players: createRoster('TeamB'),
          bowlers: createBowlerRoster('TeamA'),
        },
      };

      const doc = await ScorecardPdfGenerator.generatePdf(dense20OverMatch);
      expect(doc.getNumberOfPages()).toBe(1);

      const pdfString = doc.output();
      expect(pdfString).toContain('GROUND INFORMATION');
      expect(pdfString).toContain('Ground Name:');
      expect(pdfString).toContain('Melbourne Cricket Ground');
    });
  });
});
