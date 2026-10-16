import { describe, it, expect, beforeEach } from 'vitest';
import { ScorecardPdfGenerator } from '@/features/scoring/pdf/ScorecardPdfGenerator';
import { ScorecardHtmlGenerator } from '@/features/scoring/pdf/ScorecardHtmlGenerator';
import { MatchRepository } from '@/infrastructure/storage/MatchRepository';
import { GroundRepository } from '@/infrastructure/storage/GroundRepository';
import { SmartGroundDetectionService } from '@/infrastructure/maps/SmartGroundDetectionService';
import { MatchScorecard } from '@/domain/cricket/types';
import { db } from '@/infrastructure/database/dexie-db';

describe('PDF Ground Name Data Flow, Persistence & Fallback Regression Suite', () => {
  const baseMatchScorecard: MatchScorecard = {
    id: 'test-match-dataflow-1',
    teamA: 'Dhaka Gladiators',
    teamB: 'Chittagong Kings',
    tossWinner: 'Dhaka Gladiators',
    tossDecision: 'Batting',
    totalOvers: 5,
    status: 'COMPLETED',
    currentInnings: 2,
    targetScore: 45,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    winner: 'Dhaka Gladiators',
    loser: 'Chittagong Kings',
    result: 'Dhaka Gladiators won by 12 runs',
    resultType: 'WIN',
    margin: 12,
    marginType: 'RUNS',
    firstInnings: {
      inningsNumber: 1,
      team: 'Dhaka Gladiators',
      bowlingTeam: 'Chittagong Kings',
      totalRuns: 44,
      totalWickets: 2,
      totalBalls: 30,
      oversString: '5.0',
      wideRuns: 0,
      nbRuns: 0,
      byeRuns: 0,
      lbRuns: 0,
      penaltyRuns: 0,
      penaltyRunsAgainst: 0,
      strikerIdx: 0,
      nonStrikerIdx: 1,
      currentBowlerIdx: 0,
      nextPlayerIdx: 2,
      lastCompletedOverBowlerIdx: 0,
      isOverComplete: true,
      isFreeHit: false,
      thisOverLog: ['1', '0', '4', '6', '1', '0'],
      fallOfWickets: [],
      pastPartnerships: [],
      currentPartnership: { batter1: 'Player A', batter2: 'Player B', runs: 20, balls: 15 },
      players: [
        { id: 'p1', name: 'Player A', battingHand: 'Right-hand Batsman', runs: 25, balls: 18, fours: 3, sixes: 1, dotBalls: 5, isDismissed: false, ballLog: [], bowlersFaced: {}, runsVsBowler: {} },
        { id: 'p2', name: 'Player B', battingHand: 'Left-hand Batsman', runs: 19, balls: 12, fours: 2, sixes: 0, dotBalls: 3, isDismissed: false, ballLog: [], bowlersFaced: {}, runsVsBowler: {} },
      ],
      bowlers: [
        { id: 'b1', name: 'Bowler A', bowlingStyle: 'Right-arm Fast', overs: 3, ballsBowled: 18, maidens: 0, runs: 22, wickets: 1, noBalls: 0, wides: 0, dotBalls: 7, overHistory: [] },
      ],
    },
    secondInnings: {
      inningsNumber: 2,
      team: 'Chittagong Kings',
      bowlingTeam: 'Dhaka Gladiators',
      totalRuns: 32,
      totalWickets: 5,
      totalBalls: 30,
      oversString: '5.0',
      wideRuns: 0,
      nbRuns: 0,
      byeRuns: 0,
      lbRuns: 0,
      penaltyRuns: 0,
      penaltyRunsAgainst: 0,
      strikerIdx: 0,
      nonStrikerIdx: 1,
      currentBowlerIdx: 0,
      nextPlayerIdx: 2,
      lastCompletedOverBowlerIdx: 0,
      isOverComplete: true,
      isFreeHit: false,
      thisOverLog: ['0', '1', 'W', '0', '0', '1'],
      fallOfWickets: [],
      pastPartnerships: [],
      currentPartnership: { batter1: 'Player C', batter2: 'Player D', runs: 5, balls: 6 },
      players: [
        { id: 'p3', name: 'Player C', battingHand: 'Right-hand Batsman', runs: 15, balls: 16, fours: 1, sixes: 0, dotBalls: 8, isDismissed: true, dismissal: 'Caught', dismissalType: 'CAUGHT', fielder: 'Player A', bowler: 'Bowler B', ballLog: [], bowlersFaced: {}, runsVsBowler: {} },
      ],
      bowlers: [
        { id: 'b2', name: 'Bowler B', bowlingStyle: 'Left-arm Spin', overs: 3, ballsBowled: 18, maidens: 0, runs: 18, wickets: 3, noBalls: 0, wides: 0, dotBalls: 9, overHistory: [] },
      ],
    },
  };

  beforeEach(async () => {
    await db.matches.clear();
    await db.grounds.clear();
  });

  // ── Scenario 1: Creating match with new English Ground Name ──
  it('Scenario 1: Creates match with new English Ground Name and exports PDF with exact ground name', async () => {
    const match: MatchScorecard = {
      ...baseMatchScorecard,
      id: 'match-english-venue',
      venue: 'Lord\'s Cricket Ground',
    };

    const resolved = await ScorecardPdfGenerator.resolveGroundName(match);
    expect(resolved).toBe('Lord\'s Cricket Ground');

    const doc = await ScorecardPdfGenerator.generatePdf(match);
    const pdfText = doc.output();
    expect(pdfText).toContain('Ground Name:');
    expect(pdfText).toContain('Lord\'s Cricket Ground');
    expect(pdfText).not.toContain('Unnamed Ground');

    const html = ScorecardHtmlGenerator.generateHtml(match, resolved);
    expect(html).toContain("Lord's Cricket Ground");
    expect(html).not.toContain('Unnamed Ground');
  });

  // ── Scenario 2: Creating match with Bengali Ground Name ──
  it('Scenario 2: Supports Bengali Ground Name with native Unicode recognition and avoids healing to Unnamed Ground', async () => {
    const bengaliGround = 'মিরপুর শের-ই-বাংলা জাতীয় ক্রিকেট স্টেডিয়াম';

    // Verify smart detection accepts Bengali letters as genuine readable text
    expect(SmartGroundDetectionService.isReadableAlphabeticName(bengaliGround)).toBe(true);

    const match: MatchScorecard = {
      ...baseMatchScorecard,
      id: 'match-bengali-venue',
      venue: bengaliGround,
    };
    await MatchRepository.saveMatch(match);

    // Verify database healing preserves the Bengali venue
    await GroundRepository.healAllExistingGrounds();
    const loaded = await MatchRepository.getMatch('match-bengali-venue');
    expect(loaded?.venue).toBe(bengaliGround);

    const resolved = await ScorecardPdfGenerator.resolveGroundName(match);
    expect(resolved).toBe(bengaliGround);

    const doc = await ScorecardPdfGenerator.generatePdf(match);
    expect(doc).toBeDefined();

    const html = ScorecardHtmlGenerator.generateHtml(match, resolved);
    expect(html).toContain(bengaliGround);
    expect(html).not.toContain('Unnamed Ground');
  });

  // ── Scenario 3: Auto-detected GPS "Unnamed Ground" replaced by user custom ground name ──
  it('Scenario 3: When GPS detected provisional Unnamed Ground, user-entered venue takes authoritative priority', async () => {
    // Ground created as provisional auto-detected ground
    const provisionalGround = await GroundRepository.saveGround({
      id: 'ground-prov-1',
      name: 'Unnamed Ground',
      latitude: 23.81,
      longitude: 90.41,
      locationSource: 'AUTO_DETECTED',
      isProvisional: true,
      isUserConfirmed: false,
    });
    expect(provisionalGround.name).toBe('Unnamed Ground');

    // Match has linked groundId pointing to the provisional ground, BUT user typed explicit venue
    const match: MatchScorecard = {
      ...baseMatchScorecard,
      id: 'match-user-venue-override',
      groundId: provisionalGround.id,
      venue: 'Dhanmondi Cricket Club Ground',
    };
    await MatchRepository.saveMatch(match);

    // resolveGroundName must NEVER return "Unnamed Ground" when a valid user venue is present
    const resolved = await ScorecardPdfGenerator.resolveGroundName(match);
    expect(resolved).toBe('Dhanmondi Cricket Club Ground');
    expect(resolved).not.toBe('Unnamed Ground');

    const doc = await ScorecardPdfGenerator.generatePdf(match);
    const pdfText = doc.output();
    expect(pdfText).toContain('Dhanmondi Cricket Club Ground');
    expect(pdfText).not.toContain('Unnamed Ground');
  });

  // ── Scenario 4: Editing existing match's Ground Name & persistence ──
  it('Scenario 4: Modifying existing match Ground Name persists to DB and updates subsequent PDF export', async () => {
    const match: MatchScorecard = {
      ...baseMatchScorecard,
      id: 'match-editable-venue',
      venue: 'Old Ground Name',
    };
    await MatchRepository.saveMatch(match);

    // Initial check
    expect(await ScorecardPdfGenerator.resolveGroundName(match)).toBe('Old Ground Name');

    // User edits the ground name on the existing match
    const updated = await MatchRepository.updateMatchVenue('match-editable-venue', 'Updated Stadium Ground');
    expect(updated?.venue).toBe('Updated Stadium Ground');

    // Simulate page reload: load fresh record from IndexedDB
    const reloaded = await MatchRepository.getMatch('match-editable-venue');
    expect(reloaded?.venue).toBe('Updated Stadium Ground');

    // PDF generation from reloaded match
    const resolved = await ScorecardPdfGenerator.resolveGroundName(reloaded!);
    expect(resolved).toBe('Updated Stadium Ground');

    const doc = await ScorecardPdfGenerator.generatePdf(reloaded!);
    const pdfText = doc.output();
    expect(pdfText).toContain('Updated Stadium Ground');
    expect(pdfText).not.toContain('Old Ground Name');
  });

  // ── Scenario 5: Editing ground in GroundRepository cascades to linked matches ──
  it('Scenario 5: Renaming ground in GroundRepository cascades updated name to all linked match records', async () => {
    const ground = await GroundRepository.saveGround({
      id: 'ground-cascade-test',
      name: 'Initial Ground Name',
      latitude: 22.35,
      longitude: 91.82,
      isUserConfirmed: true,
      isUserDefined: true,
    });

    const match: MatchScorecard = {
      ...baseMatchScorecard,
      id: 'match-cascade-test',
      groundId: ground.id,
      venue: 'Initial Ground Name',
    };
    await MatchRepository.saveMatch(match);

    // User updates ground name in ground repository
    await GroundRepository.saveGround({
      id: ground.id,
      name: 'Chittagong Divisional Stadium',
      latitude: 22.35,
      longitude: 91.82,
      isUserConfirmed: true,
      isUserDefined: true,
      namingSource: 'MANUAL',
    });

    // Check linked match was updated in Dexie
    const reloadedMatch = await MatchRepository.getMatch('match-cascade-test');
    expect(reloadedMatch?.venue).toBe('Chittagong Divisional Stadium');

    const resolved = await ScorecardPdfGenerator.resolveGroundName(reloadedMatch!);
    expect(resolved).toBe('Chittagong Divisional Stadium');
  });

  // ── Scenario 6: Exporting PDF from Match History ──
  it('Scenario 6: Exporting PDF from Match History page reflects latest saved ground name', async () => {
    const match1: MatchScorecard = {
      ...baseMatchScorecard,
      id: 'match-history-1',
      venue: 'Sylhet International Cricket Stadium',
    };
    await MatchRepository.saveMatch(match1);

    // Fetch matches like MatchHistoryPage does
    const historyList = await MatchRepository.getAllMatches();
    const historyMatch = historyList.find((m) => m.id === 'match-history-1')!;

    const resolved = await ScorecardPdfGenerator.resolveGroundName(historyMatch);
    expect(resolved).toBe('Sylhet International Cricket Stadium');

    const doc = await ScorecardPdfGenerator.generatePdf(historyMatch);
    const pdfText = doc.output();
    expect(pdfText).toContain('Sylhet International Cricket Stadium');
  });

  // ── Scenario 7: Fallback handling when Ground Name is truly absent ──
  it('Scenario 7: When Ground Name is genuinely absent, displays "Not Available" and NEVER "Unnamed Ground" or coordinates', async () => {
    const matchWithoutAnyGround: MatchScorecard = {
      ...baseMatchScorecard,
      id: 'match-no-ground',
      venue: undefined,
      groundId: undefined,
      location: undefined,
      advancedSettings: {
        ...baseMatchScorecard.advancedSettings!,
        venue: undefined,
        groundId: undefined,
      },
    };

    const resolved = await ScorecardPdfGenerator.resolveGroundName(matchWithoutAnyGround);
    expect(resolved).toBeNull();

    const doc = await ScorecardPdfGenerator.generatePdf(matchWithoutAnyGround);
    const pdfText = doc.output();
    expect(pdfText).toContain('Ground Name:');
    expect(pdfText).toContain('Not Available');
    expect(pdfText).not.toContain('Unnamed Ground');
    expect(pdfText).not.toContain('Standard Ground');

    const html = ScorecardHtmlGenerator.generateHtml(matchWithoutAnyGround, resolved);
    expect(html).toContain('Ground Name: Not Available');
    expect(html).not.toContain('Unnamed Ground');
  });

  // ── Scenario 8: Fallback handling when venue is coordinate-based ──
  it('Scenario 8: Rejects coordinate-based venue text and falls back to clean "Not Available"', async () => {
    const matchWithCoords: MatchScorecard = {
      ...baseMatchScorecard,
      id: 'match-coords-venue',
      venue: 'Ground at 23.8103, 90.4125',
    };

    const resolved = await ScorecardPdfGenerator.resolveGroundName(matchWithCoords);
    expect(resolved).toBeNull();

    const doc = await ScorecardPdfGenerator.generatePdf(matchWithCoords);
    const pdfText = doc.output();
    expect(pdfText).toContain('Not Available');
    expect(pdfText).not.toContain('Ground at 23.8103, 90.4125');
  });

  // ── Scenario 9: Preserving PDF Layout - only human-readable name, no coordinates/metadata ──
  it('Scenario 9: PDF Ground Information card renders ONLY the human-readable Ground Name, without GPS coordinates or source', async () => {
    const match: MatchScorecard = {
      ...baseMatchScorecard,
      id: 'match-layout-check',
      venue: 'Sher-e-Bangla National Cricket Stadium',
      location: {
        latitude: 23.8069,
        longitude: 90.3634,
        accuracy: 10,
        source: 'GPS',
      },
    };

    const doc = await ScorecardPdfGenerator.generatePdf(match);
    const pdfText = doc.output();

    // Verify Ground Information header and body
    expect(pdfText).toContain('GROUND INFORMATION');
    expect(pdfText).toContain('Ground Name:');
    expect(pdfText).toContain('Sher-e-Bangla National Cricket Stadium');

    // Layout check: GPS coordinates and metadata must NOT be rendered in Ground Information
    expect(pdfText).not.toContain('23.8069');
    expect(pdfText).not.toContain('90.3634');
    expect(pdfText).not.toContain('Accuracy:');
    expect(pdfText).not.toContain('MAP_SELECTED');
    expect(pdfText).not.toContain('LOCALITY_FALLBACK');
  });
});
