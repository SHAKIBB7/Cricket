import { describe, it, expect, beforeEach } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { ManOfTheMatchEngine } from '../domain/cricket/analytics/ManOfTheMatchEngine';
import { DotBallAnalytics } from '../domain/cricket/analytics/DotBallAnalytics';

describe('EventSourcedMatchEngine', () => {
 let engine: EventSourcedMatchEngine;

 beforeEach(() => {
 engine = new EventSourcedMatchEngine({
 teamA: 'Dhaka Gladiators',
 teamB: 'Chittagong Kings',
 tossWinner: 'Dhaka Gladiators',
 tossDecision: 'Batting',
 totalOvers: 2,
 strikerName: 'Tamim Iqbal',
 nonStrikerName: 'Shakib Al Hasan',
 bowlerName: 'Mustafizur Rahman',
 });
 });

 it('initializes match with correct batting and bowling teams', () => {
 expect(engine.currentInnings.team).toBe('Dhaka Gladiators');
 expect(engine.currentInnings.bowlingTeam).toBe('Chittagong Kings');
 expect(engine.currentInnings.players[0].name).toBe('Tamim Iqbal');
 expect(engine.currentInnings.players[1].name).toBe('Shakib Al Hasan');
 expect(engine.currentInnings.bowlers[0].name).toBe('Mustafizur Rahman');
 expect(engine.currentInnings.totalRuns).toBe(0);
 expect(engine.currentInnings.totalBalls).toBe(0);
 });

 it('scores dot ball and increments balls faced and dot balls', () => {
 engine.scoreBall({ runsScored: 0 });

 const inn = engine.currentInnings;
 expect(inn.totalRuns).toBe(0);
 expect(inn.totalBalls).toBe(1);
 expect(inn.players[0].runs).toBe(0);
 expect(inn.players[0].balls).toBe(1);
 expect(inn.players[0].dotBalls).toBe(1);
 expect(inn.bowlers[0].ballsBowled).toBe(1);
 expect(inn.strikerIdx).toBe(0); // 0 runs => strike does not change
 });

 it('swaps strike on odd runs scored', () => {
 engine.scoreBall({ runsScored: 1 });

 const inn = engine.currentInnings;
 expect(inn.totalRuns).toBe(1);
 expect(inn.players[0].runs).toBe(1);
 expect(inn.strikerIdx).toBe(1); // Shakib is now striker!
 });

 it('records boundaries correctly (4s and 6s)', () => {
 engine.scoreBall({ runsScored: 4 });
 expect(engine.currentInnings.players[0].fours).toBe(1);
 expect(engine.currentInnings.players[0].runs).toBe(4);

 engine.scoreBall({ runsScored: 6 });
 expect(engine.currentInnings.players[0].sixes).toBe(1);
 expect(engine.currentInnings.players[0].runs).toBe(10);
 expect(engine.currentInnings.totalRuns).toBe(10);
 });

 it('handles wide ball: penalty runs added, batter balls not incremented', () => {
 engine.scoreBall({ runsScored: 0, isWide: true });

 const inn = engine.currentInnings;
 expect(inn.totalRuns).toBe(1);
 expect(inn.wideRuns).toBe(1);
 expect(inn.totalBalls).toBe(0); // Legal balls not incremented due to reball
 expect(inn.players[0].balls).toBe(0); // Wide is not ball faced
 expect(inn.bowlers[0].runs).toBe(1);
 });

 it('handles No Ball and triggers Free Hit on next delivery', () => {
 engine.scoreBall({ runsScored: 2, isNoBall: true });

 const inn = engine.currentInnings;
 expect(inn.totalRuns).toBe(3); // 2 runs + 1 penalty
 expect(inn.nbRuns).toBe(1);
 expect(inn.players[0].runs).toBe(2);
 expect(inn.players[0].balls).toBe(1); // No ball counts as ball faced
 expect(inn.isFreeHit).toBe(true);

 // On Free Hit, dismissal like Bowled is NOT allowed
 engine.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled' });
 expect(inn.totalWickets).toBe(0); // Wicket ignored!
 expect(inn.isFreeHit).toBe(false); // Free hit consumed by legal ball
 });

 it('allows Run Out on a Free Hit', () => {
 engine.scoreBall({ runsScored: 0, isNoBall: true });
 expect(engine.currentInnings.isFreeHit).toBe(true);

 engine.scoreBall({
 runsScored: 1,
 isWicket: true,
 dismissalType: 'Run Out',
 isStrikerOut: true,
 newBatsmanName: 'Mushfiqur Rahim',
 });

 const inn = engine.currentInnings;
 expect(inn.totalWickets).toBe(1);
 expect(inn.isFreeHit).toBe(false);
 });

 it('does not charge bowler for byes or leg byes', () => {
 engine.scoreBall({ runsScored: 2, isByes: true });

 const inn = engine.currentInnings;
 expect(inn.totalRuns).toBe(2);
 expect(inn.byeRuns).toBe(2);
 expect(inn.players[0].runs).toBe(0); // Not batter's runs
 expect(inn.bowlers[0].runs).toBe(0); // Not bowler's runs
 expect(inn.bowlers[0].ballsBowled).toBe(1);
 });

 it('credits wickets to bowler ONLY for appropriate dismissal types', () => {
 // Bowled: bowler gets wicket
 engine.scoreBall({
 runsScored: 0,
 isWicket: true,
 dismissalType: 'Bowled',
 newBatsmanName: 'Mushfiqur Rahim',
 });
 expect(engine.currentInnings.bowlers[0].wickets).toBe(1);

 // Run Out: bowler does NOT get wicket
 engine.scoreBall({
 runsScored: 0,
 isWicket: true,
 dismissalType: 'Run Out',
 newBatsmanName: 'Mahmudullah',
 });
 expect(engine.currentInnings.bowlers[0].wickets).toBe(1); // Still 1
 });

 it('enforces MCC Law 18.11: on Caught, incoming batter is always striker', () => {
 engine.scoreBall({
 runsScored: 1,
 isWicket: true,
 dismissalType: 'Caught',
 fielderName: 'Litton Das',
 newBatsmanName: 'Mushfiqur Rahim',
 });

 const inn = engine.currentInnings;
 // New batsman Mushfiqur Rahim took out batter's spot and remains striker
 expect(inn.players[inn.strikerIdx].name).toBe('Mushfiqur Rahim');
 });

 it('completes over on 6 legal balls, credits maiden if 0 runs, and rotates strike', () => {
 for (let i = 0; i < 6; i++) {
 engine.scoreBall({ runsScored: 0 });
 }

 const inn = engine.currentInnings;
 expect(inn.totalBalls).toBe(6);
 expect(inn.oversString).toBe('1.0');
 expect(inn.bowlers[0].maidens).toBe(1);
 expect(inn.isOverComplete).toBe(true);

 // Strike rotated at end of over
 expect(inn.strikerIdx).toBe(1);

 // Bowler cannot bowl next over immediately
 expect(engine.canBowlerBowl('Mustafizur Rahman')).toBe(false);
 expect(engine.canBowlerBowl('Taskin Ahmed')).toBe(true);

 // Change bowler
 engine.changeBowler('Taskin Ahmed');
 expect(inn.bowlers.length).toBe(2);
 expect(inn.isOverComplete).toBe(false);
 });

 it('undo restores previous state cleanly', () => {
 engine.scoreBall({ runsScored: 4 });
 expect(engine.currentInnings.totalRuns).toBe(4);

 const undone = engine.undo();
 expect(undone).toBe(true);
 expect(engine.currentInnings.totalRuns).toBe(0);
 expect(engine.currentInnings.totalBalls).toBe(0);
 expect(engine.currentInnings.players[0].runs).toBe(0);
 });

 it('calculates Man of the Match impact score accurately', () => {
 // 50 runs off 25 balls (2 4s, 4 6s)
 const mockBatter = {
 id: 'p1',
 name: 'Shakib Al Hasan',
 battingHand: 'Left-hand Batsman' as const,
 battingPosition: 'No. 3',
 runs: 50,
 balls: 25,
 fours: 2,
 sixes: 4,
 dotBalls: 5,
 ballLog: [],
 bowlersFaced: {},
 runsVsBowler: {},
 isDismissed: false,
 };

 // Expected batting points:
 // runs (50) + 4s*1 (2) + 6s*2 (8) = 60
 // runs >= 30 and sr >= 150 (200 sr) => +10
 // runs >= 50 => +20
 // Total = 90
 const batPts = ManOfTheMatchEngine.calculateBattingPoints(mockBatter);
 expect(batPts).toBe(90);

 // 3 wickets, 1 maiden, 15 runs in 18 balls
 const mockBowler = {
 id: 'b1',
 name: 'Shakib Al Hasan',
 ballsBowled: 18,
 maidens: 1,
 runs: 15,
 wickets: 3,
 overHistory: [],
 };

 // Expected bowling points:
 // 3*25 (75) + 1*15 (15) = 90
 // wickets >= 3 => +20
 // balls >= 12 & er <= 6 (er = 5.0) => +15
 // Total = 125
 const bowlPts = ManOfTheMatchEngine.calculateBowlingPoints(mockBowler);
 expect(bowlPts).toBe(125);
 });

 it('correctly classifies batting intent', () => {
 // Finisher: balls >= 12, sr >= 150, boundaryRunsPct >= 55
 const finisher = DotBallAnalytics.classifyBattingIntent(60, 80, 180, 15);
 expect(finisher).toBe('Finisher');

 // Anchor: balls >= 10, sr <= 85, shotControl >= 55
 const anchor = DotBallAnalytics.classifyBattingIntent(20, 70, 75, 20);
 expect(anchor).toBe('Anchor');
 });
});
