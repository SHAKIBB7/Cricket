import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { BatsmanProfileModal } from '../components/modals/BatsmanProfileModal';
import { BowlerProfileModal } from '../components/modals/BowlerProfileModal';
import { Player, Bowler, FallOfWicket, Partnership } from '../domain/cricket/types';
import { cleanPlayerName } from '../domain/cricket/formatters';

describe('Player Name Editing Suite', () => {
  const createTestEngine = () => {
    const engine = new EventSourcedMatchEngine({
      teamA: 'Dhaka Gladiators',
      teamB: 'Chittagong Kings',
      tossWinner: 'Dhaka Gladiators',
      tossDecision: 'Batting',
      totalOvers: 5,
      strikerName: 'Tamim Iqbal',
      nonStrikerName: 'Anamul Haque',
      bowlerName: 'Mustafizur Rahman',
    });

    // Score 3 balls to accumulate stats
    // Ball 1: 4 runs by Tamim off Mustafizur
    engine.scoreBall({ runsScored: 4 });
    // Ball 2: 1 run by Tamim off Mustafizur (Tamim: 5 off 2, strike rotates to Anamul)
    engine.scoreBall({ runsScored: 1 });
    // Ball 3: 0 runs by Anamul off Mustafizur
    engine.scoreBall({ runsScored: 0 });

    return engine;
  };

  describe('1. Engine Domain Logic: Batter Renaming', () => {
    it('renames a striker by ID while preserving Player ID, runs, balls, boundaries, and strike', () => {
      const engine = createTestEngine();
      const inn = engine.currentInnings;
      const striker = inn.players[inn.strikerIdx];
      const nonStriker = inn.players[inn.nonStrikerIdx];

      // Initial stats check: Tamim (non-striker now) has 5 runs off 2 balls (1 four)
      const tamim = inn.players.find((p) => p.name === 'Tamim Iqbal')!;
      expect(tamim.runs).toBe(5);
      expect(tamim.balls).toBe(2);
      expect(tamim.fours).toBe(1);
      const originalTamimId = tamim.id;

      // Rename Tamim to 'Tamim Khan'
      const result = engine.renamePlayer(tamim.id, 'Tamim Khan');
      expect(result.success).toBe(true);
      expect(result.oldName).toBe('Tamim Iqbal');
      expect(result.newName).toBe('Tamim Khan');

      // Check player stats are 100% intact
      expect(tamim.name).toBe('Tamim Khan');
      expect(tamim.id).toBe(originalTamimId);
      expect(tamim.runs).toBe(5);
      expect(tamim.balls).toBe(2);
      expect(tamim.fours).toBe(1);

      // Check current partnership was updated
      expect(inn.currentPartnership.batter1).toBe('Tamim Khan');

      // Check match state is unaffected
      expect(inn.totalRuns).toBe(5);
      expect(inn.totalBalls).toBe(3);
      expect(engine.currentInningsNumber).toBe(1);
    });

    it('renames non-striker and updates past partnerships and fall of wickets', () => {
      const engine = createTestEngine();
      const inn = engine.currentInnings;

      // Wicket for Anamul on ball 4
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Caught',
        fielderName: 'Shakib',
        newBatsmanName: 'Mushfiqur Rahim',
        isStrikerOut: true,
      });

      // Anamul is now out in fallOfWickets
      expect(inn.fallOfWickets.length).toBe(1);
      expect(inn.fallOfWickets[0].player).toBe('Anamul Haque');
      expect(inn.pastPartnerships.length).toBe(1);
      expect([inn.pastPartnerships[0].batter1, inn.pastPartnerships[0].batter2]).toContain('Anamul Haque');

      const anamul = inn.players.find((p) => cleanPlayerName(p.name) === 'Anamul Haque')!;
      const originalId = anamul.id;

      // Rename Anamul
      const result = engine.renamePlayer(anamul.id, 'Anamul Bijoy');
      expect(result.success).toBe(true);
      expect(cleanPlayerName(anamul.name)).toBe('Anamul Bijoy');
      expect(anamul.id).toBe(originalId);

      // Verify fallOfWickets updated with new name
      expect(inn.fallOfWickets[0].player).toBe('Anamul Bijoy');
      // Verify past partnerships updated with new name
      expect([inn.pastPartnerships[0].batter1, inn.pastPartnerships[0].batter2]).toContain('Anamul Bijoy');
    });

    it('rejects empty, whitespace-only, or overly long names with clear errors', () => {
      const engine = createTestEngine();
      const p1 = engine.currentInnings.players[0];

      const emptyRes = engine.renamePlayer(p1.id, '');
      expect(emptyRes.success).toBe(false);
      expect(emptyRes.error).toBe('Player name cannot be empty.');

      const whitespaceRes = engine.renamePlayer(p1.id, '    ');
      expect(whitespaceRes.success).toBe(false);
      expect(whitespaceRes.error).toBe('Player name cannot be empty.');

      const longName = 'A'.repeat(51);
      const longRes = engine.renamePlayer(p1.id, longName);
      expect(longRes.success).toBe(false);
      expect(longRes.error).toBe('Player name cannot exceed 50 characters.');

      const invalidCharsRes = engine.renamePlayer(p1.id, '!!!###$$$');
      expect(invalidCharsRes.success).toBe(false);
      expect(invalidCharsRes.error).toBe('Player name must contain valid letters or numbers.');
    });

    it('supports Bengali names and normalizes extraneous whitespaces', () => {
      const engine = createTestEngine();
      const p1 = engine.currentInnings.players[0];

      // Rename with extra internal/external whitespace and Bengali text
      const result = engine.renamePlayer(p1.id, '   সাকিব    আল    হাসান   ');
      expect(result.success).toBe(true);
      expect(result.newName).toBe('সাকিব আল হাসান');
      expect(p1.name).toBe('সাকিব আল হাসান');
    });
  });

  describe('2. Engine Domain Logic: Bowler Renaming', () => {
    it('renames bowler by ID while preserving bowling stats and head-to-head records', () => {
      const engine = createTestEngine();
      const inn = engine.currentInnings;
      const bowler = inn.bowlers[inn.currentBowlerIdx];
      const originalBowlerId = bowler.id;

      expect(bowler.name).toBe('Mustafizur Rahman');
      expect(bowler.ballsBowled).toBe(3);
      expect(bowler.runs).toBe(5);

      // Rename bowler
      const result = engine.renamePlayer(bowler.id, 'Mustafizur The Fizz');
      expect(result.success).toBe(true);
      expect(result.newName).toBe('Mustafizur The Fizz');

      // Check bowler figures intact
      expect(bowler.name).toBe('Mustafizur The Fizz');
      expect(bowler.id).toBe(originalBowlerId);
      expect(bowler.ballsBowled).toBe(3);
      expect(bowler.runs).toBe(5);

      // Check batter head-to-head records updated
      const tamim = inn.players.find((p) => p.name === 'Tamim Iqbal')!;
      expect(tamim.bowlersFaced['Mustafizur The Fizz']).toBe(2);
      expect(tamim.bowlersFaced['Mustafizur Rahman']).toBeUndefined();
      expect(tamim.runsVsBowler['Mustafizur The Fizz']).toBe(5);
      expect(tamim.runsVsBowler['Mustafizur Rahman']).toBeUndefined();
    });

    it('updates fallOfWickets dismissal credit when bowler is renamed', () => {
      const engine = createTestEngine();
      const inn = engine.currentInnings;

      // Mustafizur bowls a wicket
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Bowled',
        newBatsmanName: 'Mushfiqur',
        isStrikerOut: true,
      });

      expect(inn.fallOfWickets[0].bowler).toBe('Mustafizur Rahman');
      inn.fallOfWickets[0].dismissal = 'Bowled b Mustafizur Rahman';

      const bowler = inn.bowlers[0];
      const res = engine.renamePlayer(bowler.id, 'Fizz Rahman');
      expect(res.success).toBe(true);

      // Verify fallOfWickets bowler and dismissal text updated
      expect(inn.fallOfWickets[0].bowler).toBe('Fizz Rahman');
      expect(inn.fallOfWickets[0].dismissal).toContain('b Fizz Rahman');
    });
  });

  describe('3. Event Replay & PDF Scorecard Consistency', () => {
    it('emits PLAYER_RENAMED event and restores state deterministically from scorecard', () => {
      const engine = createTestEngine();
      const p1 = engine.currentInnings.players[0];

      engine.renamePlayer(p1.id, 'Mahmudullah Riyad');
      const events = engine.events;
      const renameEvent = events.find((e) => e.type === 'PLAYER_RENAMED');

      expect(renameEvent).toBeDefined();
      expect(renameEvent?.payload.newName).toBe('Mahmudullah Riyad');

      // Serialize and restore via fromScorecard
      const sc = engine.toScorecard();
      expect(sc.firstInnings?.players[0].name).toBe('Mahmudullah Riyad');

      const reconstructed = EventSourcedMatchEngine.fromScorecard(sc);
      expect(reconstructed.firstInnings?.players[0].name).toBe('Mahmudullah Riyad');
    });
  });

  describe('4. UI Profile Modal Integration', () => {
    it('renders BatsmanProfileModal with player name and Edit pencil button', () => {
      const mockPlayer: Player = {
        id: 'p_1_1',
        name: 'Litton Das',
        runs: 45,
        balls: 28,
        fours: 5,
        sixes: 2,
        dotBalls: 10,
        isDismissed: false,
        battingHand: 'Right-hand Batsman',
        battingPosition: '1',
        ballLog: ['4', '0', '6'],
        bowlersFaced: {},
        runsVsBowler: {},
      };

      const html = renderToStaticMarkup(
        React.createElement(BatsmanProfileModal, {
          player: mockPlayer,
          isOpen: true,
          onClose: () => {},
          isStriker: true,
          battingPosition: 1,
          onRenamePlayer: () => {},
        })
      );

      expect(html).toContain('Litton Das');
      expect(html).toContain('aria-label="Edit player name"');
      expect(html).toContain('title="Click to edit player name"');
      expect(html).toContain('45'); // runs
      expect(html).toContain('28'); // balls
    });

    it('renders BowlerProfileModal with bowler name and Edit pencil button', () => {
      const mockBowler: Bowler = {
        id: 'b_1_1',
        name: 'Taskin Ahmed',
        ballsBowled: 12,
        maidens: 1,
        runs: 10,
        wickets: 2,
        overHistory: [{ overNumber: 1, log: ['0', '0', '0', '0', '0', '0'] }],
      };

      const html = renderToStaticMarkup(
        React.createElement(BowlerProfileModal, {
          bowler: mockBowler,
          isOpen: true,
          onClose: () => {},
          isCurrentlyBowling: true,
          ongoingOverLog: ['0', '1'],
          ongoingMatchOver: 2,
          onRenamePlayer: () => {},
        })
      );

      expect(html).toContain('Taskin Ahmed');
      expect(html).toContain('aria-label="Edit bowler name"');
      expect(html).toContain('title="Click to edit bowler name"');
      expect(html).toContain('2.0'); // overs
      expect(html).toContain('10');  // runs
      expect(html).toContain('2');   // wickets
    });
  });
});
