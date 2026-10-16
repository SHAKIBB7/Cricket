import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SmartGroundDetectionService,
  RawPlaceCandidate,
  DEFAULT_SMART_DETECTION_CONFIG,
} from '../infrastructure/maps/SmartGroundDetectionService';
import { GroundRepository } from '../infrastructure/storage/GroundRepository';
import { AutoGpsLocationService, GpsLocationServiceError } from '../infrastructure/gps/AutoGpsLocationService';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';
import { db } from '../infrastructure/database/dexie-db';

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
    expect(result.detectionRadiusMeters).toBe(100);
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
    expect(result.stepCount).toBe(1);
    expect(result.confidenceScore).toBeGreaterThanOrEqual(0.8);
    // Playing location is strictly preserved
    expect(result.ground.latitude).toBe(userPlayingLat);
    expect(result.ground.longitude).toBe(userPlayingLng);
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 3: Suitable ground exists within 200m but not within 100m
  // ─────────────────────────────────────────────────────────────
  it('Scenario 3: expands from 100m to 200m and selects candidate at the 200m increment', async () => {
    const candidates: RawPlaceCandidate[] = [
      {
        name: 'Palash High School',
        latitude: 23.8118,
        longitude: 90.4138, // ~175m away (outside 100m, inside 200m)
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
    expect(result.stepCount).toBe(2);
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
        longitude: 90.4145, // ~475m away (outside 400m, inside 500m)
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
    expect(result.stepCount).toBe(5);
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
    expect(result.ground.name).toContain('Local Cricket Ground');
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
    expect(result.ground.name).toBe('Local Cricket Ground');
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

    it('generates Local Cricket Ground when candidate name is missing or numeric and locality is absent', () => {
      expect(SmartGroundDetectionService.generateSmartGroundName('1', 'UNRELATED')).toBe('Local Cricket Ground');
      expect(SmartGroundDetectionService.generateSmartGroundName('1.', 'UNRELATED')).toBe('Local Cricket Ground');
      expect(SmartGroundDetectionService.generateSmartGroundName('', 'UNRELATED')).toBe('Local Cricket Ground');
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
});
