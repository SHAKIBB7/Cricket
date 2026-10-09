import { describe, it, expect } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { isMatchTie, isMatchWin } from '../domain/cricket/formatters';
import { TournamentEngine } from '../domain/tournament/TournamentEngine';

describe('International Standard Match Result Logic (MCC Law 16)', () => {
  it('evaluates Defending Team Win by Runs (margin > 1 runs)', () => {
    const engine = new EventSourcedMatchEngine({
      teamA: 'Australia',
      teamB: 'India',
      tossWinner: 'Australia',
      tossDecision: 'Batting',
      totalOvers: 1, // 6 balls
      advancedSettings: { players: 11 },
    });

    // Innings 1: Australia scores 20 runs
    for (let i = 0; i < 5; i++) {
      engine.scoreBall({ runsScored: 4 });
    }
    engine.scoreBall({ runsScored: 0 }); // 6th ball
    expect(engine.currentInnings.totalRuns).toBe(20);
    expect(engine.isInningsOver).toBe(true);

    // Transition to 2nd innings (Target = 21)
    engine.startSecondInnings('Rohit', 'Gill', 'Starc');
    expect(engine.targetScore).toBe(21);

    // Innings 2: India scores 12 runs in 6 balls
    for (let i = 0; i < 6; i++) {
      engine.scoreBall({ runsScored: 2 });
    }
    expect(engine.currentInnings.totalRuns).toBe(12);
    expect(engine.isInningsOver).toBe(true);
    expect(engine.isMatchCompleted).toBe(true);

    const result = engine.calculateResult();
    expect(result.isCompleted).toBe(true);
    expect(result.resultType).toBe('WIN');
    expect(result.winner).toBe('Australia');
    expect(result.loser).toBe('India');
    expect(result.marginType).toBe('RUNS');
    expect(result.margin).toBe(8);
    expect(result.resultText).toBe('Australia won by 8 runs');

    const scorecard = engine.completeMatch();
    expect(scorecard.winner).toBe('Australia');
    expect(scorecard.loser).toBe('India');
    expect(scorecard.result).toBe('Australia won by 8 runs');
    expect(scorecard.resultType).toBe('WIN');
    expect(isMatchWin(scorecard)).toBe(true);
    expect(isMatchTie(scorecard)).toBe(false);
  });

  it('evaluates Defending Team Win by 1 run (singular margin)', () => {
    const engine = EventSourcedMatchEngine.createChaseMatch({
      chasingTeam: 'Pakistan',
      defendingTeam: 'South Africa',
      targetScore: 16, // SA scored 15
      totalOvers: 1,
      advancedSettings: { players: 11 },
    });

    // Pakistan scores 14 runs in 6 balls
    for (let i = 0; i < 4; i++) {
      engine.scoreBall({ runsScored: 3 });
    }
    engine.scoreBall({ runsScored: 2 });
    engine.scoreBall({ runsScored: 0 }); // 6th ball dot

    expect(engine.currentInnings.totalRuns).toBe(14);
    expect(engine.isInningsOver).toBe(true);
    expect(engine.isMatchCompleted).toBe(true);

    const scorecard = engine.completeMatch();
    expect(scorecard.winner).toBe('South Africa');
    expect(scorecard.loser).toBe('Pakistan');
    expect(scorecard.marginType).toBe('RUNS');
    expect(scorecard.margin).toBe(1);
    expect(scorecard.result).toBe('South Africa won by 1 run');
    expect(scorecard.resultType).toBe('WIN');
  });

  it('evaluates Chasing Team Win by Wickets (margin > 1 wickets)', () => {
    const engine = EventSourcedMatchEngine.createChaseMatch({
      chasingTeam: 'England',
      defendingTeam: 'New Zealand',
      targetScore: 15, // NZ scored 14
      totalOvers: 2,
      advancedSettings: { players: 11 },
    });

    // Lose 2 wickets
    engine.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled', newBatsmanName: 'Batter 3' });
    engine.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Caught', newBatsmanName: 'Batter 4' });

    // Score winning runs
    engine.scoreBall({ runsScored: 6 });
    engine.scoreBall({ runsScored: 6 });
    engine.scoreBall({ runsScored: 4 }); // 16 runs, target 15 achieved!

    expect(engine.currentInnings.totalRuns).toBe(16);
    expect(engine.currentInnings.totalWickets).toBe(2);
    expect(engine.isInningsOver).toBe(true);
    expect(engine.isMatchCompleted).toBe(true);

    const scorecard = engine.completeMatch();
    // 10 max wickets - 2 wickets lost = 8 wickets
    expect(scorecard.winner).toBe('England');
    expect(scorecard.loser).toBe('New Zealand');
    expect(scorecard.marginType).toBe('WICKETS');
    expect(scorecard.margin).toBe(8);
    expect(scorecard.result).toBe('England won by 8 wickets');
    expect(scorecard.resultType).toBe('WIN');
    expect(isMatchWin(scorecard)).toBe(true);
    expect(isMatchTie(scorecard)).toBe(false);
  });

  it('evaluates Chasing Team Win by 1 wicket (singular margin)', () => {
    const engine = EventSourcedMatchEngine.createChaseMatch({
      chasingTeam: 'Sri Lanka',
      defendingTeam: 'Bangladesh',
      targetScore: 10,
      totalOvers: 3,
      advancedSettings: { players: 3 }, // 3 players => 2 max wickets. 1 wicket lost leaves 1 wicket
    });

    // Lose 1 wicket (1 wicket remaining)
    engine.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled', newBatsmanName: 'Last Batter' });
    expect(engine.currentInnings.totalWickets).toBe(1);

    // Hit a six to win the match
    engine.scoreBall({ runsScored: 10 });
    expect(engine.currentInnings.totalRuns).toBe(10);
    expect(engine.isInningsOver).toBe(true);
    expect(engine.isMatchCompleted).toBe(true);

    const scorecard = engine.completeMatch();
    expect(scorecard.winner).toBe('Sri Lanka');
    expect(scorecard.loser).toBe('Bangladesh');
    expect(scorecard.marginType).toBe('WICKETS');
    expect(scorecard.margin).toBe(1);
    expect(scorecard.result).toBe('Sri Lanka won by 1 wicket');
    expect(scorecard.resultType).toBe('WIN');
  });

  it('evaluates Match Tie when scores are identical at conclusion (MCC Law 16.5.1)', () => {
    const engine = EventSourcedMatchEngine.createChaseMatch({
      chasingTeam: 'India',
      defendingTeam: 'England',
      targetScore: 21, // Defending team scored 20
      totalOvers: 1, // 6 balls
      advancedSettings: { players: 11 },
    });

    // India scores exactly 20 runs in 6 balls (scores level)
    for (let i = 0; i < 5; i++) {
      engine.scoreBall({ runsScored: 4 });
    }
    engine.scoreBall({ runsScored: 0 }); // 6th ball dot

    expect(engine.currentInnings.totalRuns).toBe(20);
    expect(engine.currentInnings.totalBalls).toBe(6);
    expect(engine.isInningsOver).toBe(true);
    expect(engine.isMatchCompleted).toBe(true);

    const result = engine.calculateResult();
    expect(result.isCompleted).toBe(true);
    expect(result.resultType).toBe('TIE');
    expect(result.winner).toBeUndefined();
    expect(result.loser).toBeUndefined();
    expect(result.marginType).toBe('NONE');
    expect(result.margin).toBe(0);
    expect(result.resultText).toBe('Match Tied');

    const scorecard = engine.completeMatch();
    expect(scorecard.winner).toBeUndefined();
    expect(scorecard.loser).toBeUndefined();
    expect(scorecard.result).toBe('Match Tied');
    expect(scorecard.resultType).toBe('TIE');
    expect(isMatchTie(scorecard)).toBe(true);
    expect(isMatchWin(scorecard)).toBe(false);
  });

  it('reports In Progress state when match is not concluded', () => {
    const engine = new EventSourcedMatchEngine({
      teamA: 'Team X',
      teamB: 'Team Y',
      tossWinner: 'Team X',
      tossDecision: 'Batting',
      totalOvers: 2,
    });

    // Innings 1, first ball
    engine.scoreBall({ runsScored: 4 });
    expect(engine.isMatchCompleted).toBe(false);
    expect(engine.calculateResult().resultType).toBe('IN_PROGRESS');
    expect(engine.calculateResult().isCompleted).toBe(false);

    const midScorecard = engine.toScorecard();
    expect(midScorecard.status).toBe('ONGOING');
    expect(isMatchTie(midScorecard)).toBe(false);
    expect(isMatchWin(midScorecard)).toBe(false);
  });

  it('correctly updates Tournament Standings for Win, Loss, and Tie', () => {
    let tournament = TournamentEngine.createTournament({
      name: 'World Cup Group Stage',
      format: 'league',
      teams: ['Australia', 'India', 'England'],
    });

    const fix1 = tournament.fixtures[0]; // Australia vs India
    const fix2 = tournament.fixtures[1]; // Australia vs England

    // Match 1: Australia defeats India
    tournament = TournamentEngine.recordWinner({
      tournament,
      fixtureId: fix1.id,
      winner: 'Australia',
      resultText: 'Australia won by 25 runs',
    });

    // Match 2: Australia ties with England
    tournament = TournamentEngine.recordTie({
      tournament,
      fixtureId: fix2.id,
      resultText: 'Match Tied',
    });

    const table = TournamentEngine.standings(tournament);
    const aus = table.find((t) => t.team === 'Australia')!;
    const ind = table.find((t) => t.team === 'India')!;
    const eng = table.find((t) => t.team === 'England')!;

    // Australia: 1 win (2 pts) + 1 tie (1 pt) = 3 pts
    expect(aus.played).toBe(2);
    expect(aus.wins).toBe(1);
    expect(aus.ties).toBe(1);
    expect(aus.losses).toBe(0);
    expect(aus.points).toBe(3);

    // India: 1 loss = 0 pts
    expect(ind.played).toBe(1);
    expect(ind.wins).toBe(0);
    expect(ind.losses).toBe(1);
    expect(ind.points).toBe(0);

    // England: 1 tie = 1 pt
    expect(eng.played).toBe(1);
    expect(eng.ties).toBe(1);
    expect(eng.points).toBe(1);

    // Verification of table sort order: Australia (3 pts) > England (1 pt) > India (0 pts)
    expect(table[0].team).toBe('Australia');
    expect(table[1].team).toBe('England');
    expect(table[2].team).toBe('India');
  });
});
