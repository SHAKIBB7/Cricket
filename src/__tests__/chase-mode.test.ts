import { describe, it, expect, beforeEach } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';

describe('Chase Mode Engine Logic', () => {
 it('initializes a chase match directly in innings 2 with correct target and teams', () => {
 const engine = EventSourcedMatchEngine.createChaseMatch({
 chasingTeam: 'Dhaka Gladiators',
 defendingTeam: 'Chittagong Kings',
 targetScore: 120,
 totalOvers: 6,
 strikerName: 'Tamim Iqbal',
 nonStrikerName: 'Shakib Al Hasan',
 bowlerName: 'Mustafizur Rahman',
 });

 expect(engine.currentInningsNumber).toBe(2);
 expect(engine.targetScore).toBe(120);

 // Active innings should be the chasing team batting
 expect(engine.currentInnings.inningsNumber).toBe(2);
 expect(engine.currentInnings.team).toBe('Dhaka Gladiators');
 expect(engine.currentInnings.bowlingTeam).toBe('Chittagong Kings');
 expect(engine.currentInnings.players[0].name).toBe('Tamim Iqbal');
 expect(engine.currentInnings.players[1].name).toBe('Shakib Al Hasan');
 expect(engine.currentInnings.bowlers[0].name).toBe('Mustafizur Rahman');
 expect(engine.currentInnings.totalRuns).toBe(0);
 expect(engine.currentInnings.totalBalls).toBe(0);

 // 1st innings should record the defending team score that established the target
 expect(engine.firstInnings.team).toBe('Chittagong Kings');
 expect(engine.firstInnings.bowlingTeam).toBe('Dhaka Gladiators');
 expect(engine.firstInnings.totalRuns).toBe(119);
 expect(engine.firstInnings.totalBalls).toBe(36);
 expect(engine.firstInnings.oversString).toBe('6.0');

 // Domain events emitted
 const matchCreated = engine.events.find((e) => e.type === 'MATCH_CREATED');
 const inningsStarted = engine.events.find((e) => e.type === 'INNINGS_STARTED');
 expect(matchCreated).toBeDefined();
 expect(inningsStarted).toBeDefined();
 expect(inningsStarted?.payload.targetScore).toBe(120);
 expect(inningsStarted?.payload.isChaseMode).toBe(true);
 });

 it('declares chasing team as winner by wickets when target is reached', () => {
 const engine = EventSourcedMatchEngine.createChaseMatch({
 chasingTeam: 'Dhaka Gladiators',
 defendingTeam: 'Chittagong Kings',
 targetScore: 10,
 totalOvers: 2,
 advancedSettings: { players: 11 },
 });

 // Score: 4, 4, 1, 1 (Total: 10 runs reached)
 engine.scoreBall({ runsScored: 4 });
 expect(engine.isInningsOver).toBe(false);

 engine.scoreBall({ runsScored: 4 });
 expect(engine.isInningsOver).toBe(false);

 engine.scoreBall({ runsScored: 1 });
 expect(engine.isInningsOver).toBe(false);

 engine.scoreBall({ runsScored: 1 });
 expect(engine.currentInnings.totalRuns).toBe(10);
 expect(engine.isInningsOver).toBe(true);
 expect(engine.isMatchCompleted).toBe(true);

 const scorecard = engine.completeMatch();
 expect(scorecard.winner).toBe('Dhaka Gladiators');
 expect(scorecard.result).toBe('Dhaka Gladiators won by 10 wickets');
 expect(scorecard.status).toBe('COMPLETED');
 });

 it('handles boundary hit exceeding target on the winning ball', () => {
 const engine = EventSourcedMatchEngine.createChaseMatch({
 chasingTeam: 'Dhaka Gladiators',
 defendingTeam: 'Chittagong Kings',
 targetScore: 6,
 totalOvers: 2,
 advancedSettings: { players: 11 },
 });

 // Needed 6 runs, hits a 6 on ball 1 (total 6)
 engine.scoreBall({ runsScored: 6 });
 expect(engine.currentInnings.totalRuns).toBe(6);
 expect(engine.isInningsOver).toBe(true);
 expect(engine.isMatchCompleted).toBe(true);

 const scorecard = engine.completeMatch();
 expect(scorecard.winner).toBe('Dhaka Gladiators');
 expect(scorecard.result).toBe('Dhaka Gladiators won by 10 wickets');
 });

 it('declares defending team as winner by runs when chasing team loses all wickets', () => {
 const engine = EventSourcedMatchEngine.createChaseMatch({
 chasingTeam: 'Dhaka Gladiators',
 defendingTeam: 'Chittagong Kings',
 targetScore: 50,
 totalOvers: 5,
 advancedSettings: { players: 2 }, // 2 players => 1 wicket is all out
 });

 // Score 10 runs then lose the only wicket
 engine.scoreBall({ runsScored: 6 });
 engine.scoreBall({ runsScored: 4 });
 engine.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled' });

 expect(engine.currentInnings.totalWickets).toBe(1);
 expect(engine.isInningsOver).toBe(true);
 expect(engine.isMatchCompleted).toBe(true);

 const scorecard = engine.completeMatch();
 expect(scorecard.winner).toBe('Chittagong Kings');
 // Inn 1 had 49 runs, Inn 2 had 10 runs -> won by 39 runs
 expect(scorecard.result).toBe('Chittagong Kings won by 39 runs');
 });

 it('declares defending team as winner by runs when overs expire before reaching target', () => {
 const engine = EventSourcedMatchEngine.createChaseMatch({
 chasingTeam: 'Dhaka Gladiators',
 defendingTeam: 'Chittagong Kings',
 targetScore: 20,
 totalOvers: 1, // 1 over = 6 balls
 advancedSettings: { players: 11 },
 });

 // Score six 1s (total 6 runs)
 for (let i = 0; i < 6; i++) {
 engine.scoreBall({ runsScored: 1 });
 }

 expect(engine.currentInnings.totalBalls).toBe(6);
 expect(engine.currentInnings.totalRuns).toBe(6);
 expect(engine.isInningsOver).toBe(true);
 expect(engine.isMatchCompleted).toBe(true);

 const scorecard = engine.completeMatch();
 expect(scorecard.winner).toBe('Chittagong Kings');
 // Inn 1 had 19 runs, Inn 2 had 6 runs -> won by 13 runs
 expect(scorecard.result).toBe('Chittagong Kings won by 13 runs');
 });

 it('declares a tie when chasing team finishes with scores level (targetScore - 1)', () => {
 const engine = EventSourcedMatchEngine.createChaseMatch({
 chasingTeam: 'Dhaka Gladiators',
 defendingTeam: 'Chittagong Kings',
 targetScore: 10, // Defending team scored 9 runs
 totalOvers: 1,
 advancedSettings: { players: 11 },
 });

 // Score 9 runs in 6 balls (scores level)
 engine.scoreBall({ runsScored: 4 });
 engine.scoreBall({ runsScored: 2 });
 engine.scoreBall({ runsScored: 1 });
 engine.scoreBall({ runsScored: 1 });
 engine.scoreBall({ runsScored: 1 });
 engine.scoreBall({ runsScored: 0 }); // 6th ball dot

 expect(engine.currentInnings.totalRuns).toBe(9);
 expect(engine.currentInnings.totalBalls).toBe(6);
 expect(engine.isInningsOver).toBe(true);
 expect(engine.isMatchCompleted).toBe(true);

 const scorecard = engine.completeMatch();
 expect(scorecard.winner).toBe('Both Teams');
 expect(scorecard.result).toBe('Match Tied');
 });

 it('supports undo accurately in Chase Mode', () => {
 const engine = EventSourcedMatchEngine.createChaseMatch({
 chasingTeam: 'Dhaka Gladiators',
 defendingTeam: 'Chittagong Kings',
 targetScore: 50,
 totalOvers: 5,
 });

 engine.scoreBall({ runsScored: 6 });
 expect(engine.currentInnings.totalRuns).toBe(6);

 const undoSuccess = engine.undo();
 expect(undoSuccess).toBe(true);
 expect(engine.currentInnings.totalRuns).toBe(0);
 expect(engine.currentInningsNumber).toBe(2);
 expect(engine.targetScore).toBe(50);
 });

 it('handles penalty runs in Chase Mode towards target', () => {
 const engine = EventSourcedMatchEngine.createChaseMatch({
 chasingTeam: 'Dhaka Gladiators',
 defendingTeam: 'Chittagong Kings',
 targetScore: 6,
 totalOvers: 5,
 });

 // Award 5 penalty runs to batting team
 engine.awardPenaltyRuns(5, true, 'Fielding infringement');
 expect(engine.currentInnings.totalRuns).toBe(5);
 expect(engine.isInningsOver).toBe(false);

 // Score 1 run -> reaches target of 6
 engine.scoreBall({ runsScored: 1 });
 expect(engine.currentInnings.totalRuns).toBe(6);
 expect(engine.isInningsOver).toBe(true);
 expect(engine.isMatchCompleted).toBe(true);
 });
});
