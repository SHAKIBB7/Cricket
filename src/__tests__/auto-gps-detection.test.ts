import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AutoGpsLocationService,
  GpsLocationServiceError,
} from '../infrastructure/gps/AutoGpsLocationService';
import { GroundRepository } from '../infrastructure/storage/GroundRepository';
import { NearbyGroundDetectionService } from '../infrastructure/maps/NearbyGroundDetectionService';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { db } from '../infrastructure/database/dexie-db';

describe('AutoGpsLocationService & Offline Ground Detection Test Suite', () => {
  beforeEach(async () => {
    await db.grounds.clear();
    await db.matches.clear();
    await db.sync_queue.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('1. Geolocation Permission Verification', () => {
    it('returns "granted" when browser Permissions API reports granted', async () => {
      vi.stubGlobal('navigator', {
        geolocation: {},
        permissions: {
          query: vi.fn().mockResolvedValue({ state: 'granted' }),
        },
      });

      const perm = await AutoGpsLocationService.checkPermission();
      expect(perm).toBe('granted');
    });

    it('returns "prompt" when browser Permissions API reports prompt', async () => {
      vi.stubGlobal('navigator', {
        geolocation: {},
        permissions: {
          query: vi.fn().mockResolvedValue({ state: 'prompt' }),
        },
      });

      const perm = await AutoGpsLocationService.checkPermission();
      expect(perm).toBe('prompt');
    });

    it('returns "denied" when browser Permissions API reports denied', async () => {
      vi.stubGlobal('navigator', {
        geolocation: {},
        permissions: {
          query: vi.fn().mockResolvedValue({ state: 'denied' }),
        },
      });

      const perm = await AutoGpsLocationService.checkPermission();
      expect(perm).toBe('denied');
    });

    it('returns "unsupported" when navigator.geolocation is missing', async () => {
      vi.stubGlobal('navigator', {});
      const perm = await AutoGpsLocationService.checkPermission();
      expect(perm).toBe('unsupported');
    });
  });

  describe('2. One-Shot GPS Location Capture & Accuracy Validation', () => {
    it('captures coordinates and flags isLowAccuracy = false for accurate fix (<= 500m)', async () => {
      const mockPosition = {
        coords: {
          latitude: 23.80691234,
          longitude: 90.36371234,
          accuracy: 15,
        },
        timestamp: Date.now(),
      };

      vi.stubGlobal('navigator', {
        geolocation: {
          getCurrentPosition: vi.fn().mockImplementation((success) => success(mockPosition)),
        },
      });

      const result = await AutoGpsLocationService.getCurrentPosition();
      expect(result.latitude).toBe(23.806912);
      expect(result.longitude).toBe(90.363712);
      expect(result.accuracy).toBe(15);
      expect(result.isLowAccuracy).toBe(false);
      expect(result.timestamp).toBeDefined();
    });

    it('flags isLowAccuracy = true when GPS accuracy exceeds 500 meters threshold', async () => {
      const mockInaccuratePosition = {
        coords: {
          latitude: 23.8100,
          longitude: 90.4100,
          accuracy: 650,
        },
        timestamp: Date.now(),
      };

      vi.stubGlobal('navigator', {
        geolocation: {
          getCurrentPosition: vi.fn().mockImplementation((success) => success(mockInaccuratePosition)),
        },
      });

      const result = await AutoGpsLocationService.getCurrentPosition();
      expect(result.accuracy).toBe(650);
      expect(result.isLowAccuracy).toBe(true);
    });

    it('maps PERMISSION_DENIED error into strongly-typed GpsLocationServiceError', async () => {
      vi.stubGlobal('navigator', {
        geolocation: {
          getCurrentPosition: vi.fn().mockImplementation((_, error) =>
            error({ code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1 })
          ),
        },
      });

      await expect(AutoGpsLocationService.getCurrentPosition()).rejects.toThrow(GpsLocationServiceError);
      try {
        await AutoGpsLocationService.getCurrentPosition();
      } catch (e: any) {
        expect(e.code).toBe('PERMISSION_DENIED');
        expect(e.message).toContain('Location access was denied');
      }
    });

    it('maps TIMEOUT error into strongly-typed GpsLocationServiceError', async () => {
      vi.stubGlobal('navigator', {
        geolocation: {
          getCurrentPosition: vi.fn().mockImplementation((_, error) =>
            error({ code: 3, message: 'Timeout expired', TIMEOUT: 3 })
          ),
        },
      });

      try {
        await AutoGpsLocationService.getCurrentPosition();
      } catch (e: any) {
        expect(e.code).toBe('TIMEOUT');
        expect(e.message).toContain('timed out');
      }
    });
  });

  describe('3. Haversine Distance Calculation & Formatting', () => {
    it('accurately computes distance in meters between two coordinates', () => {
      // Sher-e-Bangla Stadium (23.8069, 90.3637) to Mirpur 10 Circle (23.8071, 90.3686) ~500m
      const distance = AutoGpsLocationService.calculateDistanceMeters(
        23.8069,
        90.3637,
        23.8071,
        90.3686
      );
      expect(distance).toBeGreaterThan(450);
      expect(distance).toBeLessThan(550);
    });

    it('formats meters and kilometers into clean human-readable strings', () => {
      expect(AutoGpsLocationService.formatDistance(85)).toBe('85m');
      expect(AutoGpsLocationService.formatDistance(650)).toBe('650m');
      expect(AutoGpsLocationService.formatDistance(1250)).toBe('1.3 km');
      expect(AutoGpsLocationService.formatDistance(5000)).toBe('5.0 km');
    });
  });

  describe('4. Offline-First Nearby Ground Discovery', () => {
    it('discovers local grounds within proximity sorted by distance ascending', async () => {
      // Base user position: (23.8000, 90.3600)
      const userLat = 23.8000;
      const userLng = 90.3600;

      // Ground A: ~200m away
      await GroundRepository.saveGround({
        name: 'Mirpur Cricket Academy Ground',
        latitude: 23.8015,
        longitude: 90.3610,
        accuracy: 10,
        locationSource: 'GPS',
      });

      // Ground B: ~600m away
      await GroundRepository.saveGround({
        name: 'City Club Ground',
        latitude: 23.8050,
        longitude: 90.3620,
        accuracy: 25,
        locationSource: 'MANUAL',
      });

      // Ground C: Far away (~15km)
      await GroundRepository.saveGround({
        name: 'Fatullah Osmani Stadium',
        latitude: 23.6400,
        longitude: 90.4800,
        locationSource: 'MAP_SELECTED',
      });

      // Search within 1000m
      const nearby = await GroundRepository.findNearbyGrounds(userLat, userLng, 1000);
      expect(nearby).toHaveLength(2);
      expect(nearby[0].name).toBe('Mirpur Cricket Academy Ground');
      expect(nearby[1].name).toBe('City Club Ground');
      expect(nearby[0].distanceMeters).toBeLessThan(nearby[1].distanceMeters);
    });
  });

  describe('5. NearbyGroundDetectionService Multi-Source Merging & Deduplication', () => {
    it('merges local saved grounds and maintains deduplication without duplicate cards', async () => {
      // Save local ground
      const localGround = await GroundRepository.saveGround({
        name: 'National Stadium',
        latitude: 23.8069,
        longitude: 90.3637,
        googlePlaceId: 'place_sbns_123',
        locationSource: 'GPS',
      });

      const candidates = await NearbyGroundDetectionService.detectNearbyGrounds(
        23.8065,
        90.3635,
        1000
      );

      expect(candidates.length).toBeGreaterThanOrEqual(1);
      const matched = candidates.find((c) => c.googlePlaceId === 'place_sbns_123');
      expect(matched).toBeDefined();
      expect(matched?.isSaved).toBe(true);
      expect(matched?.id).toBe(localGround.id);
    });
  });

  describe('6. Match Scorecard Location Metadata Persistence', () => {
    it('stores GPS location metadata in EventSourcedMatchEngine and MatchScorecard', () => {
      const locationMeta = {
        latitude: 23.8069,
        longitude: 90.3637,
        accuracy: 12,
        timestamp: '2026-10-14T15:30:00.000Z',
        source: 'GPS' as const,
      };

      const engine = new EventSourcedMatchEngine({
        teamA: 'Dhaka Dynamites',
        teamB: 'Chittagong Vikings',
        tossWinner: 'Dhaka Dynamites',
        tossDecision: 'Batting',
        totalOvers: 10,
        venue: 'Sher-e-Bangla Stadium',
        groundId: 'ground_sbns_01',
        location: locationMeta,
      });

      expect(engine.location).toEqual(locationMeta);
      const scorecard = engine.toScorecard();
      expect(scorecard.location).toEqual(locationMeta);
      expect(scorecard.groundId).toBe('ground_sbns_01');
      expect(scorecard.venue).toBe('Sher-e-Bangla Stadium');
    });

    it('reconstructs location metadata accurately via EventSourcedMatchEngine.fromEvents()', () => {
      const locationMeta = {
        latitude: 22.3569,
        longitude: 91.7832,
        accuracy: 18,
        timestamp: '2026-10-14T15:35:00.000Z',
        source: 'GPS' as const,
      };

      const originalEngine = new EventSourcedMatchEngine({
        teamA: 'Sylhet Strikers',
        teamB: 'Rangpur Riders',
        tossWinner: 'Sylhet Strikers',
        tossDecision: 'Batting',
        totalOvers: 6,
        venue: 'Zohur Ahmed Chowdhury Stadium',
        groundId: 'ground_zacs_02',
        location: locationMeta,
      });

      const reconstructed = EventSourcedMatchEngine.fromEvents(originalEngine.events);
      expect(reconstructed.location).toEqual(locationMeta);
      expect(reconstructed.groundId).toBe('ground_zacs_02');
      expect(reconstructed.toScorecard().location).toEqual(locationMeta);
    });
  });
});
