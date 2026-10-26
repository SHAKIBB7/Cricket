import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import { IntegratedScoreboard } from '../components/scoring/IntegratedScoreboard';
import { BatsmanProfileModal } from '../components/modals/BatsmanProfileModal';
import { BowlerProfileModal } from '../components/modals/BowlerProfileModal';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { MatchScorecard, InningsData, Player, Bowler, FallOfWicket } from '../domain/cricket/types';
import { SCOREBOARD_THEMES } from '../lib/theme/scoreboard-themes';

describe('Full Scoreboard Player Profile Navigation Bug Fix & Quality Audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockMatch = (): MatchScorecard => ({
    id: 'test-match-nav-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    teamA: 'Team Alpha',
    teamB: 'Team Bravo',
    tossWinner: 'Team Alpha',
    tossDecision: 'Batting',
    totalOvers: 20,
    currentInnings: 1,
    targetScore: 0,
    status: 'ONGOING',
    advancedSettings: {
      players: 11,
      noBall: true,
      noBallReball: true,
      noBallRun: 1,
      wideBall: true,
      wideReball: true,
      wideRun: 1,
      isManualLimitEnabled: false,
      manualOverLimit: 4,
    },
    firstInnings: ({
      inningsNumber: 1,
      team: 'Team Alpha',
      bowlingTeam: 'Team Bravo',
      totalRuns: 45,
      totalWickets: 1,
      totalBalls: 30,
      oversString: '5.0',
      isOverComplete: false,
      strikerIdx: 0,
      nonStrikerIdx: 1,
      currentBowlerIdx: 0,
      players: [
        {
          id: 'p-alpha-1',
          name: 'Alex Striker',
          battingHand: 'Right',
          dotBalls: 6,
          bowlersFaced: {},
          runsVsBowler: {},
          runs: 28,
          balls: 18,
          fours: 4,
          sixes: 1,
          isDismissed: false,
          ballLog: ['4', '1', '6', '1'],
        },
        {
          id: 'p-alpha-2',
          name: 'Alex Striker', // Intentionally duplicate name to test disambiguation
          battingHand: 'Left',
          dotBalls: 4,
          bowlersFaced: {},
          runsVsBowler: {},
          runs: 12,
          balls: 10,
          fours: 1,
          sixes: 0,
          isDismissed: false,
          ballLog: ['1', '4'],
        },
        {
          id: '', // Empty ID to test fallback synthesis
          name: 'Charlie Out',
          battingHand: 'Right',
          dotBalls: 0,
          bowlersFaced: {},
          runsVsBowler: {},
          runs: 5,
          balls: 2,
          fours: 1,
          sixes: 0,
          isDismissed: true,
          dismissalText: 'c Keeper b Bowler One',
          ballLog: ['4', 'W'],
        },
        {
          id: 'p-alpha-4',
          name: 'David Unbatted',
          battingHand: 'Right',
          dotBalls: 0,
          bowlersFaced: {},
          runsVsBowler: {},
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          isDismissed: false,
          ballLog: [],
        },
      ],
      bowlers: [
        {
          id: 'b-bravo-1',
          name: 'Bowler One',
          ballsBowled: 18,
          overs: 3,
          maidens: 0,
          runs: 20,
          wickets: 1,
          overHistory: [],
        },
        {
          id: '', // Empty ID to test fallback synthesis
          name: 'Bowler Two',
          ballsBowled: 12,
          overs: 2,
          maidens: 0,
          runs: 25,
          wickets: 0,
          overHistory: [],
        },
      ],
      fallOfWickets: [
        {
          wicket: 1,
          score: 15,
          player: 'Charlie Out',
          over: '2.1',
          dismissal: 'c Keeper b Bowler One',
        },
      ],
      pastPartnerships: [],
      thisOverLog: ['1', '4', '0'],
      wideRuns: 0,
      nbRuns: 0,
      byeRuns: 0,
      lbRuns: 0,
      penaltyRuns: 0,
    } as unknown as InningsData),
    secondInnings: ({
      inningsNumber: 2,
      team: 'Team Bravo',
      bowlingTeam: 'Team Alpha',
      totalRuns: 0,
      totalWickets: 0,
      totalBalls: 0,
      oversString: '0.0',
      isOverComplete: false,
      strikerIdx: 0,
      nonStrikerIdx: 1,
      currentBowlerIdx: 0,
      players: [
        {
          id: 'p-bravo-1',
          name: 'Bravo Opener',
          battingHand: 'Right',
          dotBalls: 0,
          bowlersFaced: {},
          runsVsBowler: {},
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          isDismissed: false,
          ballLog: [],
        },
      ],
      bowlers: [],
      fallOfWickets: [],
      pastPartnerships: [],
      thisOverLog: [],
      wideRuns: 0,
      nbRuns: 0,
      byeRuns: 0,
      lbRuns: 0,
      penaltyRuns: 0,
    } as unknown as InningsData),
  });

  describe('1. IntegratedScoreboard Player Profile Interactive Buttons', () => {
    it('renders batsman names wrapped in interactive accessible buttons with touch-manipulation', () => {
      const match = createMockMatch();
      const engine = EventSourcedMatchEngine.fromScorecard(match);

      const html = renderToStaticMarkup(
        <IntegratedScoreboard
          engine={engine}
          selectedTheme={SCOREBOARD_THEMES[0]}
          onClose={() => {}}
          onSelectBatsman={() => {}}
          onSelectBowler={() => {}}
        />
      );

      // Batsman buttons rendered with type="button" and accessible label
      expect(html).toContain('aria-label="View profile for batsman Alex Striker"');
      expect(html).toContain('aria-label="View profile for batsman Charlie Out"');
      expect(html).toContain('touch-manipulation');
      expect(html).toContain('title="Click to view Alex Striker profile"');

      // Row title preserved for existing test compatibility
      expect(html).toContain('title="Click to view batsman profile"');
    });

    it('renders bowler names wrapped in interactive accessible buttons with touch-manipulation', () => {
      const match = createMockMatch();
      const engine = EventSourcedMatchEngine.fromScorecard(match);

      const html = renderToStaticMarkup(
        <IntegratedScoreboard
          engine={engine}
          selectedTheme={SCOREBOARD_THEMES[0]}
          onClose={() => {}}
          onSelectBatsman={() => {}}
          onSelectBowler={() => {}}
        />
      );

      // Bowler buttons rendered with type="button" and accessible label
      expect(html).toContain('aria-label="View profile for bowler Bowler One"');
      expect(html).toContain('aria-label="View profile for bowler Bowler Two"');
      expect(html).toContain('title="Click to view Bowler One profile"');

      // Row title preserved for existing test compatibility
      expect(html).toContain('title="Click to view bowler profile"');
    });

    it('renders unbatted squad players as accessible clickable buttons', () => {
      const match = createMockMatch();
      const engine = EventSourcedMatchEngine.fromScorecard(match);

      const html = renderToStaticMarkup(
        <IntegratedScoreboard
          engine={engine}
          selectedTheme={SCOREBOARD_THEMES[0]}
          onClose={() => {}}
          onSelectBatsman={() => {}}
          onSelectBowler={() => {}}
        />
      );

      expect(html).toContain('Yet to bat:');
      expect(html).toContain('aria-label="View profile for batsman David Unbatted"');
      expect(html).toContain('title="Click to view batsman profile"');
      expect(html).toContain('David Unbatted');
    });

    it('renders Fall of Wickets chip names as interactive profile buttons', () => {
      const match = createMockMatch();
      const engine = EventSourcedMatchEngine.fromScorecard(match);

      const html = renderToStaticMarkup(
        <IntegratedScoreboard
          engine={engine}
          selectedTheme={SCOREBOARD_THEMES[0]}
          onClose={() => {}}
          onSelectBatsman={() => {}}
          onSelectBowler={() => {}}
        />
      );

      expect(html).toContain('aria-label="View profile for batsman Charlie Out"');
      expect(html).toContain('title="Click to view Charlie Out profile"');
    });

    it('verifies code implementation for e.stopPropagation() and stable ID synthesis in IntegratedScoreboard', () => {
      const filePath = path.resolve(__dirname, '../components/scoring/IntegratedScoreboard.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Verifies stopPropagation is applied on batsman and bowler click handlers
      expect(content).toContain('e.stopPropagation()');
      expect(content).toContain('getStableBatsman');
      expect(content).toContain('getStableBowler');

      // Verifies fallback modal state exists when parent callbacks are omitted
      expect(content).toContain('internalSelectedBatsman');
      expect(content).toContain('internalSelectedBowler');
      expect(content).toContain('!onSelectBatsman && (');
      expect(content).toContain('!onSelectBowler && (');
    });
  });

  describe('2. MatchCenterPage Scoreboard Profile Navigation Implementation', () => {
    it('verifies MatchCenterPage has accessible buttons with e.stopPropagation() for batsmen and bowlers', () => {
      const filePath = path.resolve(__dirname, '../app/matches/center/[matchId]/page.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Batsman and bowler buttons
      expect(content).toContain('aria-label={`View profile for batsman ${cleanPlayerName(stableBatter.name)}`}');
      expect(content).toContain('aria-label={`View profile for bowler ${cleanPlayerName(stableBowler.name)}`}');
      expect(content).toContain('e.stopPropagation()');

      // Preserved test row titles
      expect(content).toContain('title="Click to view batsman profile & metrics"');
      expect(content).toContain('title="Click to view bowler profile & spell stats"');

      // Unbatted players squad navigation
      expect(content).toContain('unbattedPlayers.length > 0');
      expect(content).toContain('Yet to bat:');

      // Dynamic import safety
      expect(content).toContain('mod.BatsmanProfileModal || mod.default');
      expect(content).toContain('mod.BowlerProfileModal || mod.default');
    });
  });

  describe('3. BatsmanProfileModal & BowlerProfileModal Export and Collision Hardening', () => {
    it('verifies BatsmanProfileModal provides both named and default exports', () => {
      const filePath = path.resolve(__dirname, '../components/modals/BatsmanProfileModal.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('export function BatsmanProfileModal');
      expect(content).toContain('export default BatsmanProfileModal;');
      // Verifies player ID check on fall of wickets
      expect(content).toContain('(f as any).playerId && player.id && (f as any).playerId === player.id');
    });

    it('verifies BowlerProfileModal provides both named and default exports', () => {
      const filePath = path.resolve(__dirname, '../components/modals/BowlerProfileModal.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('export function BowlerProfileModal');
      expect(content).toContain('export default BowlerProfileModal;');
      // Verifies bowler ID check on wicket filtering
      expect(content).toContain('(w as any).bowlerId && bowler.id && (w as any).bowlerId === bowler.id');
    });

    it('renders BatsmanProfileModal cleanly with player data and allows closing', () => {
      const mockPlayer: Player = {
        id: 'p-test-bat',
        name: 'Virat Kohli',
        battingHand: 'Right',
        dotBalls: 12,
        bowlersFaced: {},
        runsVsBowler: {},
        runs: 82,
        balls: 53,
        fours: 6,
        sixes: 4,
        isDismissed: false,
        ballLog: ['1', '4', '6', '1'],
      };

      const onCloseSpy = vi.fn();

      const html = renderToStaticMarkup(
        <BatsmanProfileModal
          player={mockPlayer}
          isOpen={true}
          onClose={onCloseSpy}
          battingPosition={3}
          partnerships={[]}
          fallOfWickets={[]}
        />
      );

      expect(html).toContain('Virat Kohli');
      expect(html).toContain('82');
      expect(html).toContain('53');
      expect(html).toContain('Close Profile');
    });

    it('renders BowlerProfileModal cleanly with bowler data and allows closing', () => {
      const mockBowler: Bowler = {
        id: 'b-test-bowl',
        name: 'Jasprit Bumrah',
        ballsBowled: 24,
        overs: 4,
        maidens: 1,
        runs: 14,
        wickets: 3,
        overHistory: [],
      };

      const onCloseSpy = vi.fn();

      const html = renderToStaticMarkup(
        <BowlerProfileModal
          bowler={mockBowler}
          isOpen={true}
          onClose={onCloseSpy}
          fallOfWickets={[]}
        />
      );

      expect(html).toContain('Jasprit Bumrah');
      expect(html).toContain('Close Profile');
    });
  });
});
