import { describe, it, expect, beforeEach } from 'vitest';
import {
  DISMISSAL_RULES,
  PRIMARY_DISMISSAL_TYPES,
  getDismissalRule,
  getEligibleBatters,
  isSingleBatterEligible,
  getDefaultEligibleBatter,
  isBowlerCredited,
  requiresFielder,
  isAllowedOnFreeHit,
} from '../domain/cricket/dismissals';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';

describe('Centralized Cricket Dismissal Rules (MCC Laws)', () => {
  describe('Rule Configuration Verification', () => {
    it('defines accurate eligible batters for single-batter dismissals', () => {
      // Bowled -> Striker
      expect(getEligibleBatters('Bowled')).toEqual(['striker']);
      expect(isSingleBatterEligible('Bowled')).toBe(true);
      expect(getDefaultEligibleBatter('Bowled')).toBe('striker');

      // Caught -> Striker
      expect(getEligibleBatters('Caught')).toEqual(['striker']);
      expect(isSingleBatterEligible('Caught')).toBe(true);

      // LBW -> Striker
      expect(getEligibleBatters('LBW')).toEqual(['striker']);
      expect(isSingleBatterEligible('LBW')).toBe(true);

      // Stumped -> Striker
      expect(getEligibleBatters('Stumped')).toEqual(['striker']);
      expect(isSingleBatterEligible('Stumped')).toBe(true);

      // Hit Wicket -> Striker
      expect(getEligibleBatters('Hit Wicket')).toEqual(['striker']);
      expect(isSingleBatterEligible('Hit Wicket')).toBe(true);

      // Hit the Ball Twice -> Striker
      expect(getEligibleBatters('Hit the Ball Twice')).toEqual(['striker']);
      expect(isSingleBatterEligible('Hit the Ball Twice')).toBe(true);
    });

    it('defines accurate eligible batters for multi-batter dismissals', () => {
      // Run Out -> Striker or Non-Striker
      expect(getEligibleBatters('Run Out')).toEqual(['striker', 'non_striker']);
      expect(isSingleBatterEligible('Run Out')).toBe(false);

      // Obstructing the Field -> Striker or Non-Striker
      expect(getEligibleBatters('Obstructing the Field')).toEqual(['striker', 'non_striker']);
      expect(isSingleBatterEligible('Obstructing the Field')).toBe(false);

      // Retired Out -> Striker or Non-Striker
      expect(getEligibleBatters('Retired Out')).toEqual(['striker', 'non_striker']);
      expect(isSingleBatterEligible('Retired Out')).toBe(false);

      // Timed Out -> Striker or Non-Striker
      expect(getEligibleBatters('Timed Out')).toEqual(['striker', 'non_striker']);
      expect(isSingleBatterEligible('Timed Out')).toBe(false);
    });

    it('accurately specifies bowler credit for wickets', () => {
      // Credited to bowler: Bowled, Caught, LBW, Stumped, Hit Wicket
      expect(isBowlerCredited('Bowled')).toBe(true);
      expect(isBowlerCredited('Caught')).toBe(true);
      expect(isBowlerCredited('LBW')).toBe(true);
      expect(isBowlerCredited('Stumped')).toBe(true);
      expect(isBowlerCredited('Hit Wicket')).toBe(true);

      // NOT credited to bowler: Run Out, Obstructing, Hit Ball Twice, Retired Out, Timed Out
      expect(isBowlerCredited('Run Out')).toBe(false);
      expect(isBowlerCredited('Obstructing the Field')).toBe(false);
      expect(isBowlerCredited('Hit the Ball Twice')).toBe(false);
      expect(isBowlerCredited('Retired Out')).toBe(false);
      expect(isBowlerCredited('Timed Out')).toBe(false);
    });

    it('accurately flags whether a fielder is required', () => {
      expect(requiresFielder('Caught')).toBe(true);
      expect(requiresFielder('Stumped')).toBe(true);
      expect(requiresFielder('Run Out')).toBe(true);

      expect(requiresFielder('Bowled')).toBe(false);
      expect(requiresFielder('LBW')).toBe(false);
      expect(requiresFielder('Hit Wicket')).toBe(false);
      expect(requiresFielder('Hit the Ball Twice')).toBe(false);
      expect(requiresFielder('Obstructing the Field')).toBe(false);
      expect(requiresFielder('Retired Out')).toBe(false);
    });

    it('accurately flags Free Hit permitted dismissals', () => {
      // Under MCC Law 21 / ICC rules, on Free Hit: Run Out, Obstructing, Hit Ball Twice are permitted
      expect(isAllowedOnFreeHit('Run Out')).toBe(true);
      expect(isAllowedOnFreeHit('Obstructing the Field')).toBe(true);
      expect(isAllowedOnFreeHit('Hit the Ball Twice')).toBe(true);

      expect(isAllowedOnFreeHit('Bowled')).toBe(false);
      expect(isAllowedOnFreeHit('Caught')).toBe(false);
      expect(isAllowedOnFreeHit('LBW')).toBe(false);
      expect(isAllowedOnFreeHit('Stumped')).toBe(false);
      expect(isAllowedOnFreeHit('Hit Wicket')).toBe(false);
    });

    it('gracefully handles unknown dismissal types', () => {
      const fallbackRule = getDismissalRule('NonExistentType');
      expect(fallbackRule).toBeDefined();
      expect(fallbackRule.id).toBe('Bowled');
    });

    it('lists primary dismissals in expected order', () => {
      expect(PRIMARY_DISMISSAL_TYPES).toContain('Bowled');
      expect(PRIMARY_DISMISSAL_TYPES).toContain('Caught');
      expect(PRIMARY_DISMISSAL_TYPES).toContain('LBW');
      expect(PRIMARY_DISMISSAL_TYPES).toContain('Run Out');
      expect(PRIMARY_DISMISSAL_TYPES).toContain('Stumped');
      expect(PRIMARY_DISMISSAL_TYPES).toContain('Hit Wicket');
      expect(PRIMARY_DISMISSAL_TYPES).toContain('Hit the Ball Twice');
      expect(PRIMARY_DISMISSAL_TYPES).toContain('Obstructing the Field');
      expect(PRIMARY_DISMISSAL_TYPES).toContain('Retired Out');
      expect(PRIMARY_DISMISSAL_TYPES).toContain('Timed Out');
    });
  });

  describe('Match Engine Scoring Integration', () => {
    let engine: EventSourcedMatchEngine;

    beforeEach(() => {
      engine = new EventSourcedMatchEngine({
        id: 'test-match-1',
        teamA: 'Bangladesh',
        teamB: 'India',
        tossWinner: 'Bangladesh',
        tossDecision: 'Batting',
        totalOvers: 20,
        strikerName: 'Tamim Iqbal',
        nonStrikerName: 'Litton Das',
        bowlerName: 'Jasprit Bumrah',
      });
    });

    it('scores Bowled: dismisses striker, credits bowler, brings new batter', () => {
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Bowled',
        isStrikerOut: true,
        newBatsmanName: 'Shakib Al Hasan',
      });

      const inn = engine.currentInnings;
      expect(inn.totalWickets).toBe(1);
      expect(inn.bowlers[0].wickets).toBe(1); // Bumrah credited
      expect(inn.players[0].isDismissed).toBe(true); // Tamim dismissed
      expect(inn.players[0].name).toContain('Bowled');
      expect(inn.players[inn.strikerIdx].name).toBe('Shakib Al Hasan'); // Shakib is new striker
    });

    it('scores Caught with fielder: dismisses striker, credits bowler and stores fielder', () => {
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Caught',
        fielderName: 'Virat Kohli',
        isStrikerOut: true,
        newBatsmanName: 'Mushfiqur Rahim',
      });

      const inn = engine.currentInnings;
      expect(inn.totalWickets).toBe(1);
      expect(inn.bowlers[0].wickets).toBe(1); // Bumrah credited
      expect(inn.fallOfWickets[0].fielder).toBe('Virat Kohli');
      expect(inn.fallOfWickets[0].dismissal).toBe('Caught by Virat Kohli');
    });

    it('scores Run Out of Striker: dismisses striker without bowler credit', () => {
      engine.scoreBall({
        runsScored: 1,
        isWicket: true,
        dismissalType: 'Run Out',
        isStrikerOut: true,
        fielderName: 'Ravindra Jadeja',
        newBatsmanName: 'Mahmudullah',
      });

      const inn = engine.currentInnings;
      expect(inn.totalWickets).toBe(1);
      expect(inn.bowlers[0].wickets).toBe(0); // Bowler NOT credited for Run Out
      expect(inn.players[0].isDismissed).toBe(true); // Tamim (striker) is dismissed
      expect(inn.fallOfWickets[0].dismissal).toBe('Run Out by Ravindra Jadeja');
    });

    it('scores Run Out of Non-Striker (Mankad / Non-Striker end): dismisses non-striker without bowler credit, striker remains', () => {
      // Non-Striker is Litton Das (players[1])
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Run Out',
        isStrikerOut: false, // Non-Striker Out!
        fielderName: 'Jasprit Bumrah',
        newBatsmanName: 'Shakib Al Hasan',
      });

      const inn = engine.currentInnings;
      expect(inn.totalWickets).toBe(1);
      expect(inn.bowlers[0].wickets).toBe(0); // Bowler NOT credited
      expect(inn.players[0].isDismissed).toBe(false); // Tamim (striker) remains NOT out!
      expect(inn.players[1].isDismissed).toBe(true); // Litton (non-striker) is dismissed!
      expect(inn.players[inn.nonStrikerIdx].name).toBe('Shakib Al Hasan'); // Shakib replaces non-striker
      expect(inn.players[inn.strikerIdx].name).toContain('Tamim Iqbal'); // Tamim remains striker
    });

    it('scores Hit the Ball Twice: dismisses striker without bowler credit', () => {
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Hit the Ball Twice',
        isStrikerOut: true,
        newBatsmanName: 'Afif Hossain',
      });

      const inn = engine.currentInnings;
      expect(inn.totalWickets).toBe(1);
      expect(inn.bowlers[0].wickets).toBe(0); // Bowler NOT credited
      expect(inn.players[0].isDismissed).toBe(true);
    });

    it('scores Obstructing the Field for Non-Striker: dismisses non-striker', () => {
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Obstructing the Field',
        isStrikerOut: false,
        newBatsmanName: 'Towhid Hridoy',
      });

      const inn = engine.currentInnings;
      expect(inn.totalWickets).toBe(1);
      expect(inn.bowlers[0].wickets).toBe(0);
      expect(inn.players[1].isDismissed).toBe(true); // Non-striker is dismissed
      expect(inn.players[0].isDismissed).toBe(false); // Striker still at crease
    });

    it('enforces Free Hit restrictions properly via centralized rules', () => {
      // Trigger No Ball -> Next delivery is Free Hit
      engine.scoreBall({ runsScored: 0, isNoBall: true });
      expect(engine.currentInnings.isFreeHit).toBe(true);

      // Bowled on Free Hit must be ignored
      engine.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Bowled' });
      expect(engine.currentInnings.totalWickets).toBe(0);

      // Trigger another No Ball to get Free Hit again
      engine.scoreBall({ runsScored: 0, isNoBall: true });
      expect(engine.currentInnings.isFreeHit).toBe(true);

      // Caught on Free Hit must be ignored
      engine.scoreBall({ runsScored: 0, isWicket: true, dismissalType: 'Caught' });
      expect(engine.currentInnings.totalWickets).toBe(0);

      // Trigger another No Ball to get Free Hit again
      engine.scoreBall({ runsScored: 0, isNoBall: true });
      expect(engine.currentInnings.isFreeHit).toBe(true);

      // Run Out on Free Hit is allowed by rules
      engine.scoreBall({ runsScored: 1, isWicket: true, dismissalType: 'Run Out', isStrikerOut: true });
      expect(engine.currentInnings.totalWickets).toBe(1);
    });
  });
});
