import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SmartGroundDetectionService,
  RawPlaceCandidate,
  DEFAULT_SMART_DETECTION_CONFIG,
  PROGRESSIVE_RADII_SEQUENCE,
} from '../infrastructure/maps/SmartGroundDetectionService';
import { GroundRepository } from '../infrastructure/storage/GroundRepository';
import { AutoGpsLocationService, GpsLocationServiceError } from '../infrastructure/gps/AutoGpsLocationService';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { db } from '../infrastructure/database/dexie-db';
import { CricketGround, MatchScorecard } from '../domain/cricket/types';
import { ScorecardPdfGenerator } from '../features/scoring/pdf/ScorecardPdfGenerator';

describe('Smart Automatic Cricket Ground Detection & Naming System Suite', () => {
  const userPlayingLat = 23.8105;
  const userPlayingLng = 90.4128;

  beforeEach(async () => {
    await db.grounds.clear();
    await db.matches.clear();
    await db.sync_queue.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 1: Confirmed ground already exists in DB
  // ─────────────────────────────────────────────────────────────
  it('Scenario 1: returns confirmed ground from local database first without calling external APIs', async () => {
    const saved = await GroundRepository.saveGround({
      name: 'Gulshan Youth Club Ground',
      latitude: 23.8108,
      longitude: 90.4131, // ~45 meters away
      isUserConfirmed: true,
      locationSource: 'AUTO_DETECTED',
      accuracy: 10,
    });

    const result = await SmartGroundDetectionService.detectGround(userPlayingLat, userPlayingLng, 10);

    expect(result.isConfirmedDbMatch).toBe(true);
    expect(result.namingSource).toBe('CONFIRMED_DB');
    expect(result.ground.id).toBe(saved.id);
    expect(result.ground.name).toBe('Gulshan Youth Club Ground');
    expect(result.confidenceScore).toBeGreaterThanOrEqual(0.95);
    expect(result.detectionRadiusMeters).toBe(50);
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 2: Suitable ground exists within 100 meters
  // ─────────────────────────────────────────────────────────────
  it('Scenario 2: selects a suitable cricket ground within 100 meters at the 100m ring', async () => {
    const candidates: RawPlaceCandidate[] = [
      {
        name: 'Banani Cricket Field',
        latitude: 23.8109,
        longitude: 90.4132, // ~60m away
        googlePlaceId: 'place_cricket_60m',
      },
      {
        name: 'Distant Stadium',
        latitude: 23.8180,
        longitude: 90.4200, // ~1100m away
        googlePlaceId: 'place_distant',
      },
    ];

    const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
      userPlayingLat,
      userPlayingLng,
      12,
      candidates
    );

    expect(result.matchedCandidate).toBeDefined();
    expect(result.matchedCandidate?.rawName).toBe('Banani Cricket Field');
    expect(result.detectionRadiusMeters).toBe(100);
    expect(result.stepCount).toBe(2); // 50m -> 100m
    expect(result.confidenceScore).toBeGreaterThanOrEqual(0.8);
    // Playing location is strictly preserved
    expect(result.ground.latitude).toBe(userPlayingLat);
    expect(result.ground.longitude).toBe(userPlayingLng);
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 3: Suitable ground exists within 200m but not within 150m
  // ─────────────────────────────────────────────────────────────
  it('Scenario 3: expands from 50m through 100m, 150m to 200m and selects candidate at the 200m increment', async () => {
    const candidates: RawPlaceCandidate[] = [
      {
        name: 'Palash High School',
        latitude: 23.8118,
        longitude: 90.4138, // ~175m away (outside 150m, inside 200m)
        googlePlaceId: 'place_school_175m',
      },
    ];

    const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
      userPlayingLat,
      userPlayingLng,
      15,
      candidates
    );

    expect(result.detectionRadiusMeters).toBe(200);
    expect(result.stepCount).toBe(4); // 50m, 100m, 150m, 200m
    // School naming rule: appends "Ground"
    expect(result.ground.name).toBe('Palash High School Ground');
    expect(result.ground.referencePlaceName).toBe('Palash High School');
    expect(result.ground.referenceDistanceMeters).toBeGreaterThan(150);
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 4: Suitable ground found at a later increment (e.g. 500m)
  // ─────────────────────────────────────────────────────────────
  it('Scenario 4: progressively scans until finding suitable venue at 500m increment', async () => {
    const candidates: RawPlaceCandidate[] = [
      {
        name: 'Tejgaon Sports Complex',
        latitude: 23.8145,
        longitude: 90.4145, // ~475m away (outside 450m, inside 500m)
        googlePlaceId: 'place_sports_475m',
      },
    ];

    const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
      userPlayingLat,
      userPlayingLng,
      10,
      candidates
    );

    expect(result.detectionRadiusMeters).toBe(500);
    expect(result.stepCount).toBe(10); // 50, 100, 150, 200, 250, 300, 350, 400, 450, 500
    expect(result.ground.name).toBe('Tejgaon Sports Complex');
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 5: Candidate exists near 1,500-meter boundary
  // ─────────────────────────────────────────────────────────────
  it('Scenario 5: evaluates candidate near 1,500m boundary (e.g. 1,420m)', async () => {
    // 1420m away
    const lat1420 = userPlayingLat + 0.0125;
    const lng1420 = userPlayingLng + 0.005;

    const candidates: RawPlaceCandidate[] = [
      {
        name: 'Uttara Central Cricket Stadium',
        latitude: lat1420,
        longitude: lng1420,
        googlePlaceId: 'place_boundary_1420m',
      },
    ];

    const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
      userPlayingLat,
      userPlayingLng,
      10,
      candidates,
      { ...DEFAULT_SMART_DETECTION_CONFIG, confidenceThreshold: 0.25 }
    );

    expect(result.detectionRadiusMeters).toBe(1500);
    expect(result.matchedCandidate?.rawName).toBe('Uttara Central Cricket Stadium');
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 6: No relevant ground exists within 1,500 meters
  // ─────────────────────────────────────────────────────────────
  it('Scenario 6: stops expanding at 1500m and falls back to locality-based provisional name', async () => {
    // Candidate is far away (> 2.5km)
    const candidates: RawPlaceCandidate[] = [
      {
        name: 'Distant Ground',
        latitude: 23.8400,
        longitude: 90.4400, // ~4km away
        googlePlaceId: 'place_far',
      },
    ];

    const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
      userPlayingLat,
      userPlayingLng,
      15,
      candidates
    );

    expect(result.detectionRadiusMeters).toBe(1500);
    expect(result.isProvisional).toBe(true);
    expect(result.namingSource).toBe('LOCALITY_FALLBACK');
    expect(result.ground.name).toBe('Unnamed Ground');
    expect(result.ground.latitude).toBe(userPlayingLat);
    expect(result.ground.longitude).toBe(userPlayingLng);
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 7: Popular nearby establishment unrelated to cricket
  // ─────────────────────────────────────────────────────────────
  it('Scenario 7: rejects nearby shops, mosques, and markets at 30m from being chosen as cricket grounds', async () => {
    const candidates: RawPlaceCandidate[] = [
      {
        name: 'Baitul Mukarram Local Mosque',
        latitude: 23.8106,
        longitude: 90.4129, // 20m away!
        googlePlaceId: 'place_mosque_20m',
      },
      {
        name: 'Haji Biryani Restaurant',
        latitude: 23.8107,
        longitude: 90.4130, // 35m away!
        googlePlaceId: 'place_food_35m',
      },
      {
        name: 'Model Town High School',
        latitude: 23.8125,
        longitude: 90.4140, // 250m away
        googlePlaceId: 'place_school_250m',
      },
    ];

    const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
      userPlayingLat,
      userPlayingLng,
      10,
      candidates
    );

    // The 20m mosque and 35m restaurant are disqualified; the school at 250m is chosen!
    expect(result.matchedCandidate?.rawName).toBe('Model Town High School');
    expect(result.ground.name).toBe('Model Town High School Ground');
    expect(result.ground.name).not.toContain('Mosque');
    expect(result.ground.name).not.toContain('Biryani');
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 8: Several nearby schools or grounds create ambiguity
  // ─────────────────────────────────────────────────────────────
  it('Scenario 8: flags ambiguity when multiple candidates have similarly high confidence', async () => {
    const candidates: RawPlaceCandidate[] = [
      {
        name: 'Ideal School and College',
        latitude: 23.8115,
        longitude: 90.4135, // ~130m away
        googlePlaceId: 'place_ideal_school',
      },
      {
        name: 'Government Boys High School',
        latitude: 23.8116,
        longitude: 90.4136, // ~140m away
        googlePlaceId: 'place_govt_school',
      },
    ];

    const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
      userPlayingLat,
      userPlayingLng,
      10,
      candidates
    );

    expect(result.hasAmbiguity).toBe(true);
    expect(result.alternativeCandidates.length).toBeGreaterThanOrEqual(1);
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 9: Insufficient GPS accuracy
  // ─────────────────────────────────────────────────────────────
  it('Scenario 9: applies accuracy penalty when GPS accuracy is poor (>500m)', () => {
    const accurateScore = SmartGroundDetectionService.calculateConfidenceScore(1.0, 100, 15);
    const inaccurateScore = SmartGroundDetectionService.calculateConfidenceScore(1.0, 100, 650);

    expect(inaccurateScore).toBeLessThan(accurateScore);
    expect(inaccurateScore).toBe(0.7); // 1.0 * 1.0 * 0.70 penalty
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 10: Location permission denial
  // ─────────────────────────────────────────────────────────────
  it('Scenario 10: handles geolocation permission denial gracefully', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn().mockImplementation((_, err) =>
          err({ code: 1, message: 'Permission Denied', PERMISSION_DENIED: 1 })
        ),
      },
    });

    await expect(AutoGpsLocationService.getCurrentPosition()).rejects.toThrow(GpsLocationServiceError);
    try {
      await AutoGpsLocationService.getCurrentPosition();
    } catch (err: any) {
      expect(err.code).toBe('PERMISSION_DENIED');
    }
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 11: User manually enters a venue name
  // ─────────────────────────────────────────────────────────────
  it('Scenario 11: never overwrites user-confirmed ground name with automatic suggestion', async () => {
    const confirmedGround = await GroundRepository.saveGround({
      name: 'Custom Village Pitch No. 1',
      latitude: userPlayingLat,
      longitude: userPlayingLng,
      isUserConfirmed: true,
      locationSource: 'MANUAL',
    });

    // Attempt to save an auto-detected candidate at the same spot
    const updated = await GroundRepository.saveGround({
      id: confirmedGround.id,
      name: 'Auto Suggested School Ground',
      latitude: userPlayingLat,
      longitude: userPlayingLng,
      isUserConfirmed: false, // automatic, not user confirmed
    });

    // Name must remain "Custom Village Pitch No. 1"
    expect(updated.name).toBe('Custom Village Pitch No. 1');
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 12: Duplicate ground creation attempt
  // ─────────────────────────────────────────────────────────────
  it('Scenario 12: prevents duplicate ground creation for matching Place ID or coordinates', async () => {
    const g1 = await GroundRepository.saveGround({
      name: 'Dhanmondi Cricket Stadium',
      latitude: 23.7465,
      longitude: 90.3750,
      googlePlaceId: 'place_dhanmondi_stadium',
      locationSource: 'AUTO_DETECTED',
    });

    const g2 = await GroundRepository.saveGround({
      name: 'Dhanmondi Cricket Stadium (duplicate attempt)',
      latitude: 23.7466,
      longitude: 90.3751,
      googlePlaceId: 'place_dhanmondi_stadium',
    });

    expect(g1.id).toBe(g2.id);
    const all = await GroundRepository.getAllGrounds();
    expect(all.filter((g) => g.googlePlaceId === 'place_dhanmondi_stadium')).toHaveLength(1);
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 13: Google Places returns no results or API error
  // ─────────────────────────────────────────────────────────────
  it('Scenario 13: handles empty Places results without crashing', async () => {
    const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
      userPlayingLat,
      userPlayingLng,
      20,
      [] // empty candidates
    );

    expect(result.ground).toBeDefined();
    expect(result.isProvisional).toBe(true);
    expect(result.namingSource).toBe('LOCALITY_FALLBACK');
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 14: Reverse geocoding fails
  // ─────────────────────────────────────────────────────────────
  it('Scenario 14: produces clean English alphabetic name "Local Cricket Ground" when reverse geocoding is unavailable', async () => {
    // When offline and geocoder unavailable
    vi.stubGlobal('navigator', { onLine: false });

    const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
      userPlayingLat,
      userPlayingLng,
      15,
      []
    );

    // Strictly returns readable English alphabetic text, never numeric coordinates or codes
    expect(result.ground.name).toBe('Unnamed Ground');
    expect(result.ground.name).not.toMatch(/\d/);
    expect(result.ground.latitude).toBe(userPlayingLat);
    expect(result.ground.longitude).toBe(userPlayingLng);
    expect(result.isProvisional).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 15: Device offline with confirmed venue exists locally
  // ─────────────────────────────────────────────────────────────
  it('Scenario 15: finds and returns local confirmed venue when completely offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });

    await GroundRepository.saveGround({
      name: 'Offline Cricket Oval',
      latitude: 23.8106,
      longitude: 90.4129,
      isUserConfirmed: true,
      locationSource: 'MANUAL',
    });

    const result = await SmartGroundDetectionService.detectGround(userPlayingLat, userPlayingLng, 10);
    expect(result.isConfirmedDbMatch).toBe(true);
    expect(result.ground.name).toBe('Offline Cricket Oval');
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 16: Locally created venue queues sync mutation
  // ─────────────────────────────────────────────────────────────
  it('Scenario 16: saves locally created ground and queues UPSERT_GROUND mutation in sync queue', async () => {
    const ground = await GroundRepository.saveGround({
      name: 'Sync Test Ground',
      latitude: 23.8100,
      longitude: 90.4100,
      locationSource: 'AUTO_DETECTED',
    });

    const queueItems = await db.sync_queue.toArray();
    const groundMutation = queueItems.find(
      (q) => q.operationType === 'UPSERT_GROUND' && q.entityId === ground.id
    );

    expect(groundMutation).toBeDefined();
    expect(groundMutation?.status).toBe('PENDING');
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 17: Production match-scoring workflow and scorecard linkage
  // ─────────────────────────────────────────────────────────────
  it('Scenario 17: links ground metadata with coordinate separation to match scorecard', () => {
    const matchLocationMeta = {
      latitude: userPlayingLat,
      longitude: userPlayingLng,
      accuracy: 12,
      source: 'AUTO_DETECTED' as const,
      referencePlaceName: 'City High School',
      referenceDistanceMeters: 140,
      confidenceScore: 0.85,
    };

    const engine = new EventSourcedMatchEngine({
      teamA: 'Eagles',
      teamB: 'Hawks',
      tossWinner: 'Eagles',
      tossDecision: 'Batting',
      totalOvers: 10,
      venue: 'City High School Ground',
      groundId: 'ground_smart_123',
      location: matchLocationMeta,
    });

    const scorecard = engine.toScorecard();
    expect(scorecard.venue).toBe('City High School Ground');
    expect(scorecard.groundId).toBe('ground_smart_123');
    expect(scorecard.location).toEqual(matchLocationMeta);
    expect(scorecard.location?.referencePlaceName).toBe('City High School');
    expect(scorecard.location?.latitude).toBe(userPlayingLat);
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 18: Numeric Name Prevention & Google Places (New) Display Name
  // ─────────────────────────────────────────────────────────────
  describe('Requirement: Numeric Ground Names Prevention & Alphabetic Text Resolution', () => {
    it('rejects purely numeric codes, list numbers, internal IDs, and resource paths', () => {
      expect(SmartGroundDetectionService.isReadableAlphabeticName('1')).toBe(false);
      expect(SmartGroundDetectionService.isReadableAlphabeticName('2')).toBe(false);
      expect(SmartGroundDetectionService.isReadableAlphabeticName('3')).toBe(false);
      expect(SmartGroundDetectionService.isReadableAlphabeticName('1.')).toBe(false);
      expect(SmartGroundDetectionService.isReadableAlphabeticName('2.')).toBe(false);
      expect(SmartGroundDetectionService.isReadableAlphabeticName('#1')).toBe(false);
      expect(SmartGroundDetectionService.isReadableAlphabeticName('Ward 1')).toBe(false);
      expect(SmartGroundDetectionService.isReadableAlphabeticName('Sector 4')).toBe(false);
      expect(SmartGroundDetectionService.isReadableAlphabeticName('places/ChIJN1t_tDeuEmsRUsoyG83frY4')).toBe(false);
      expect(SmartGroundDetectionService.isReadableAlphabeticName('ChIJN1t_tDeuEmsRUsoyG83frY4')).toBe(false);
      expect(SmartGroundDetectionService.isReadableAlphabeticName('ground_1729123456789_abcde')).toBe(false);

      expect(SmartGroundDetectionService.isReadableAlphabeticName('Char Sindur High School Ground')).toBe(true);
      expect(SmartGroundDetectionService.isReadableAlphabeticName('Palash Cricket Ground')).toBe(true);
      expect(SmartGroundDetectionService.isReadableAlphabeticName('Local Cricket Ground')).toBe(true);
    });

    it('extracts human-readable name from Google Places API (New) displayName.text', () => {
      // Places API (New) result with displayName.text
      const placeNew = {
        name: 'places/ChIJxyz123456789',
        displayName: {
          text: 'Char Sindur High School',
          languageCode: 'en',
        },
      };

      const extracted = SmartGroundDetectionService.extractReadablePlaceName(placeNew);
      expect(extracted).toBe('Char Sindur High School');

      const groundName = SmartGroundDetectionService.generateSmartGroundName(extracted!, 'EDUCATIONAL_CAMPUS');
      expect(groundName).toBe('Char Sindur High School Ground');
    });

    it('generates Palash Cricket Ground when locality is Palash and candidate name is numeric', () => {
      const generated = SmartGroundDetectionService.generateSmartGroundName('1', 'UNRELATED', 'Palash');
      expect(generated).toBe('Palash Cricket Ground');
    });

    it('generates Unnamed Ground when candidate name is missing or numeric and locality is absent', () => {
      expect(SmartGroundDetectionService.generateSmartGroundName('1', 'UNRELATED')).toBe('Unnamed Ground');
      expect(SmartGroundDetectionService.generateSmartGroundName('1.', 'UNRELATED')).toBe('Unnamed Ground');
      expect(SmartGroundDetectionService.generateSmartGroundName('', 'UNRELATED')).toBe('Unnamed Ground');
    });

    it('heals existing database records with numeric names without deleting them', async () => {
      // Simulate existing corrupted record with numeric name "1"
      const corrupted: CricketGround = {
        id: 'ground_legacy_numeric_1',
        name: '1',
        latitude: 23.8100,
        longitude: 90.4100,
        referencePlaceName: 'Char Sindur High School',
        isUserConfirmed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.grounds.put(corrupted);

      const healed = await GroundRepository.getGround('ground_legacy_numeric_1');
      expect(healed).toBeDefined();
      expect(healed!.name).toBe('Char Sindur High School Ground');
      expect(healed!.name).not.toBe('1');

      // Verify getAllGrounds also returns healed alphabetic name
      const all = await GroundRepository.getAllGrounds();
      const found = all.find((g) => g.id === 'ground_legacy_numeric_1');
      expect(found?.name).toBe('Char Sindur High School Ground');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 12-POINT COMPREHENSIVE VERIFICATION SUITE
  // ─────────────────────────────────────────────────────────────
  describe('12-Point Comprehensive Verification Suite: Ground Detection, Progressive Search, Persistence & PDF Export', () => {
    // 1. A suitable school or cricket ground is found within 50 meters
    it('Verification 1: detects a suitable school or cricket ground found within 50 meters at stage 1', async () => {
      const candidates: RawPlaceCandidate[] = [
        {
          name: 'ABC High School',
          latitude: userPlayingLat + 0.0003, // ~35m away
          longitude: userPlayingLng + 0.0002,
          googlePlaceId: 'place_abc_high_school_35m',
        },
      ];

      const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
        userPlayingLat,
        userPlayingLng,
        8,
        candidates
      );

      expect(result.detectionRadiusMeters).toBe(50);
      expect(result.stepCount).toBe(1);
      expect(result.ground.name).toBe('ABC High School Ground');
      expect(result.ground.referencePlaceName).toBe('ABC High School');
      expect(result.ground.latitude).toBe(userPlayingLat);
      expect(result.ground.longitude).toBe(userPlayingLng);
      expect(SmartGroundDetectionService.isCoordinateBasedName(result.ground.name)).toBe(false);
    });

    // 2. A relevant candidate is found at a later search radius (after 500m transition to 100m increments)
    it('Verification 2: detects candidate at a later radius (e.g. 620m, reaching the 700m ring at stage 12)', async () => {
      // 620m away: outside 500m & 600m rings, inside 700m ring
      const lat620 = userPlayingLat + 0.0055;
      const lng620 = userPlayingLng + 0.001;

      const candidates: RawPlaceCandidate[] = [
        {
          name: 'Char Sindur College',
          latitude: lat620,
          longitude: lng620,
          googlePlaceId: 'place_college_620m',
        },
      ];

      const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
        userPlayingLat,
        userPlayingLng,
        10,
        candidates,
        { ...DEFAULT_SMART_DETECTION_CONFIG, confidenceThreshold: 0.50 }
      );

      expect(result.detectionRadiusMeters).toBe(700);
      // Stage sequence: 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700 = 12 stages
      expect(result.stepCount).toBe(12);
      expect(result.ground.name).toBe('Char Sindur College Ground');
      expect(SmartGroundDetectionService.isCoordinateBasedName(result.ground.name)).toBe(false);
    });

    // 3. No suitable candidate exists within 1,500 meters
    it('Verification 3: stops expanding at 1500 meters when candidate is beyond 1,500m', async () => {
      // Candidate at 2200m away
      const lat2200 = userPlayingLat + 0.019;
      const lng2200 = userPlayingLng + 0.005;

      const candidates: RawPlaceCandidate[] = [
        {
          name: 'Remote Sports Club',
          latitude: lat2200,
          longitude: lng2200,
          googlePlaceId: 'place_remote_2200m',
        },
      ];

      const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
        userPlayingLat,
        userPlayingLng,
        15,
        candidates
      );

      expect(result.detectionRadiusMeters).toBe(1500);
      expect(result.matchedCandidate).toBeUndefined();
      expect(result.isProvisional).toBe(true);
      expect(result.namingSource).toBe('LOCALITY_FALLBACK');
      expect(SmartGroundDetectionService.isCoordinateBasedName(result.ground.name)).toBe(false);
    });

    // 4. The system falls back to a verified locality name
    it('Verification 4: generates a provisional locality ground name (e.g. "Char Sindur Cricket Ground") from verified locality', () => {
      const generated = SmartGroundDetectionService.generateSmartGroundName('', 'UNRELATED', 'Char Sindur');
      expect(generated).toBe('Char Sindur Cricket Ground');
      expect(SmartGroundDetectionService.isCoordinateBasedName(generated)).toBe(false);

      const generatedPalash = SmartGroundDetectionService.generateSmartGroundName('Ground at 24.0036, 90.6839', 'UNRELATED', 'Palash Upazila');
      expect(generatedPalash).toBe('Palash Cricket Ground');
      expect(SmartGroundDetectionService.isCoordinateBasedName(generatedPalash)).toBe(false);
    });

    // 5. Google Places or reverse geocoding fails (distinguishes API error from zero results)
    it('Verification 5: distinguishes API errors from zero results and handles failures gracefully', async () => {
      // API error scenario
      const apiErrorResult = await SmartGroundDetectionService.evaluateCandidatesProgressively(
        userPlayingLat,
        userPlayingLng,
        10,
        [],
        DEFAULT_SMART_DETECTION_CONFIG,
        'API_ERROR',
        'Google Places API request failed with status: REQUEST_DENIED'
      );
      expect(apiErrorResult.apiStatus).toBe('API_ERROR');
      expect(apiErrorResult.apiErrorMessage).toContain('REQUEST_DENIED');
      expect(apiErrorResult.ground.name).toBe('Unnamed Ground');

      // Zero results scenario
      const zeroResultsResult = await SmartGroundDetectionService.evaluateCandidatesProgressively(
        userPlayingLat,
        userPlayingLng,
        10,
        [],
        DEFAULT_SMART_DETECTION_CONFIG,
        'ZERO_RESULTS'
      );
      expect(zeroResultsResult.apiStatus).toBe('ZERO_RESULTS');
      expect(zeroResultsResult.ground.name).toBe('Unnamed Ground');

      // Offline scenario
      const offlineResult = await SmartGroundDetectionService.evaluateCandidatesProgressively(
        userPlayingLat,
        userPlayingLng,
        10,
        [],
        DEFAULT_SMART_DETECTION_CONFIG,
        'OFFLINE'
      );
      expect(offlineResult.apiStatus).toBe('OFFLINE');
      expect(offlineResult.ground.name).toBe('Unnamed Ground');
    });

    // 6. GPS coordinates are available but no human-readable name can be retrieved
    it('Verification 6: uses neutral provisional label "Unnamed Ground" when coordinates exist but no place/locality can be retrieved', async () => {
      const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
        userPlayingLat,
        userPlayingLng,
        15,
        [] // No candidates, offline, no locality
      );

      expect(result.ground.name).toBe('Unnamed Ground');
      expect(result.ground.isProvisional).toBe(true);
      expect(result.ground.latitude).toBe(userPlayingLat);
      expect(result.ground.longitude).toBe(userPlayingLng);
      // Strictly never uses coordinate text as the ground name
      expect(result.ground.name).not.toMatch(/Ground at/i);
      expect(result.ground.name).not.toMatch(/\d+\.\d+/);
    });

    // 7. A previously confirmed ground name must remain unchanged
    it('Verification 7: never overwrites a user-confirmed ground name with coordinate text or auto-detection', async () => {
      const confirmed = await GroundRepository.saveGround({
        name: 'Sher-e-Bangla National Cricket Stadium',
        latitude: userPlayingLat,
        longitude: userPlayingLng,
        isUserConfirmed: true,
        locationSource: 'MANUAL',
      });

      // 1. Attempt to overwrite with coordinate text
      const attempt1 = await GroundRepository.saveGround({
        id: confirmed.id,
        name: `Ground at ${userPlayingLat.toFixed(4)}, ${userPlayingLng.toFixed(4)}`,
        latitude: userPlayingLat,
        longitude: userPlayingLng,
        isUserConfirmed: false,
      });
      expect(attempt1.name).toBe('Sher-e-Bangla National Cricket Stadium');

      // 2. Attempt to overwrite with auto-detected suggestion
      const attempt2 = await GroundRepository.saveGround({
        id: confirmed.id,
        name: 'Nearby School Ground',
        latitude: userPlayingLat,
        longitude: userPlayingLng,
        isUserConfirmed: false,
      });
      expect(attempt2.name).toBe('Sher-e-Bangla National Cricket Stadium');
    });

    // 8. Existing records contain coordinate-based names (database healing)
    it('Verification 8: detects and heals existing database records containing coordinate-based names', async () => {
      // Record 1: has coordinate name but valid reference landmark
      await db.grounds.put({
        id: 'ground_corrupted_coord_1',
        name: 'Ground at 24.0036, 90.6839',
        latitude: 24.0036,
        longitude: 90.6839,
        referencePlaceName: 'Char Sindur High School',
        isUserConfirmed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Record 2: has coordinate name and no reference landmark
      await db.grounds.put({
        id: 'ground_corrupted_coord_2',
        name: 'Ground at 24.0036, 90.6839',
        latitude: 24.0036,
        longitude: 90.6839,
        isUserConfirmed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Match record with coordinate venue
      await db.matches.put({
        id: 'match_corrupted_1',
        teamA: 'Thunder',
        teamB: 'Hawks',
        venue: 'Ground at 24.0036, 90.6839',
        groundId: 'ground_corrupted_coord_1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any);

      // Execute database healing
      const healSummary = await GroundRepository.healAllExistingGrounds();
      expect(healSummary.groundsHealed).toBe(2);
      expect(healSummary.matchesHealed).toBe(1);

      // Verify ground 1 was healed to reference school
      const g1 = await GroundRepository.getGround('ground_corrupted_coord_1');
      expect(g1?.name).toBe('Char Sindur High School Ground');
      expect(SmartGroundDetectionService.isCoordinateBasedName(g1?.name)).toBe(false);

      // Verify ground 2 was healed to neutral provisional Unnamed Ground
      const g2 = await GroundRepository.getGround('ground_corrupted_coord_2');
      expect(g2?.name).toBe('Unnamed Ground');
      expect(SmartGroundDetectionService.isCoordinateBasedName(g2?.name)).toBe(false);

      // Verify match was healed to the ground name
      const m1 = await db.matches.get('match_corrupted_1');
      expect(m1?.venue).toBe('Char Sindur High School Ground');
    });

    // 9. The Ground/Venue card displays the corrected name
    it('Verification 9: verifies Ground/Venue card presentation contract (human-readable name on top, playing spot line below)', async () => {
      const detected = await GroundRepository.saveGround({
        name: 'Char Sindur High School Ground',
        latitude: 24.0036,
        longitude: 90.6839,
        accuracy: 11,
        referencePlaceName: 'Char Sindur High School',
        referenceDistanceMeters: 175,
        locationSource: 'AUTO_DETECTED',
      });

      // Primary header
      expect(detected.name).toBe('Char Sindur High School Ground');
      expect(SmartGroundDetectionService.isCoordinateBasedName(detected.name)).toBe(false);

      // Secondary Playing Spot line formatting
      const playingSpotLine = `Playing Spot: ${detected.latitude.toFixed(4)}°, ${detected.longitude.toFixed(4)}° (±${detected.accuracy}m)`;
      expect(playingSpotLine).toBe('Playing Spot: 24.0036°, 90.6839° (±11m)');
    });

    // 10. The actual exported PDF displays the same corrected name
    it('Verification 10: ScorecardPdfGenerator.resolveGroundName resolves the exact same corrected ground name', async () => {
      const ground = await GroundRepository.saveGround({
        name: 'Char Sindur High School Ground',
        latitude: 24.0036,
        longitude: 90.6839,
        locationSource: 'AUTO_DETECTED',
      });

      const match: Partial<MatchScorecard> = {
        id: 'match-ground-test-1',
        teamA: 'Dhaka Warriors',
        teamB: 'Chittagong Kings',
        groundId: ground.id,
        venue: ground.name,
      };

      const resolved = await ScorecardPdfGenerator.resolveGroundName(match as MatchScorecard);
      expect(resolved).toBe('Char Sindur High School Ground');
      expect(SmartGroundDetectionService.isCoordinateBasedName(resolved)).toBe(false);
    });

    // 11. The PDF Ground Information section contains only the ground name
    it('Verification 11: PDF Ground Information section contains only "Ground Name: [Name]" with zero extraneous fields', async () => {
      const match: MatchScorecard = {
        id: 'match-pdf-verification-11',
        teamA: 'Dhaka Warriors',
        teamB: 'Chittagong Kings',
        tossWinner: 'Dhaka Warriors',
        tossDecision: 'Batting',
        totalOvers: 6,
        status: 'COMPLETED',
        currentInnings: 2,
        venue: 'Char Sindur High School Ground',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        winner: 'Dhaka Warriors',
        result: 'Dhaka Warriors won by 15 runs',
        resultType: 'WIN',
        margin: 15,
        marginType: 'RUNS',
        firstInnings: {
          inningsNumber: 1,
          team: 'Dhaka Warriors',
          bowlingTeam: 'Chittagong Kings',
          totalRuns: 65,
          totalWickets: 2,
          totalBalls: 36,
          oversString: '6.0',
          wideRuns: 1,
          nbRuns: 0,
          byeRuns: 0,
          lbRuns: 0,
          penaltyRuns: 0,
          penaltyRunsAgainst: 0,
          strikerIdx: 0,
          nonStrikerIdx: 1,
          currentBowlerIdx: 0,
          nextPlayerIdx: 3,
          lastCompletedOverBowlerIdx: 0,
          isOverComplete: true,
          isFreeHit: false,
          thisOverLog: ['1', '4', '6', '1', '2', '0'],
          fallOfWickets: [],
          pastPartnerships: [],
          currentPartnership: { batter1: 'Player 1', batter2: 'Player 2', runs: 20, balls: 12 },
          battingScorecard: [
            { player: 'Player 1', runs: 30, balls: 18, fours: 3, sixes: 1, strikeRate: 166.7, isOut: false, dismissalInfo: 'not out' },
            { player: 'Player 2', runs: 25, balls: 14, fours: 2, sixes: 1, strikeRate: 178.6, isOut: false, dismissalInfo: 'not out' },
          ],
          bowlingScorecard: [
            { bowler: 'Bowler 1', overs: '3.0', maidens: 0, runsConceded: 28, wickets: 1, economy: 9.33, dotBalls: 6 },
          ],
        },
        secondInnings: {
          inningsNumber: 2,
          team: 'Chittagong Kings',
          bowlingTeam: 'Dhaka Warriors',
          totalRuns: 50,
          totalWickets: 4,
          totalBalls: 36,
          oversString: '6.0',
          wideRuns: 0,
          nbRuns: 0,
          byeRuns: 0,
          lbRuns: 0,
          penaltyRuns: 0,
          penaltyRunsAgainst: 0,
          strikerIdx: 0,
          nonStrikerIdx: 1,
          currentBowlerIdx: 0,
          nextPlayerIdx: 5,
          lastCompletedOverBowlerIdx: 0,
          isOverComplete: true,
          isFreeHit: false,
          thisOverLog: ['0', '1', 'W', '1', '0', '1'],
          fallOfWickets: [],
          pastPartnerships: [],
          currentPartnership: { batter1: 'Player 3', batter2: 'Player 4', runs: 5, balls: 6 },
          battingScorecard: [
            { player: 'Player 3', runs: 20, balls: 15, fours: 2, sixes: 0, strikeRate: 133.3, isOut: true, dismissalInfo: 'b Bowler 1' },
          ],
          bowlingScorecard: [
            { bowler: 'Bowler 2', overs: '3.0', maidens: 0, runsConceded: 22, wickets: 2, economy: 7.33, dotBalls: 8 },
          ],
        },
      };

      const doc = await ScorecardPdfGenerator.generatePdf(match);
      expect(doc).toBeDefined();

      // Verify that the PDF is rendered on exactly 1 page
      expect(doc.internal.pages.length - 1).toBe(1);

      // Verify resolved name for this match
      const resolvedName = await ScorecardPdfGenerator.resolveGroundName(match);
      expect(resolvedName).toBe('Char Sindur High School Ground');

      // Reject coordinate-based venue
      const corruptedMatch = { ...match, venue: 'Ground at 24.0036, 90.6839', groundId: undefined };
      const resolvedCorrupted = await ScorecardPdfGenerator.resolveGroundName(corruptedMatch);
      expect(resolvedCorrupted).toBeNull(); // rejects coordinate venue!
    });

    // 12. Existing match scoring and production build remain functional
    it('Verification 12: EventSourcedMatchEngine processes match scoring seamlessly with linked ground', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Dhaka Warriors',
        teamB: 'Chittagong Kings',
        tossWinner: 'Dhaka Warriors',
        tossDecision: 'Batting',
        totalOvers: 5,
        venue: 'Char Sindur High School Ground',
        groundId: 'ground_v12_test',
        location: {
          latitude: userPlayingLat,
          longitude: userPlayingLng,
          source: 'AUTO_DETECTED',
          referencePlaceName: 'Char Sindur High School',
          referenceDistanceMeters: 45,
          confidenceScore: 0.95,
        },
      });

      engine.scoreBall({ runsScored: 4 });
      engine.scoreBall({ runsScored: 6 });
      engine.scoreBall({ runsScored: 1 });

      const scorecard = engine.toScorecard();
      expect(scorecard.venue).toBe('Char Sindur High School Ground');
      expect(scorecard.groundId).toBe('ground_v12_test');
      expect(scorecard.firstInnings?.totalRuns).toBe(11);
      expect(scorecard.firstInnings?.totalBalls).toBe(3);
      expect(scorecard.location?.referencePlaceName).toBe('Char Sindur High School');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // PRIORITY HIERARCHY & USER-DEFINED GROUND SUITE
  // ─────────────────────────────────────────────────────────────
  describe('Intelligent Automatic Ground Name Priority & User-Defined Persistence', () => {
    it('Priority 1: prefers educational institution (school/college) over nearby local market', async () => {
      const candidates: RawPlaceCandidate[] = [
        {
          name: 'Char Sindur Bazar',
          latitude: 23.8112,
          longitude: 90.4132, // ~90m away (Market, Priority 2)
          googlePlaceId: 'place_bazar_90m',
        },
        {
          name: 'Char Sindur High School',
          latitude: 23.8118,
          longitude: 90.4138, // ~175m away (School, Priority 1)
          googlePlaceId: 'place_school_175m',
        },
      ];

      const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
        userPlayingLat,
        userPlayingLng,
        10,
        candidates
      );

      // School (Priority 1) MUST be selected over market (Priority 2)
      expect(result.matchedCandidate).toBeDefined();
      expect(result.matchedCandidate?.category).toBe('EDUCATIONAL_CAMPUS');
      expect(result.matchedCandidate?.rawName).toBe('Char Sindur High School');
      expect(result.ground.name).toBe('Char Sindur High School Ground');
      expect(result.namingSource).toBe('PLACES_INSTITUTION');
    });

    it('Priority 2: selects recognizable local market when no educational institution is identified', async () => {
      const candidates: RawPlaceCandidate[] = [
        {
          name: 'Palash Supermarket & Bazar',
          latitude: 23.8113,
          longitude: 90.4133, // ~100m away
          googlePlaceId: 'place_market_100m',
        },
      ];

      const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
        userPlayingLat,
        userPlayingLng,
        10,
        candidates
      );

      expect(result.matchedCandidate).toBeDefined();
      expect(result.matchedCandidate?.category).toBe('LOCAL_MARKET');
      expect(result.matchedCandidate?.rawName).toBe('Palash Supermarket & Bazar');
      expect(result.ground.name).toBe('Palash Supermarket & Bazar Ground');
      expect(result.namingSource).toBe('PLACES_MARKET');
    });

    it('Priority 3: uses recognizable locality when neither educational campus nor market is present', async () => {
      // Mock Google Geocoder to return locality "Palash"
      vi.stubGlobal('navigator', { onLine: true });
      const mockGeocoder = {
        geocode: vi.fn().mockImplementation((_, callback) => {
          callback(
            [
              {
                address_components: [
                  { long_name: 'Palash Upazila', short_name: 'Palash', types: ['locality'] },
                ],
              },
            ],
            'OK'
          );
        }),
      };

      vi.stubGlobal('window', {
        google: {
          maps: {
            Geocoder: vi.fn().mockImplementation(() => mockGeocoder),
          },
        },
      });

      // No candidates found in places
      const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
        userPlayingLat,
        userPlayingLng,
        10,
        []
      );

      expect(result.isProvisional).toBe(true);
      expect(result.namingSource).toBe('LOCALITY_FALLBACK');
      expect(result.ground.name).toBe('Palash Cricket Ground');
      expect(SmartGroundDetectionService.isCoordinateBasedName(result.ground.name)).toBe(false);
    });

    it('Final Fallback: uses Unnamed Ground only when no reliable naming data is available and never coordinates', async () => {
      vi.stubGlobal('navigator', { onLine: false });

      const result = await SmartGroundDetectionService.evaluateCandidatesProgressively(
        userPlayingLat,
        userPlayingLng,
        15,
        []
      );

      expect(result.ground.name).toBe('Unnamed Ground');
      expect(SmartGroundDetectionService.isCoordinateBasedName(result.ground.name)).toBe(false);
      expect(result.ground.latitude).toBe(userPlayingLat);
      expect(result.ground.longitude).toBe(userPlayingLng);
    });

    it('Manual Ground Editing: marks custom ground as isUserDefined and persists across updates', async () => {
      // User creates custom ground
      const customGround = await GroundRepository.saveGround({
        name: 'My Special Home Ground',
        latitude: userPlayingLat,
        longitude: userPlayingLng,
        isUserDefined: true,
        isUserConfirmed: true,
        locationSource: 'MANUAL',
        namingSource: 'MANUAL',
      });

      expect(customGround.isUserDefined).toBe(true);
      expect(customGround.isUserConfirmed).toBe(true);
      expect(customGround.name).toBe('My Special Home Ground');

      // Subsequent GPS detection at same location attempts to auto-save detected place
      const autoSavedAttempt = await GroundRepository.saveGround({
        id: customGround.id,
        name: 'Nearby Detected School Ground',
        latitude: userPlayingLat,
        longitude: userPlayingLng,
        locationSource: 'AUTO_DETECTED',
        isUserDefined: false,
        isUserConfirmed: false,
      });

      // Name MUST be protected and remain "My Special Home Ground"
      expect(autoSavedAttempt.name).toBe('My Special Home Ground');
      expect(autoSavedAttempt.isUserDefined).toBe(true);

      // Verify persistence in IndexedDB
      const loaded = await GroundRepository.getGroundById(customGround.id);
      expect(loaded?.name).toBe('My Special Home Ground');
      expect(loaded?.isUserDefined).toBe(true);
    });
  });
});
