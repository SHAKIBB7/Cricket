import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { db } from '../infrastructure/database/dexie-db';
import { FeatureHubRepository } from '../infrastructure/storage/FeatureHubRepository';
import { MatchRepository } from '../infrastructure/storage/MatchRepository';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { ActiveBatsmenTable } from '../components/scoring/ActiveBatsmenTable';
import { ActiveBowlerTable } from '../components/scoring/ActiveBowlerTable';
import { PlayerSelectionModal } from '../components/modals/PlayerSelectionModal';
import { OutModal } from '../components/modals/OutModal';
import { cleanPlayerName } from '../domain/cricket/formatters';

describe('Squad Player Selection Workflow — Acceptance Criteria Test Suite', () => {
  beforeEach(async () => {
    await db.matches.clear();
    await db.match_events.clear();
    await db.teams.clear();
  });

  describe('1. ActiveBatsmenTable & ActiveBowlerTable Clean Player Name Rendering (No Dropdown Chevrons)', () => {
    const mockStriker = {
      id: 'p1',
      name: 'Tamim Iqbal',
      runs: 14,
      balls: 8,
      fours: 2,
      sixes: 0,
      dotBalls: 2,
      isDismissed: false,
      battingHand: 'Left-hand Batsman',
      ballLog: [],
      bowlersFaced: {},
      runsVsBowler: {},
    } as any;

    const mockNonStriker = {
      id: 'p2',
      name: 'Litton Das',
      runs: 6,
      balls: 4,
      fours: 1,
      sixes: 0,
      dotBalls: 1,
      isDismissed: false,
      battingHand: 'Right-hand Batsman',
      ballLog: [],
      bowlersFaced: {},
      runsVsBowler: {},
    } as any;

    const mockBowler = {
      id: 'b1',
      name: 'Shaheen Afridi',
      ballsBowled: 6,
      maidens: 0,
      runs: 8,
      wickets: 0,
      overHistory: [],
    } as any;

    it('renders clean player names without dropdown chevron selector buttons in ActiveBatsmenTable', () => {
      const html = renderToStaticMarkup(
        React.createElement(ActiveBatsmenTable, {
          striker: mockStriker,
          nonStriker: mockNonStriker,
          strikerIdx: 0,
          nonStrikerIdx: 1,
          onSelectBatsman: () => {},
        })
      );

      // Verify clean player names are rendered
      expect(html).toContain('Tamim Iqbal');
      expect(html).toContain('Litton Das');

      // Verify dropdown chevron buttons are removed
      expect(html).not.toContain('data-testid="striker-squad-selector-btn"');
      expect(html).not.toContain('data-testid="non-striker-squad-selector-btn"');
      expect(html).not.toContain('lucide-chevron-down');
    });

    it('renders clean bowler name without dropdown chevron selector button in ActiveBowlerTable', () => {
      const html = renderToStaticMarkup(
        React.createElement(ActiveBowlerTable, {
          bowler: mockBowler,
          onSelectBowler: () => {},
        })
      );

      // Verify clean bowler name is rendered
      expect(html).toContain('Shaheen Afridi');

      // Verify dropdown chevron button is removed
      expect(html).not.toContain('data-testid="bowler-squad-selector-btn"');
      expect(html).not.toContain('lucide-chevron-down');
    });
  });

  describe('2. PlayerSelectionModal Component Verification', () => {
    const mockSquad = ['Tamim Iqbal', 'Litton Das', 'Shakib Al Hasan', 'Mushfiqur Rahim', 'Mahmudullah'];

    it('renders squad players and disables ineligible players with clear badges', () => {
      const html = renderToStaticMarkup(
        React.createElement(PlayerSelectionModal, {
          isOpen: true,
          onClose: () => {},
          type: 'batter',
          title: 'Select Next Batter',
          teamName: 'Bangladesh Tigers',
          squadMembers: mockSquad,
          currentSelectedName: 'Tamim Iqbal',
          ineligiblePlayers: [
            { name: 'Litton Das', reason: 'At Crease' },
            { name: 'Tamim Iqbal', reason: 'Dismissed' },
          ],
          onSelectPlayer: () => {},
        })
      );

      expect(html).toContain('Select Next Batter');
      expect(html).toContain('Bangladesh Tigers Squad');
      // Available eligible players
      expect(html).toContain('Shakib Al Hasan');
      expect(html).toContain('Mushfiqur Rahim');
      expect(html).toContain('Mahmudullah');
      // Ineligible status badges
      expect(html).toContain('At Crease');
      expect(html).toContain('Dismissed');
      // Manual entry option available
      expect(html).toContain('Enter Player Name Manually');
    });

    it('displays bowler spell figures and restricts bowler on max overs limit', () => {
      const html = renderToStaticMarkup(
        React.createElement(PlayerSelectionModal, {
          isOpen: true,
          onClose: () => {},
          type: 'bowler',
          title: 'Select Bowler',
          teamName: 'Pakistan XI',
          squadMembers: ['Shaheen Afridi', 'Haris Rauf', 'Naseem Shah', 'Shadab Khan'],
          currentSelectedName: 'Shaheen Afridi',
          ineligiblePlayers: [
            { name: 'Shaheen Afridi', reason: 'Prev Over' },
            { name: 'Haris Rauf', reason: 'Max Limit (4/4 ov)' },
          ],
          bowlerFiguresMap: {
            'shaheen afridi': { overs: '3.0', maidens: 1, runs: 18, wickets: 2 },
            'haris rauf': { overs: '4.0', maidens: 0, runs: 32, wickets: 1 },
          },
          maxOversLimit: 4,
          onSelectPlayer: () => {},
        })
      );

      expect(html).toContain('Select Bowler');
      expect(html).toContain('Limit: Max 4 overs per bowler');
      expect(html).toContain('Prev Over');
      expect(html).toContain('Max Limit (4/4 ov)');
      expect(html).toContain('3.0 ov (2-18)');
      expect(html).toContain('4.0 ov (1-32)');
    });

    it('renders graceful manual entry fallback when a team has no saved squad', () => {
      const html = renderToStaticMarkup(
        React.createElement(PlayerSelectionModal, {
          isOpen: true,
          onClose: () => {},
          type: 'batter',
          title: 'Select Next Batter',
          teamName: 'Custom Village Club',
          squadMembers: [],
          onSelectPlayer: () => {},
        })
      );

      expect(html).toContain('No Saved Squad for Custom Village Club');
      expect(html).toContain('Enter Player Name Manually');
      expect(html).toContain('Assign');
    });
  });

  describe('3. Complete End-to-End Workflow: Saved Squad Match, Dismissal, Batter Selection & Bowler Change', () => {
    it('executes full workflow: squad setup -> start match -> Bowled dismissal -> select next batter from squad -> change bowler from squad -> verify persistence & full scoreboard', async () => {
      // Step 1: Create and save teams with squads
      const teamA = {
        id: 'team_tigers_1',
        name: 'Tigers XI',
        captain: 'Tamim Iqbal',
        manager: 'Hathurusingha',
        players: [
          'Tamim Iqbal',
          'Litton Das',
          'Shakib Al Hasan',
          'Mushfiqur Rahim',
          'Mahmudullah Riyad',
          'Towhid Hridoy',
          'Mehidy Hasan Miraz',
          'Taskin Ahmed',
          'Shoriful Islam',
          'Mustafizur Rahman',
          'Hasan Mahmud',
        ],
        createdAt: new Date().toISOString(),
      };

      const teamB = {
        id: 'team_lions_2',
        name: 'Lions XI',
        captain: 'Babar Azam',
        manager: 'Gary Kirsten',
        players: [
          'Babar Azam',
          'Mohammad Rizwan',
          'Fakhar Zaman',
          'Saim Ayub',
          'Iftikhar Ahmed',
          'Shadab Khan',
          'Imad Wasim',
          'Shaheen Afridi',
          'Naseem Shah',
          'Haris Rauf',
          'Mohammad Amir',
        ],
        createdAt: new Date().toISOString(),
      };

      await FeatureHubRepository.saveTeam(teamA);
      await FeatureHubRepository.saveTeam(teamB);

      const savedTeams = await FeatureHubRepository.loadTeams();
      expect(savedTeams.length).toBe(2);

      // Step 2: Start a match using Tigers XI (batting) vs Lions XI (bowling)
      const engine = new EventSourcedMatchEngine({
        teamA: 'Tigers XI',
        teamB: 'Lions XI',
        tossWinner: 'Tigers XI',
        tossDecision: 'Batting',
        totalOvers: 5,
        strikerName: 'Tamim Iqbal',
        nonStrikerName: 'Litton Das',
        bowlerName: 'Shaheen Afridi',
        advancedSettings: {
          teamASquad: teamA.players,
          teamBSquad: teamB.players,
          players: 11,
          maxOversPerBowler: 2,
        },
      });

      expect(engine.currentInnings.team).toBe('Tigers XI');
      expect(engine.currentInnings.bowlingTeam).toBe('Lions XI');
      expect(engine.currentInnings.players[0].name).toBe('Tamim Iqbal');
      expect(engine.currentInnings.players[1].name).toBe('Litton Das');
      expect(engine.currentInnings.bowlers[0].name).toBe('Shaheen Afridi');

      // Score 1 boundary off first ball
      engine.scoreBall({ runsScored: 4 });
      expect(engine.currentInnings.players[0].runs).toBe(4);
      expect(engine.currentInnings.players[0].balls).toBe(1);

      // Step 3: Opening batter Tamim Iqbal dismissed by Bowled on 2nd delivery
      // Ball 2: Bowled
      // Simulate OutModal with available squad members
      const innBeforeWkt = engine.currentInnings;
      const unavailableBeforeWkt = new Set([
        cleanPlayerName(innBeforeWkt.players[0].name).toLowerCase(),
        cleanPlayerName(innBeforeWkt.players[1].name).toLowerCase(),
      ]);
      const eligibleForIncoming = teamA.players.filter(
        (name) => !unavailableBeforeWkt.has(cleanPlayerName(name).toLowerCase())
      );

      // Eligible squad members should be Shakib, Mushfiqur, Mahmudullah, etc.
      expect(eligibleForIncoming).toContain('Shakib Al Hasan');
      expect(eligibleForIncoming).toContain('Mushfiqur Rahim');
      expect(eligibleForIncoming).not.toContain('Tamim Iqbal');
      expect(eligibleForIncoming).not.toContain('Litton Das');

      // OutModal confirm: wicket without pre-selecting newBatsmanName (or selecting Shakib Al Hasan)
      engine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Bowled',
        isStrikerOut: true,
      });

      expect(engine.currentInnings.totalWickets).toBe(1);
      // Outgoing batter's dismissal and stats remain intact
      const dismissedTamim = engine.currentInnings.players[0];
      expect(dismissedTamim.isDismissed).toBe(true);
      expect(dismissedTamim.runs).toBe(4);
      expect(dismissedTamim.balls).toBe(2);
      expect(dismissedTamim.dismissalType).toBe('Bowled');
      expect(dismissedTamim.name).toContain('Tamim Iqbal');
      expect(dismissedTamim.name).toContain('Bowled');
      expect(engine.currentInnings.fallOfWickets[0].bowler).toBe('Shaheen Afridi');

      // Step 4: Open player selector and choose the next eligible batter: 'Shakib Al Hasan'
      const newStrikerSlot = engine.currentInnings.players[engine.currentInnings.strikerIdx];
      expect(newStrikerSlot).toBeDefined();

      const renameRes = engine.renamePlayer(newStrikerSlot.id, 'Shakib Al Hasan');
      expect(renameRes.success).toBe(true);

      // Step 5: Verify that the new batter immediately appears on the Live Scoreboard
      expect(cleanPlayerName(engine.currentInnings.players[engine.currentInnings.strikerIdx].name)).toBe(
        'Shakib Al Hasan'
      );
      expect(cleanPlayerName(engine.currentInnings.players[engine.currentInnings.nonStrikerIdx].name)).toBe(
        'Litton Das'
      );

      // Step 6: Verify outgoing batter Tamim's figures remain intact
      expect(engine.currentInnings.players[0].runs).toBe(4);
      expect(engine.currentInnings.players[0].balls).toBe(2);
      expect(engine.currentInnings.players[0].isDismissed).toBe(true);

      // Shakib scores 2 runs on his first ball (ball 3 of over)
      engine.scoreBall({ runsScored: 2 });
      expect(engine.currentInnings.players[engine.currentInnings.strikerIdx].runs).toBe(2);
      expect(engine.currentInnings.players[engine.currentInnings.strikerIdx].balls).toBe(1);

      // Complete the over (balls 4, 5, 6)
      engine.scoreBall({ runsScored: 0 });
      engine.scoreBall({ runsScored: 1 });
      engine.scoreBall({ runsScored: 0 });

      expect(engine.currentInnings.totalBalls).toBe(6);
      expect(engine.currentInnings.isOverComplete).toBe(true);

      // Step 7: Complete over and select an eligible bowler from the opposing squad (Lions XI)
      // Shaheen bowled the previous over -> cannot bowl back-to-back overs
      const shaheenVal = engine.validateBowlerSelection('Shaheen Afridi');
      expect(shaheenVal.allowed).toBe(false);
      expect(shaheenVal.reason).toContain('consecutive');

      // Haris Rauf is an eligible bowler from Lions XI squad
      const harisVal = engine.validateBowlerSelection('Haris Rauf');
      expect(harisVal.allowed).toBe(true);

      const changeRes = engine.changeBowler('Haris Rauf');
      expect(changeRes.success).toBe(true);
      expect(cleanPlayerName(engine.currentInnings.bowlers[engine.currentInnings.currentBowlerIdx].name)).toBe(
        'Haris Rauf'
      );
      expect(engine.currentInnings.bowlers[engine.currentInnings.currentBowlerIdx].ballsBowled).toBe(0);

      // Step 8: Persist match state to Dexie and verify after simulated page refresh
      const scorecard = engine.toScorecard();
      await MatchRepository.saveMatchWithEvents(scorecard, engine.events, 0);

      // Reconstruct match engine from stored Dexie scorecard (simulating page reload)
      const restoredScorecard = await MatchRepository.getMatch(engine.id);
      expect(restoredScorecard).toBeDefined();

      const restoredEngine = new EventSourcedMatchEngine({
        id: restoredScorecard!.id,
        teamA: restoredScorecard!.teamA,
        teamB: restoredScorecard!.teamB,
        tossWinner: restoredScorecard!.tossWinner,
        tossDecision: restoredScorecard!.tossDecision,
        totalOvers: restoredScorecard!.totalOvers,
        advancedSettings: restoredScorecard!.advancedSettings,
      });
      if (restoredScorecard!.firstInnings) restoredEngine.firstInnings = restoredScorecard!.firstInnings;
      if (restoredScorecard!.secondInnings) restoredEngine.secondInnings = restoredScorecard!.secondInnings;
      restoredEngine.currentInningsNumber = restoredScorecard!.currentInnings;

      const restoredInn = restoredEngine.currentInnings;
      expect(cleanPlayerName(restoredInn.players[0].name)).toBe('Tamim Iqbal');
      expect(restoredInn.players[0].isDismissed).toBe(true);
      expect(restoredInn.players[0].runs).toBe(4);
      expect(cleanPlayerName(restoredInn.players[restoredInn.strikerIdx].name)).toBe('Shakib Al Hasan'); // strike rotates at over end
      expect(cleanPlayerName(restoredInn.players[restoredInn.nonStrikerIdx].name)).toBe('Litton Das');
      expect(cleanPlayerName(restoredInn.bowlers[restoredInn.currentBowlerIdx].name)).toBe('Haris Rauf');

      // Step 9: Test with teams that have no saved squad and confirm that manual entry still works
      const customTeamEngine = new EventSourcedMatchEngine({
        teamA: 'Ad-hoc XI',
        teamB: 'Street Cricketers',
        tossWinner: 'Ad-hoc XI',
        tossDecision: 'Batting',
        totalOvers: 2,
        strikerName: 'Local Player 1',
        nonStrikerName: 'Local Player 2',
        bowlerName: 'Local Bowler 1',
      });

      // Local Player 1 gets out
      customTeamEngine.scoreBall({
        runsScored: 0,
        isWicket: true,
        dismissalType: 'Bowled',
      });

      // Manually enter player name for incoming batter
      const newSlot = customTeamEngine.currentInnings.players[customTeamEngine.currentInnings.strikerIdx];
      const manualRes = customTeamEngine.renamePlayer(newSlot.id, 'Unregistered Talent');
      expect(manualRes.success).toBe(true);
      expect(cleanPlayerName(customTeamEngine.currentInnings.players[customTeamEngine.currentInnings.strikerIdx].name)).toBe(
        'Unregistered Talent'
      );
    });
  });
});
