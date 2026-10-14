import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { GoogleMapsLoaderService } from '../infrastructure/maps/GoogleMapsLoaderService';
import { getCricketBallMarkerSvg } from '../components/maps/CricketMarkerIcon';
import { MatchRepository } from '../infrastructure/storage/MatchRepository';
import { db } from '../infrastructure/database/dexie-db';

describe('Grounds Map Integration & Backward Compatibility Test Suite', () => {
  beforeEach(async () => {
    await db.matches.clear();
    await db.match_events.clear();
    await db.grounds.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Match Engine & Scorecard Ground ID Association', () => {
    it('associates groundId with match through constructor and persists in scorecard', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'India',
        teamB: 'South Africa',
        tossWinner: 'India',
        tossDecision: 'Batting',
        totalOvers: 6,
        venue: 'Wankhede Stadium',
        groundId: 'ground_wankhede_123',
        strikerName: 'Rohit',
        nonStrikerName: 'Gill',
        bowlerName: 'Rabada',
      });

      expect(engine.groundId).toBe('ground_wankhede_123');
      expect(engine.venue).toBe('Wankhede Stadium');

      const scorecard = engine.toScorecard();
      expect(scorecard.groundId).toBe('ground_wankhede_123');
      expect(scorecard.venue).toBe('Wankhede Stadium');
    });

    it('round-trips groundId through domain event replay (fromEvents)', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Australia',
        teamB: 'New Zealand',
        tossWinner: 'Australia',
        tossDecision: 'Bowling',
        totalOvers: 5,
        venue: 'Adelaide Oval',
        groundId: 'ground_adelaide_999',
        strikerName: 'Conway',
        nonStrikerName: 'Allen',
        bowlerName: 'Starc',
      });

      // Score delivery
      engine.scoreBall({ runsScored: 4 });

      // Reconstruct from events
      const reconstructed = EventSourcedMatchEngine.fromEvents(engine.events);
      expect(reconstructed.groundId).toBe('ground_adelaide_999');
      expect(reconstructed.venue).toBe('Adelaide Oval');
      expect(reconstructed.toScorecard().groundId).toBe('ground_adelaide_999');
    });

    it('preserves backward compatibility for legacy matches without groundId', async () => {
      const legacyEngine = new EventSourcedMatchEngine({
        teamA: 'Vintage XI',
        teamB: 'Classic XI',
        tossWinner: 'Vintage XI',
        tossDecision: 'Batting',
        totalOvers: 8,
        venue: 'Old Ground',
        // NO groundId passed
      });

      expect(legacyEngine.groundId).toBeUndefined();
      expect(legacyEngine.venue).toBe('Old Ground');

      const scorecard = legacyEngine.toScorecard();
      expect(scorecard.groundId).toBeUndefined();
      expect(scorecard.venue).toBe('Old Ground');

      // Persist to IndexedDB
      await MatchRepository.saveMatch(scorecard);
      const retrieved = await MatchRepository.getMatch(scorecard.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.venue).toBe('Old Ground');
      expect(retrieved?.groundId).toBeUndefined();
    });
  });

  describe('2. Google Maps Loader & Custom Cricket Markers', () => {
    it('handles missing API key gracefully without throwing unhandled exceptions', async () => {
      GoogleMapsLoaderService.resetForTesting();
      const prevKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

      const result = await GoogleMapsLoaderService.load();
      expect(result.success).toBe(false);
      expect(result.status).toBe('NO_API_KEY');
      expect(result.errorMessage).toContain('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');

      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = prevKey;
      GoogleMapsLoaderService.resetForTesting();
    });

    it('generates valid cricket-themed SVG pin marker with seams', () => {
      const normalSvg = getCricketBallMarkerSvg({ isSelected: false });
      expect(normalSvg).toContain('<svg');
      expect(normalSvg).toContain('circle');
      expect(normalSvg).toContain('#dc2626'); // Cricket red pin
      expect(normalSvg).toContain('stroke-dasharray="1.5,1.2"'); // Cricket ball seam stitches

      const selectedSvg = getCricketBallMarkerSvg({ isSelected: true });
      expect(selectedSvg).toContain('#059669'); // Emerald selected pin
    });
  });
});
