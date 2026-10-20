import { describe, it, expect } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { TournamentEngine } from '../domain/tournament/TournamentEngine';
import { ScorecardHtmlGenerator } from '../features/scoring/pdf/ScorecardHtmlGenerator';
import { MatchScorecard } from '../domain/cricket/types';

describe('Enterprise Full Project Audit & Verification Suite', () => {
  describe('1. Cricket Business Logic: DLS & Revised Target Result Calculations', () => {
    it('correctly declares TIE under DLS when chasing team reaches par score (target - 1)', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Dhaka',
        teamB: 'Chittagong',
        tossWinner: 'Dhaka',
        tossDecision: 'Batting',
        totalOvers: 2,
        advancedSettings: { players: 11 },
      });

      // Innings 1: Dhaka scores 30 runs in 12 balls
      for (let i = 0; i < 12; i++) {
        engine.scoreBall({ runsScored: 2 });
        if (i === 5) {
          engine.changeBowler('Taskin');
        }
      }
      expect(engine.currentInnings.totalRuns).toBe(24);
      expect(engine.isInningsOver).toBe(true);

      // Start 2nd Innings
      engine.startSecondInnings('Batter 1', 'Batter 2', 'Bowler 1');

      // Rain interruption applies DLS: Revised target = 20 in 1 over (6 balls)
      engine.targetScore = 20;
      engine.totalOvers = 1;
      engine.advancedSettings = {
        ...engine.advancedSettings,
        dlsApplied: true,
        dlsRevisedTarget: 20,
        dlsRevisedOvers: 1,
      };

      // Chittagong scores 19 runs (par score = 20 - 1 = 19)
      for (let i = 0; i < 3; i++) {
        engine.scoreBall({ runsScored: 6 });
      }
      engine.scoreBall({ runsScored: 1 });
      engine.scoreBall({ runsScored: 0 });
      engine.scoreBall({ runsScored: 0 });

      expect(engine.currentInnings.totalRuns).toBe(19);
      expect(engine.isInningsOver).toBe(true);
      expect(engine.isMatchCompleted).toBe(true);

      const result = engine.calculateResult();
      expect(result.isCompleted).toBe(true);
      expect(result.resultType).toBe('TIE');
      expect(result.resultText).toBe('Match Tied (DLS Method)');
      expect(result.winner).toBeUndefined();
    });

    it('correctly calculates defending team win by DLS runs margin (parScore - inn2Runs)', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Comilla',
        teamB: 'Sylhet',
        tossWinner: 'Comilla',
        tossDecision: 'Batting',
        totalOvers: 2,
        advancedSettings: { players: 11 },
      });

      // Comilla scores 40 runs in 12 balls
      for (let i = 0; i < 10; i++) {
        engine.scoreBall({ runsScored: 4 });
        if (i === 5) engine.changeBowler('Bowler 2');
      }
      engine.scoreBall({ runsScored: 0 });
      engine.scoreBall({ runsScored: 0 });
      expect(engine.firstInnings.totalRuns).toBe(40);

      engine.startSecondInnings('Batter S1', 'Batter S2', 'Bowler C1');

      // DLS reduces match: Target is 25 in 1 over (parScore = 24)
      engine.targetScore = 25;
      engine.totalOvers = 1;
      engine.advancedSettings = {
        ...engine.advancedSettings,
        dlsApplied: true,
        dlsRevisedTarget: 25,
        dlsRevisedOvers: 1,
      };

      // Sylhet scores 18 runs in 6 balls (needed 25, par 24 -> fell short by 6 runs)
      for (let i = 0; i < 6; i++) {
        engine.scoreBall({ runsScored: 3 });
      }
      expect(engine.secondInnings!.totalRuns).toBe(18);
      expect(engine.isMatchCompleted).toBe(true);

      const result = engine.calculateResult();
      expect(result.resultType).toBe('WIN');
      expect(result.winner).toBe('Comilla');
      expect(result.loser).toBe('Sylhet');
      expect(result.marginType).toBe('RUNS');
      // Par score 24 - 18 = 6 runs margin (NOT 40 - 18 = 22 runs!)
      expect(result.margin).toBe(6);
      expect(result.resultText).toBe('Comilla won by 6 runs (DLS Method)');
    });

    it('prevents false chasing win when team2 runs exceed team1 runs but do not reach increased DLS target', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Rangpur',
        teamB: 'Khulna',
        tossWinner: 'Rangpur',
        tossDecision: 'Batting',
        totalOvers: 1,
        advancedSettings: { players: 11 },
      });

      // Rangpur was interrupted after scoring 10 runs in 6 balls
      for (let i = 0; i < 5; i++) {
        engine.scoreBall({ runsScored: 2 });
      }
      engine.scoreBall({ runsScored: 0 });
      expect(engine.firstInnings.totalRuns).toBe(10);

      engine.startSecondInnings('Batter K1', 'Batter K2', 'Bowler R1');

      // DLS resource adjustment sets revised target to 20 in 1 over (par = 19)
      engine.targetScore = 20;
      engine.totalOvers = 1;
      engine.advancedSettings = {
        ...engine.advancedSettings,
        dlsApplied: true,
        dlsRevisedTarget: 20,
        dlsRevisedOvers: 1,
      };

      // Khulna scores 15 runs (more than Rangpur 10, but LESS than target 20)
      for (let i = 0; i < 5; i++) {
        engine.scoreBall({ runsScored: 3 });
      }
      engine.scoreBall({ runsScored: 0 }); // 15 runs in 6 balls

      expect(engine.secondInnings!.totalRuns).toBe(15);
      expect(engine.isMatchCompleted).toBe(true);

      const result = engine.calculateResult();
      // Khulna did NOT reach 20 runs, so Rangpur MUST WIN
      expect(result.resultType).toBe('WIN');
      expect(result.winner).toBe('Rangpur');
      expect(result.loser).toBe('Khulna');
      // Par score 19 - 15 = 4 runs margin
      expect(result.margin).toBe(4);
      expect(result.resultText).toBe('Rangpur won by 4 runs (DLS Method)');
    });
  });

  describe('2. Blank Data Audit: Non-Empty Incoming Batter Names', () => {
    it('ensures incoming batter receives default designated name if newBatsmanName is omitted on wicket', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Team Red',
        teamB: 'Team Blue',
        tossWinner: 'Team Red',
        tossDecision: 'Batting',
        totalOvers: 5,
        strikerName: 'Opener 1',
        nonStrikerName: 'Opener 2',
        bowlerName: 'Bowler 1',
      });

      // Striker gets bowled, no newBatsmanName supplied
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Bowled',
      });

      const currentStriker = engine.currentInnings.players[engine.currentInnings.strikerIdx];
      expect(currentStriker.name).toBeTruthy();
      expect(currentStriker.name).toBe('Batter 3');
      expect(currentStriker.name.trim()).not.toBe('');
      expect(engine.currentInnings.currentPartnership.batter1).toBe('Batter 3');
    });

    it('ensures retirePlayer assigns valid non-empty batter name to incoming batter', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Team Red',
        teamB: 'Team Blue',
        tossWinner: 'Team Red',
        tossDecision: 'Batting',
        totalOvers: 5,
        strikerName: 'Opener 1',
        nonStrikerName: 'Opener 2',
        bowlerName: 'Bowler 1',
      });

      engine.retirePlayer(true, 'Retire Hurt');

      const currentStriker = engine.currentInnings.players[engine.currentInnings.strikerIdx];
      expect(currentStriker.name).toBeTruthy();
      expect(currentStriker.name).toBe('Batter 3');
      expect(currentStriker.name.trim()).not.toBe('');
    });
  });

  describe('3. Tournament Engine: Fallback for Blank Tournament Name', () => {
    it('assigns fallback name when tournament name is empty or whitespace', () => {
      const tourney = TournamentEngine.createTournament({
        name: '   ',
        format: 'knockout',
        teams: ['Alpha', 'Beta'],
      });

      expect(tourney.name).toBe('New Tournament');
      expect(tourney.teams).toEqual(['Alpha', 'Beta']);
    });
  });

  describe('4. Scorecard HTML Generator: XSS & Null Safety', () => {
    it('safely escapes special characters and handles nullish inputs without throwing', () => {
      const mockScorecard: MatchScorecard = {
        id: 'test_scorecard_101',
        teamA: '<script>alert(1)</script> Tigers',
        teamB: "Warriors & Lion's",
        tossWinner: '<script>alert(1)</script> Tigers',
        tossDecision: 'Batting',
        totalOvers: 10,
        status: 'COMPLETED',
        currentInnings: 2,
        targetScore: 50,
        winner: "Warriors & Lion's",
        result: "Warriors & Lion's won by 5 wickets",
        resultType: 'WIN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        firstInnings: {
          inningsNumber: 1,
          team: '<script>alert(1)</script> Tigers',
          bowlingTeam: "Warriors & Lion's",
          totalRuns: 49,
          totalWickets: 10,
          totalBalls: 60,
          oversString: '10.0',
          wideRuns: 0,
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
            {
              id: 'p1',
              name: 'Shakib "The Champ"',
              battingHand: 'Left-hand Batsman',
              runs: 25,
              balls: 15,
              fours: 3,
              sixes: 1,
              dotBalls: 5,
              ballLog: [],
              bowlersFaced: {},
              runsVsBowler: {},
              isDismissed: true,
              dismissalText: 'Bowled by Archer',
            },
          ],
          bowlers: [
            {
              id: 'b1',
              name: 'Jofra Archer & Co.',
              ballsBowled: 24,
              maidens: 1,
              runs: 18,
              wickets: 3,
              overHistory: [],
            },
          ],
          fallOfWickets: [],
          thisOverLog: [],
        },
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
      };

      const html = ScorecardHtmlGenerator.generateHtml(mockScorecard, null);
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('&amp;');
      expect(html).toContain("Lion's");
      expect(html).toContain('&quot;');
    });
  });
});
