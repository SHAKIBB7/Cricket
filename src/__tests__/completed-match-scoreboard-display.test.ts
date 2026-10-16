import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { InningsData, Player, Bowler } from '../domain/cricket/types';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';

describe('Completed Match Scoreboard Display & Filtering Verification', () => {
  const centerPagePath = path.resolve(__dirname, '../app/matches/center/[matchId]/page.tsx');
  const integratedScoreboardPath = path.resolve(__dirname, '../components/scoring/IntegratedScoreboard.tsx');
  const pdfGeneratorPath = path.resolve(__dirname, '../features/scoring/pdf/ScorecardPdfGenerator.ts');

  const centerContent = fs.readFileSync(centerPagePath, 'utf8');
  const integratedContent = fs.readFileSync(integratedScoreboardPath, 'utf8');
  const pdfContent = fs.readFileSync(pdfGeneratorPath, 'utf8');

  describe('1. Static Code Inspection & Logic Verification', () => {
    it('verifies MatchCenterPage filters active batters based on balls, runs, dismissals, or crease presence', () => {
      expect(centerContent).toContain('const activeBatters = inn.players.filter');
      expect(centerContent).toContain('p.balls > 0');
      expect(centerContent).toContain('p.runs > 0');
      expect(centerContent).toContain('p.isDismissed');
      expect(centerContent).toContain('i === inn.strikerIdx || i === inn.nonStrikerIdx');
    });

    it('verifies MatchCenterPage does NOT render raw inn.players.map without filtering', () => {
      expect(centerContent).not.toContain('{inn.players.map((p, i) =>');
      expect(centerContent).toContain('activeBatters.map((p, i) =>');
    });

    it('verifies MatchCenterPage does NOT set dismissal to "did not bat" for unbatted players in the table', () => {
      expect(centerContent).not.toContain("let dismissal = 'did not bat';");
    });

    it('verifies MatchCenterPage filters active bowlers based on ballsBowled, runs, or wickets', () => {
      expect(centerContent).toContain('const activeBowlers = inn.bowlers.filter');
      expect(centerContent).toContain('b.ballsBowled > 0 || b.runs > 0 || b.wickets > 0');
      expect(centerContent).toContain('activeBowlers.map((b, i) =>');
    });

    it('verifies MatchCenterPage includes empty state fallbacks when no batting or bowling data exists', () => {
      expect(centerContent).toContain('No batting data recorded');
      expect(centerContent).toContain('No bowling data recorded');
    });

    it('verifies IntegratedScoreboard bowler counter uses activeBowlers.length instead of raw bowlers.length', () => {
      expect(integratedContent).toContain('{activeBowlers.length} Bowler');
      expect(integratedContent).not.toContain('{targetInn.bowlers.length} Bowlers Used');
    });

    it('verifies IntegratedScoreboard hides "Yet to bat" section when match is completed', () => {
      expect(integratedContent).toContain('unbattedPlayers.length > 0 && !engine.isMatchCompleted');
    });

    it('verifies ScorecardPdfGenerator filters batters using recorded statistics and crease presence', () => {
      expect(pdfContent).toContain('p.balls > 0 || p.runs > 0 || p.isDismissed');
    });
  });

  describe('2. Batting Display Logic Scenarios', () => {
    // Helper replicating the scoreboard batting filter
    const filterActiveBatters = (inn: InningsData): Player[] => {
      return inn.players.filter((p, i) => {
        if (p.balls > 0) return true;
        if (p.runs > 0) return true;
        if (p.isDismissed) return true;
        if (inn.totalBalls > 0) {
          const isAtCrease = i === inn.strikerIdx || i === inn.nonStrikerIdx;
          if (isAtCrease && p.name && p.name.trim() !== '' && p.name !== 'Select Player') {
            return true;
          }
        }
        return false;
      });
    };

    it('Scenario A: Incomplete player participation — only 3 of 11 players batted', () => {
      const players: Player[] = Array.from({ length: 11 }, (_, i) => ({
        id: `p_${i + 1}`,
        name: `Player ${i + 1}`,
        battingHand: 'Right-hand Batsman',
        battingPosition: String(i + 1),
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        dotBalls: 0,
        isDismissed: false,
        ballLog: [],
        bowlersFaced: {},
        runsVsBowler: {},
      }));

      // Player 1: scored 28 (15b)
      players[0].runs = 28;
      players[0].balls = 15;
      players[0].fours = 3;
      players[0].sixes = 1;
      players[0].isDismissed = true;
      players[0].dismissalText = 'c Keeper b Bowler 1';

      // Player 2: scored 14 (10b)
      players[1].runs = 14;
      players[1].balls = 10;
      players[1].fours = 2;
      players[1].isDismissed = true;
      players[1].dismissalText = 'b Bowler 2';

      // Player 3: 5* (4b)
      players[2].runs = 5;
      players[2].balls = 4;
      players[2].fours = 1;

      // Player 4: 0* (0b) at the crease
      players[3].runs = 0;
      players[3].balls = 0;

      // Players 5-11 never batted and were never at crease

      const mockInnings: InningsData = {
        inningsNumber: 1,
        team: 'Tigers',
        bowlingTeam: 'Lions',
        totalRuns: 47,
        totalWickets: 2,
        totalBalls: 29,
        oversString: '4.5',
        wideRuns: 0,
        nbRuns: 0,
        byeRuns: 0,
        lbRuns: 0,
        penaltyRuns: 0,
        penaltyRunsAgainst: 0,
        players,
        bowlers: [],
        fallOfWickets: [],
        pastPartnerships: [],
        currentPartnership: { batter1: players[2].name, batter2: players[3].name, runs: 5, balls: 4 },
        thisOverLog: [],
        strikerIdx: 2,
        nonStrikerIdx: 3,
        currentBowlerIdx: 0,
        nextPlayerIdx: 4,
        lastCompletedOverBowlerIdx: -1,
        isOverComplete: false,
        isFreeHit: false,
      };

      const result = filterActiveBatters(mockInnings);

      // Only Players 1, 2, 3, and 4 (at crease) should be displayed
      expect(result).toHaveLength(4);
      expect(result.map((p) => p.name)).toEqual(['Player 1', 'Player 2', 'Player 3', 'Player 4']);

      // Players 5-11 must be completely excluded
      for (let i = 4; i < 11; i++) {
        expect(result.some((p) => p.name === `Player ${i + 1}`)).toBe(false);
      }
    });

    it('Scenario B: Duck (0 runs but faced deliveries) remains visible with accurate statistics', () => {
      const players: Player[] = [
        {
          id: 'p_1',
          name: 'Opener A',
          battingHand: 'Right-hand Batsman',
          battingPosition: '1',
          runs: 0,
          balls: 5,
          fours: 0,
          sixes: 0,
          dotBalls: 5,
          isDismissed: true,
          dismissalText: 'lbw b Bowler 1',
          ballLog: ['0', '0', '0', '0', 'W'],
          bowlersFaced: {},
          runsVsBowler: {},
        },
        {
          id: 'p_2',
          name: 'Opener B',
          battingHand: 'Right-hand Batsman',
          battingPosition: '2',
          runs: 35,
          balls: 20,
          fours: 4,
          sixes: 2,
          dotBalls: 8,
          isDismissed: false,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
        },
        {
          id: 'p_3',
          name: 'Dugout Player',
          battingHand: 'Right-hand Batsman',
          battingPosition: '3',
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          dotBalls: 0,
          isDismissed: false,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
        },
      ];

      const mockInnings: InningsData = {
        inningsNumber: 1,
        team: 'Team A',
        bowlingTeam: 'Team B',
        totalRuns: 35,
        totalWickets: 1,
        totalBalls: 25,
        oversString: '4.1',
        wideRuns: 0,
        nbRuns: 0,
        byeRuns: 0,
        lbRuns: 0,
        penaltyRuns: 0,
        penaltyRunsAgainst: 0,
        players,
        bowlers: [],
        fallOfWickets: [],
        pastPartnerships: [],
        currentPartnership: { batter1: players[1].name, batter2: '', runs: 0, balls: 0 },
        thisOverLog: [],
        strikerIdx: 1,
        nonStrikerIdx: 0,
        currentBowlerIdx: 0,
        nextPlayerIdx: 2,
        lastCompletedOverBowlerIdx: -1,
        isOverComplete: false,
        isFreeHit: false,
      };

      const result = filterActiveBatters(mockInnings);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Opener A');
      expect(result[0].runs).toBe(0);
      expect(result[0].balls).toBe(5);
      expect(result[0].isDismissed).toBe(true);

      expect(result[1].name).toBe('Opener B');
      expect(result.some((p) => p.name === 'Dugout Player')).toBe(false);
    });

    it('Scenario C: Diamond duck (run out on 0 balls faced) remains visible with accurate statistics', () => {
      const players: Player[] = [
        {
          id: 'p_1',
          name: 'Striker',
          battingHand: 'Right-hand Batsman',
          battingPosition: '1',
          runs: 10,
          balls: 6,
          fours: 2,
          sixes: 0,
          dotBalls: 2,
          isDismissed: false,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
        },
        {
          id: 'p_2',
          name: 'Non-Striker Run Out',
          battingHand: 'Right-hand Batsman',
          battingPosition: '2',
          runs: 0,
          balls: 0, // Diamond duck!
          fours: 0,
          sixes: 0,
          dotBalls: 0,
          isDismissed: true,
          dismissalText: 'run out (Fielder)',
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
        },
      ];

      const mockInnings: InningsData = {
        inningsNumber: 1,
        team: 'Team A',
        bowlingTeam: 'Team B',
        totalRuns: 10,
        totalWickets: 1,
        totalBalls: 6,
        oversString: '1.0',
        wideRuns: 0,
        nbRuns: 0,
        byeRuns: 0,
        lbRuns: 0,
        penaltyRuns: 0,
        penaltyRunsAgainst: 0,
        players,
        bowlers: [],
        fallOfWickets: [],
        pastPartnerships: [],
        currentPartnership: { batter1: players[0].name, batter2: '', runs: 0, balls: 0 },
        thisOverLog: [],
        strikerIdx: 0,
        nonStrikerIdx: 1,
        currentBowlerIdx: 0,
        nextPlayerIdx: 2,
        lastCompletedOverBowlerIdx: -1,
        isOverComplete: false,
        isFreeHit: false,
      };

      const result = filterActiveBatters(mockInnings);
      expect(result).toHaveLength(2);
      const diamondDuck = result.find((p) => p.name === 'Non-Striker Run Out');
      expect(diamondDuck).toBeDefined();
      expect(diamondDuck?.runs).toBe(0);
      expect(diamondDuck?.balls).toBe(0);
      expect(diamondDuck?.isDismissed).toBe(true);
    });

    it('Scenario D: Completely empty innings has zero active batters', () => {
      const players: Player[] = Array.from({ length: 11 }, (_, i) => ({
        id: `p_${i + 1}`,
        name: `Player ${i + 1}`,
        battingHand: 'Right-hand Batsman',
        battingPosition: String(i + 1),
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        dotBalls: 0,
        isDismissed: false,
        ballLog: [],
        bowlersFaced: {},
        runsVsBowler: {},
      }));

      const mockInnings: InningsData = {
        inningsNumber: 2,
        team: 'Team B',
        bowlingTeam: 'Team A',
        totalRuns: 0,
        totalWickets: 0,
        totalBalls: 0, // 0 balls bowled
        oversString: '0.0',
        wideRuns: 0,
        nbRuns: 0,
        byeRuns: 0,
        lbRuns: 0,
        penaltyRuns: 0,
        penaltyRunsAgainst: 0,
        players,
        bowlers: [],
        fallOfWickets: [],
        pastPartnerships: [],
        currentPartnership: { batter1: '', batter2: '', runs: 0, balls: 0 },
        thisOverLog: [],
        strikerIdx: 0,
        nonStrikerIdx: 1,
        currentBowlerIdx: 0,
        nextPlayerIdx: 2,
        lastCompletedOverBowlerIdx: -1,
        isOverComplete: false,
        isFreeHit: false,
      };

      const result = filterActiveBatters(mockInnings);
      expect(result).toHaveLength(0);
    });
  });

  describe('3. Bowling Display Logic Scenarios', () => {
    // Helper replicating the scoreboard bowling filter
    const filterActiveBowlers = (inn: InningsData): Bowler[] => {
      return inn.bowlers.filter((b) => b.ballsBowled > 0 || b.runs > 0 || b.wickets > 0);
    };

    it('Scenario A: Filters out bowlers who never bowled and have no bowling data', () => {
      const bowlers: Bowler[] = [
        {
          id: 'b_1',
          name: 'Active Bowler 1',
          ballsBowled: 12,
          maidens: 1,
          runs: 8,
          wickets: 2,
          overHistory: [],
        },
        {
          id: 'b_2',
          name: 'Active Bowler 2 (Wicketless)',
          ballsBowled: 6,
          maidens: 0,
          runs: 10,
          wickets: 0,
          overHistory: [],
        },
        {
          id: 'b_3',
          name: 'Unbowled Squad Member 1',
          ballsBowled: 0,
          maidens: 0,
          runs: 0,
          wickets: 0,
          overHistory: [],
        },
        {
          id: 'b_4',
          name: 'Unbowled Squad Member 2',
          ballsBowled: 0,
          maidens: 0,
          runs: 0,
          wickets: 0,
          overHistory: [],
        },
      ];

      const mockInnings: InningsData = {
        inningsNumber: 1,
        team: 'Team A',
        bowlingTeam: 'Team B',
        totalRuns: 18,
        totalWickets: 2,
        totalBalls: 18,
        oversString: '3.0',
        wideRuns: 0,
        nbRuns: 0,
        byeRuns: 0,
        lbRuns: 0,
        penaltyRuns: 0,
        penaltyRunsAgainst: 0,
        players: [],
        bowlers,
        fallOfWickets: [],
        pastPartnerships: [],
        currentPartnership: { batter1: '', batter2: '', runs: 0, balls: 0 },
        thisOverLog: [],
        strikerIdx: 0,
        nonStrikerIdx: 1,
        currentBowlerIdx: 1,
        nextPlayerIdx: 2,
        lastCompletedOverBowlerIdx: -1,
        isOverComplete: false,
        isFreeHit: false,
      };

      const result = filterActiveBowlers(mockInnings);

      expect(result).toHaveLength(2);
      expect(result.map((b) => b.name)).toEqual(['Active Bowler 1', 'Active Bowler 2 (Wicketless)']);
      expect(result.some((b) => b.name.includes('Unbowled'))).toBe(false);
    });

    it('Scenario B: Bowler who bowled without taking wickets remains visible (Requirement 5)', () => {
      const bowlers: Bowler[] = [
        {
          id: 'b_1',
          name: 'Economical Bowler',
          ballsBowled: 18,
          maidens: 1,
          runs: 7,
          wickets: 0, // 0 wickets
          overHistory: [],
        },
      ];

      const mockInnings: InningsData = {
        inningsNumber: 1,
        team: 'Team A',
        bowlingTeam: 'Team B',
        totalRuns: 7,
        totalWickets: 0,
        totalBalls: 18,
        oversString: '3.0',
        wideRuns: 0,
        nbRuns: 0,
        byeRuns: 0,
        lbRuns: 0,
        penaltyRuns: 0,
        penaltyRunsAgainst: 0,
        players: [],
        bowlers,
        fallOfWickets: [],
        pastPartnerships: [],
        currentPartnership: { batter1: '', batter2: '', runs: 0, balls: 0 },
        thisOverLog: [],
        strikerIdx: 0,
        nonStrikerIdx: 1,
        currentBowlerIdx: 0,
        nextPlayerIdx: 2,
        lastCompletedOverBowlerIdx: -1,
        isOverComplete: false,
        isFreeHit: false,
      };

      const result = filterActiveBowlers(mockInnings);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Economical Bowler');
      expect(result[0].wickets).toBe(0);
      expect(result[0].ballsBowled).toBe(18);
    });

    it('Scenario C: Bowler who conceded runs on wide/no-ball without legal deliveries remains visible', () => {
      const bowlers: Bowler[] = [
        {
          id: 'b_1',
          name: 'Extra Only Bowler',
          ballsBowled: 0, // No legal balls
          maidens: 0,
          runs: 2, // Conceded 2 runs on extras
          wickets: 0,
          overHistory: [],
        },
      ];

      const mockInnings: InningsData = {
        inningsNumber: 1,
        team: 'Team A',
        bowlingTeam: 'Team B',
        totalRuns: 2,
        totalWickets: 0,
        totalBalls: 0,
        oversString: '0.0',
        wideRuns: 2,
        nbRuns: 0,
        byeRuns: 0,
        lbRuns: 0,
        penaltyRuns: 0,
        penaltyRunsAgainst: 0,
        players: [],
        bowlers,
        fallOfWickets: [],
        pastPartnerships: [],
        currentPartnership: { batter1: '', batter2: '', runs: 0, balls: 0 },
        thisOverLog: [],
        strikerIdx: 0,
        nonStrikerIdx: 1,
        currentBowlerIdx: 0,
        nextPlayerIdx: 2,
        lastCompletedOverBowlerIdx: -1,
        isOverComplete: false,
        isFreeHit: false,
      };

      const result = filterActiveBowlers(mockInnings);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Extra Only Bowler');
      expect(result[0].runs).toBe(2);
    });
  });

  describe('4. End-to-End Match Simulation with EventSourcedMatchEngine', () => {
    it('simulates a completed 2-innings match and verifies filtered scoreboard data accuracy', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Challengers',
        teamB: 'Champions',
        tossWinner: 'Challengers',
        tossDecision: 'Batting',
        totalOvers: 2,
        strikerName: 'Virat',
        nonStrikerName: 'Rohit',
        bowlerName: 'Starc',
      });

      // Innings 1:
      // Ball 1: Virat hits 4
      engine.scoreBall({ runsScored: 4 });
      // Ball 2: Virat hits 6
      engine.scoreBall({ runsScored: 6 });
      // Ball 3: Virat out caught
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Caught',
        newBatsmanName: 'KL Rahul',
        isStrikerOut: true,
      });
      // Ball 4: Rahul scores 1 run, rotates strike
      engine.scoreBall({ runsScored: 1 });
      // Ball 5: Rohit scores 2 runs
      engine.scoreBall({ runsScored: 2 });
      // Ball 6: Rohit scores 1 run
      engine.scoreBall({ runsScored: 1 });

      // Over 2: Change bowler to Cummins
      engine.changeBowler('Cummins');
      // Ball 7: Rohit hits 4
      engine.scoreBall({ runsScored: 4 });
      // Ball 8: Rohit scores 1 run
      engine.scoreBall({ runsScored: 1 });
      // Ball 9: Rahul hits 6
      engine.scoreBall({ runsScored: 6 });
      // Ball 10: Rahul out bowled
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Bowled',
        newBatsmanName: 'Hardik',
        isStrikerOut: true,
      });
      // Ball 11: Hardik faces 0 runs
      engine.scoreBall({ runsScored: 0 });
      // Ball 12: Hardik scores 1 run
      engine.scoreBall({ runsScored: 1 });

      // Innings 1 is now over (12 balls = 2.0 overs)
      expect(engine.firstInnings.totalBalls).toBe(12);
      expect(engine.firstInnings.totalRuns).toBe(26);
      expect(engine.firstInnings.totalWickets).toBe(2);

      // Start 2nd Innings
      engine.startSecondInnings('Warner', 'Head', 'Bumrah');

      // Chase 27 to win:
      // Ball 1: Warner hits 6
      engine.scoreBall({ runsScored: 6 });
      // Ball 2: Warner hits 6
      engine.scoreBall({ runsScored: 6 });
      // Ball 3: Warner hits 6
      engine.scoreBall({ runsScored: 6 });
      // Ball 4: Warner hits 6
      engine.scoreBall({ runsScored: 6 });
      // Ball 5: Warner hits 4 -> 28 runs, target 27 reached!
      engine.scoreBall({ runsScored: 4 });

      expect(engine.isMatchCompleted).toBe(true);

      const scorecard = engine.completeMatch();
      expect(scorecard.status).toBe('COMPLETED');
      expect(scorecard.winner).toBe('Champions');

      // --- VERIFY INNINGS 1 SCOREBOARD DISPLAY DATA ---
      const inn1 = scorecard.firstInnings!;
      const inn1Batters = inn1.players.filter((p, i) => {
        if (p.balls > 0 || p.runs > 0 || p.isDismissed) return true;
        if (inn1.totalBalls > 0 && (i === inn1.strikerIdx || i === inn1.nonStrikerIdx) && p.name) return true;
        return false;
      });

      // 4 batters participated: Virat, Rohit, KL Rahul, Hardik
      expect(inn1Batters).toHaveLength(4);
      expect(inn1Batters.map((p) => p.name.split(' (')[0])).toEqual(['Virat', 'Rohit', 'KL Rahul', 'Hardik']);

      // Innings 1 Bowlers: Starc and Cummins
      const inn1Bowlers = inn1.bowlers.filter((b) => b.ballsBowled > 0 || b.runs > 0 || b.wickets > 0);
      expect(inn1Bowlers).toHaveLength(2);
      expect(inn1Bowlers.map((b) => b.name)).toEqual(['Starc', 'Cummins']);

      // --- VERIFY INNINGS 2 SCOREBOARD DISPLAY DATA ---
      const inn2 = scorecard.secondInnings!;
      const inn2Batters = inn2.players.filter((p, i) => {
        if (p.balls > 0 || p.runs > 0 || p.isDismissed) return true;
        if (inn2.totalBalls > 0 && (i === inn2.strikerIdx || i === inn2.nonStrikerIdx) && p.name) return true;
        return false;
      });

      // Warner faced 5 balls, scored 28*. Head was at the non-striker crease (0 balls, 0 runs, not out*)
      expect(inn2Batters).toHaveLength(2);
      expect(inn2Batters[0].name).toBe('Warner');
      expect(inn2Batters[0].runs).toBe(28);
      expect(inn2Batters[0].balls).toBe(5);

      expect(inn2Batters[1].name).toBe('Head');
      expect(inn2Batters[1].runs).toBe(0);
      expect(inn2Batters[1].balls).toBe(0);
      expect(inn2Batters[1].isDismissed).toBe(false);

      // Remaining 9 squad members in inn2.players must NOT be in inn2Batters
      expect(inn2.players.length).toBeGreaterThan(2);
      for (let i = 2; i < inn2.players.length; i++) {
        expect(inn2Batters.includes(inn2.players[i])).toBe(false);
      }

      // Innings 2 Bowlers: Bumrah bowled 5 balls
      const inn2Bowlers = inn2.bowlers.filter((b) => b.ballsBowled > 0 || b.runs > 0 || b.wickets > 0);
      expect(inn2Bowlers).toHaveLength(1);
      expect(inn2Bowlers[0].name).toBe('Bumrah');
      expect(inn2Bowlers[0].ballsBowled).toBe(5);
      expect(inn2Bowlers[0].runs).toBe(28);

      // Data preservation check: Raw inn1 and inn2 player arrays retain all initialized squad slots
      expect(inn1.players.length).toBeGreaterThanOrEqual(11);
      expect(inn2.players.length).toBeGreaterThanOrEqual(11);
    });
  });
});
