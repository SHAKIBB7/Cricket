import { CricketGround, LocationSource, NamingSource } from '@/domain/cricket/types';
import { GroundRepository } from '../storage/GroundRepository';
import { AutoGpsLocationService } from '../gps/AutoGpsLocationService';
import { GoogleMapsLoaderService } from './GoogleMapsLoaderService';

export type PlaceCategory =
  | 'CRICKET_STADIUM'
  | 'SPORTS_FACILITY'
  | 'EDUCATIONAL_CAMPUS'
  | 'PARK_RECREATIONAL'
  | 'UNRELATED';

export interface RawPlaceCandidate {
  name: string;
  latitude: number;
  longitude: number;
  googlePlaceId?: string;
  address?: string;
  types?: string[];
  isSaved?: boolean;
  savedGroundId?: string;
}

export interface EvaluatedCandidate {
  rawName: string;
  suggestedGroundName: string;
  category: PlaceCategory;
  categoryRelevance: number;
  latitude: number;
  longitude: number;
  googlePlaceId?: string;
  address?: string;
  distanceMeters: number;
  confidenceScore: number;
  isSaved: boolean;
  savedGroundId?: string;
  namingSource: NamingSource;
}

export interface SmartDetectionConfig {
  initialRadiusMeters: number; // default 100m
  stepMeters: number; // default 100m
  maxRadiusMeters: number; // default 1500m
  confidenceThreshold: number; // default 0.60
  dbProximityThresholdMeters: number; // default 100m
  allowLocalityFallback: boolean; // default true
}

export interface SmartDetectionResult {
  ground: CricketGround;
  candidates: EvaluatedCandidate[];
  matchedCandidate?: EvaluatedCandidate;
  detectionRadiusMeters: number;
  stepCount: number;
  namingSource: NamingSource;
  confidenceScore: number;
  isProvisional: boolean;
  isConfirmedDbMatch: boolean;
  hasAmbiguity: boolean;
  alternativeCandidates: EvaluatedCandidate[];
  localityName?: string;
  diagnosticMessage: string;
}

export const DEFAULT_SMART_DETECTION_CONFIG: SmartDetectionConfig = {
  initialRadiusMeters: 100,
  stepMeters: 100,
  maxRadiusMeters: 1500,
  confidenceThreshold: 0.6,
  dbProximityThresholdMeters: 100,
  allowLocalityFallback: true,
};

export class SmartGroundDetectionService {
  /**
   * Validates whether a name is genuine, readable English alphabetic text.
   * Strictly rejects pure numeric codes ("1", "2", "3"), list numbering ("1.", "2."),
   * pure coordinates, database IDs, and Google Places resource paths.
   */
  static isReadableAlphabeticName(name: unknown): boolean {
    if (typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (!trimmed) return false;

    // Must not be purely digits, dots, hashes, hyphens, colons, or punctuation (e.g. "1", "2", "3", "1.", "2.", "#1")
    if (/^[\d\s\.\-_#:,()]+$/.test(trimmed)) return false;

    // Must not be an API resource path (e.g. "places/ChIJ..." or "places/12345")
    if (/^places\/[a-zA-Z0-9_\-]+$/i.test(trimmed)) return false;

    // Must not be an internal ID or Place ID (e.g. "ground_1729...", "ChIJaXQ...")
    if (/^(ground_\d+|ChIJ[a-zA-Z0-9_\-]{15,}|place_[a-zA-Z0-9_\-]{15,})/i.test(trimmed)) return false;

    // Must contain at least two alphabetic letters ([a-zA-Z])
    const letters = trimmed.match(/[a-zA-Z]/g);
    if (!letters || letters.length < 2) return false;

    // Must not be just a generic ward / sector number like "Ward 1" or "Sector 2" or "Plot 5"
    if (/^(ward|sector|block|road|lane|plot|holding)\s*#?\s*\d+$/i.test(trimmed)) return false;

    return true;
  }

  /**
   * Safely extracts the actual human-readable alphabetic place name from Google Places API results,
   * supporting both Google Places API (New) (`displayName.text`) and Classic Places API (`name`).
   * Never extracts numeric codes, array indices, or resource paths.
   */
  static extractReadablePlaceName(r: any): string | null {
    if (!r) return null;

    // 1. Google Places API (New): displayName.text (or displayName as string)
    if (r.displayName && typeof r.displayName === 'object') {
      const text = r.displayName.text || r.displayName.name;
      if (typeof text === 'string' && this.isReadableAlphabeticName(text)) {
        return text.trim();
      }
    } else if (typeof r.displayName === 'string' && this.isReadableAlphabeticName(r.displayName)) {
      return r.displayName.trim();
    }

    // 2. Classic Places API: r.name
    if (typeof r.name === 'string' && this.isReadableAlphabeticName(r.name)) {
      return r.name.trim();
    }

    // 3. Fallback to vicinity or formatted_address first segment if it is a readable establishment name
    if (typeof r.vicinity === 'string' && this.isReadableAlphabeticName(r.vicinity)) {
      const firstSegment = r.vicinity.split(',')[0].trim();
      if (this.isReadableAlphabeticName(firstSegment)) {
        return firstSegment;
      }
    }

    return null;
  }

  /**
   * Cleans administrative suffixes from locality names to form natural cricket ground names
   * (e.g. "Palash Upazila" -> "Palash", "Narsingdi District" -> "Narsingdi").
   */
  static sanitizeLocalityName(locality: string): string {
    const trimmed = (locality || '').trim();
    const cleaned = trimmed
      .replace(/\s+(area|upazila|thana|district|division|subdistrict|municipality|city|town)$/i, '')
      .trim();
    return cleaned || trimmed;
  }

  /**
   * Classifies a place into cricket-specific relevance categories based on keywords and Google Places types.
   */
  static classifyPlace(name: string, types: string[] = []): { category: PlaceCategory; relevance: number } {
    const lowerName = name.toLowerCase();
    const joinedTypes = types.map((t) => t.toLowerCase()).join(' ');

    // 1. Explicit Disqualification / Unrelated commercial, religious, or clinical places
    const unrelatedKeywords = [
      'mosque',
      'masjid',
      'temple',
      'mandir',
      'church',
      'market',
      'bazar',
      'bazaar',
      'supermarket',
      'grocer',
      'store',
      'shop',
      'restaurant',
      'hotel',
      'cafe',
      'bank',
      'atm',
      'hospital',
      'clinic',
      'pharmacy',
      'filling station',
      'petrol pump',
    ];

    const isExplicitSports =
      lowerName.includes('cricket') ||
      lowerName.includes('stadium') ||
      lowerName.includes('sports') ||
      lowerName.includes('ground') ||
      lowerName.includes('oval') ||
      lowerName.includes('pitch') ||
      lowerName.includes('gymkhana') ||
      lowerName.includes('maidan');

    if (!isExplicitSports && unrelatedKeywords.some((w) => lowerName.includes(w))) {
      return { category: 'UNRELATED', relevance: 0.05 };
    }

    // 2. High Relevance: Cricket Stadiums, Cricket Grounds, Explicit Stadiums & Ovals
    if (
      lowerName.includes('cricket') ||
      lowerName.includes('stadium') ||
      lowerName.includes('oval') ||
      joinedTypes.includes('stadium') ||
      lowerName.includes('cricket club') ||
      lowerName.includes('cricket academy')
    ) {
      return { category: 'CRICKET_STADIUM', relevance: 1.0 };
    }

    // 3. Sports Facilities, Sports Grounds, Athletic Complexes
    if (
      lowerName.includes('sports ground') ||
      lowerName.includes('sports complex') ||
      lowerName.includes('sports club') ||
      lowerName.includes('gymkhana') ||
      lowerName.includes('athletic') ||
      lowerName.includes('maidan') ||
      lowerName.includes('field') ||
      lowerName.includes('pitch')
    ) {
      return { category: 'SPORTS_FACILITY', relevance: 0.9 };
    }

    // 4. Educational Campuses (Schools, Colleges, Universities, Madrasas)
    if (
      lowerName.includes('school') ||
      lowerName.includes('high school') ||
      lowerName.includes('college') ||
      lowerName.includes('university') ||
      lowerName.includes('madrasa') ||
      lowerName.includes('academy') ||
      lowerName.includes('vidyalaya') ||
      joinedTypes.includes('school') ||
      joinedTypes.includes('university')
    ) {
      return { category: 'EDUCATIONAL_CAMPUS', relevance: 0.8 };
    }

    // 5. Parks, Playgrounds, and Open Recreational Spaces
    if (
      lowerName.includes('park') ||
      lowerName.includes('playground') ||
      lowerName.includes('recreation') ||
      joinedTypes.includes('park')
    ) {
      return { category: 'PARK_RECREATIONAL', relevance: 0.65 };
    }

    // Default neutral/unidentified
    return { category: 'UNRELATED', relevance: 0.1 };
  }

  /**
   * Generates a readable cricket venue name based on candidate place and category.
   * Guarantees readable English alphabetic text, e.g. "Char Sindur High School Ground",
   * "Palash Cricket Ground", or "Local Cricket Ground".
   */
  static generateSmartGroundName(rawName: string, category: PlaceCategory, locality?: string): string {
    const trimmed = (rawName || '').trim();

    // If candidate name is missing, numeric, or unreadable, fall back to locality or Local Cricket Ground
    if (!this.isReadableAlphabeticName(trimmed)) {
      if (locality && this.isReadableAlphabeticName(locality)) {
        const cleanLocality = this.sanitizeLocalityName(locality);
        const lowerLoc = cleanLocality.toLowerCase();
        if (lowerLoc.includes('cricket') || lowerLoc.includes('ground') || lowerLoc.includes('stadium')) {
          return cleanLocality;
        }
        return `${cleanLocality} Cricket Ground`;
      }
      return 'Local Cricket Ground';
    }

    const lower = trimmed.toLowerCase();

    // If candidate already has cricket/ground keywords, preserve it cleanly
    if (
      lower.includes('cricket') ||
      lower.includes('stadium') ||
      lower.includes('ground') ||
      lower.includes('oval') ||
      lower.includes('complex') ||
      lower.includes('club') ||
      lower.includes('pitch') ||
      lower.includes('playground')
    ) {
      return trimmed;
    }

    // Educational Campus: append "Ground" (e.g. "Char Sindur High School" -> "Char Sindur High School Ground")
    if (category === 'EDUCATIONAL_CAMPUS') {
      return `${trimmed} Ground`;
    }

    // Park or Recreational: append "Ground" if it does not end with Park/Playground
    if (category === 'PARK_RECREATIONAL') {
      return `${trimmed} Ground`;
    }

    // Sports Facility: append "Sports Ground"
    if (category === 'SPORTS_FACILITY') {
      return `${trimmed} Sports Ground`;
    }

    // Unrelated or general place: if valid locality exists, use that; otherwise append "Ground"
    if (locality && this.isReadableAlphabeticName(locality)) {
      const cleanLocality = this.sanitizeLocalityName(locality);
      return `${cleanLocality} Cricket Ground`;
    }

    return `${trimmed} Ground`;
  }

  /**
   * Computes candidate confidence score combining category relevance, progressive distance decay, and GPS accuracy.
   */
  static calculateConfidenceScore(
    categoryRelevance: number,
    distanceMeters: number,
    accuracyMeters?: number
  ): number {
    if (distanceMeters > 1500) return 0;
    if (categoryRelevance < 0.1) return 0.05;

    // Account for GPS accuracy: if accuracy is 20m, candidate at 110m has effective distance ~100m
    const effectiveDistance = Math.max(0, distanceMeters - (accuracyMeters ? accuracyMeters / 2 : 0));

    // Distance decay factor:
    // 0 - 100m: 1.0
    // 100 - 500m: 1.0 down to 0.78
    // 500 - 1000m: 0.78 down to 0.55
    // 1000 - 1500m: 0.55 down to 0.35
    let distanceFactor = 1.0;
    if (effectiveDistance <= 100) {
      distanceFactor = 1.0;
    } else if (effectiveDistance <= 500) {
      distanceFactor = 1.0 - ((effectiveDistance - 100) / 400) * 0.22;
    } else if (effectiveDistance <= 1000) {
      distanceFactor = 0.78 - ((effectiveDistance - 500) / 500) * 0.23;
    } else if (effectiveDistance <= 1500) {
      distanceFactor = 0.55 - ((effectiveDistance - 1000) / 500) * 0.2;
    } else {
      distanceFactor = 0;
    }

    // GPS accuracy penalty factor
    let accuracyFactor = 1.0;
    if (accuracyMeters && accuracyMeters > 500) {
      accuracyFactor = 0.7; // Low accuracy penalty
    } else if (accuracyMeters && accuracyMeters > 200) {
      accuracyFactor = 0.85;
    }

    const confidence = categoryRelevance * distanceFactor * accuracyFactor;
    return Math.max(0.01, Math.min(1.0, Number(confidence.toFixed(2))));
  }

  /**
   * Attempts reverse geocoding to resolve locality / administrative name for provisional fallback.
   */
  static async resolveLocalityName(latitude: number, longitude: number): Promise<string | undefined> {
    if (typeof window === 'undefined' || !navigator.onLine) {
      return undefined;
    }

    try {
      const isLoaded = GoogleMapsLoaderService.isLoaded();
      if (!isLoaded) return undefined;

      const google = (window as any).google;
      if (!google?.maps?.Geocoder) return undefined;

      const geocoder = new google.maps.Geocoder();
      const result: any = await new Promise((resolve) => {
        geocoder.geocode(
          { location: { lat: latitude, lng: longitude } },
          (results: any[] | null, status: string) => {
            if (status === 'OK' && results && results.length > 0) {
              resolve(results[0]);
            } else {
              resolve(null);
            }
          }
        );
      });

      if (!result?.address_components) return undefined;

      // Search address components for locality, sublocality, or administrative area
      const components = result.address_components as Array<{
        long_name: string;
        short_name: string;
        types: string[];
      }>;

      // Priority 1: Primary locality (City, Town, Village, Union name, e.g. "Char Sindur" or "Palash")
      const locality = components.find((c) => c.types.includes('locality'));
      if (locality?.long_name && this.isReadableAlphabeticName(locality.long_name)) {
        return this.sanitizeLocalityName(locality.long_name);
      }

      // Priority 2: Sub-district / Upazila (administrative_area_level_3, e.g. "Palash")
      const admin3 = components.find((c) => c.types.includes('administrative_area_level_3'));
      if (admin3?.long_name && this.isReadableAlphabeticName(admin3.long_name)) {
        return this.sanitizeLocalityName(admin3.long_name);
      }

      // Priority 3: Sublocality or neighborhood ONLY if it is a genuine readable alphabetic name (e.g. "Char Sindur", not "1" or "Ward 1")
      const sublocality = components.find(
        (c) =>
          (c.types.includes('sublocality') ||
            c.types.includes('sublocality_level_1') ||
            c.types.includes('neighborhood')) &&
          this.isReadableAlphabeticName(c.long_name)
      );
      if (sublocality?.long_name) {
        return this.sanitizeLocalityName(sublocality.long_name);
      }

      // Priority 4: District / County (administrative_area_level_2, e.g. "Narsingdi")
      const admin2 = components.find((c) => c.types.includes('administrative_area_level_2'));
      if (admin2?.long_name && this.isReadableAlphabeticName(admin2.long_name)) {
        return this.sanitizeLocalityName(admin2.long_name);
      }

      // Priority 5: Division / State (administrative_area_level_1, e.g. "Dhaka")
      const admin1 = components.find((c) => c.types.includes('administrative_area_level_1'));
      if (admin1?.long_name && this.isReadableAlphabeticName(admin1.long_name)) {
        return this.sanitizeLocalityName(admin1.long_name);
      }
    } catch {
      // Safe fallback
    }

    return undefined;
  }

  /**
   * Main Smart Detection Engine:
   * 1. Check existing confirmed grounds in local database within initial proximity.
   * 2. If no DB match, fetch candidate places up to 1500m (single efficient Places API call).
   * 3. Evaluate candidates progressively through 100m rings (100m -> 200m -> ... -> 1500m).
   * 4. Stop as soon as a candidate meets the confidence threshold.
   * 5. Fallback to locality-based provisional name if no candidate found within 1500m.
   * 6. Strictly keep playing location separate from reference place location.
   */
  static async detectGround(
    playingLat: number,
    playingLng: number,
    gpsAccuracy?: number,
    options: Partial<SmartDetectionConfig> = {}
  ): Promise<SmartDetectionResult> {
    const config: SmartDetectionConfig = {
      ...DEFAULT_SMART_DETECTION_CONFIG,
      ...options,
    };

    // ─────────────────────────────────────────────────────────────
    // STEP 1: Check existing confirmed database records first
    // ─────────────────────────────────────────────────────────────
    try {
      const localNearby = await GroundRepository.findNearbyGrounds(
        playingLat,
        playingLng,
        config.dbProximityThresholdMeters
      );

      if (localNearby.length > 0) {
        // Preferred: highest priority to user-confirmed or previously saved ground
        const bestDbGround = localNearby[0];
        const distance = bestDbGround.distanceMeters;

        const evaluated: EvaluatedCandidate = {
          rawName: bestDbGround.name,
          suggestedGroundName: bestDbGround.name,
          category: 'CRICKET_STADIUM',
          categoryRelevance: 1.0,
          latitude: bestDbGround.latitude,
          longitude: bestDbGround.longitude,
          googlePlaceId: bestDbGround.googlePlaceId,
          address: bestDbGround.address,
          distanceMeters: distance,
          confidenceScore: 0.98,
          isSaved: true,
          savedGroundId: bestDbGround.id,
          namingSource: 'CONFIRMED_DB',
        };

        return {
          ground: bestDbGround,
          candidates: [evaluated],
          matchedCandidate: evaluated,
          detectionRadiusMeters: config.initialRadiusMeters,
          stepCount: 1,
          namingSource: 'CONFIRMED_DB',
          confidenceScore: 0.98,
          isProvisional: false,
          isConfirmedDbMatch: true,
          hasAmbiguity: false,
          alternativeCandidates: [],
          diagnosticMessage: `Matched previously saved ground "${bestDbGround.name}" (${distance}m away) in application database.`,
        };
      }
    } catch (e) {
      console.warn('[SmartGroundDetection] Local DB check note:', e);
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 2: Retrieve candidate places up to max radius (1500m)
    // Single efficient API request (respects API efficiency requirement)
    // ─────────────────────────────────────────────────────────────
    let rawCandidates: RawPlaceCandidate[] = [];

    // Also include any local saved grounds within max radius (e.g. up to 1500m)
    try {
      const broaderLocal = await GroundRepository.findNearbyGrounds(
        playingLat,
        playingLng,
        config.maxRadiusMeters
      );
      for (const bg of broaderLocal) {
        rawCandidates.push({
          name: bg.name,
          latitude: bg.latitude,
          longitude: bg.longitude,
          googlePlaceId: bg.googlePlaceId,
          address: bg.address,
          isSaved: true,
          savedGroundId: bg.id,
        });
      }
    } catch (e) {
      // Ignore
    }

    // If online and Google Maps Places is available, fetch places up to 1500m in ONE call
    if (typeof window !== 'undefined' && navigator.onLine) {
      try {
        let isLoaded = GoogleMapsLoaderService.isLoaded();
        if (!isLoaded && GoogleMapsLoaderService.hasValidKey()) {
          const loadRes = await GoogleMapsLoaderService.load();
          isLoaded = loadRes.success;
        }

        if (isLoaded) {
          const google = (window as any).google;
          if (google?.maps?.places?.PlacesService) {
            const places = await this.fetchPlacesSingleRequest(
              playingLat,
              playingLng,
              config.maxRadiusMeters,
              google
            );
            rawCandidates.push(...places);
          }
        }
      } catch (err) {
        console.warn('[SmartGroundDetection] Places API call note:', err);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 3: Score and rank all candidates
    // ─────────────────────────────────────────────────────────────
    return this.evaluateCandidatesProgressively(
      playingLat,
      playingLng,
      gpsAccuracy,
      rawCandidates,
      config
    );
  }

  /**
   * Deterministic evaluation pipeline used by detectGround and unit tests.
   */
  static async evaluateCandidatesProgressively(
    playingLat: number,
    playingLng: number,
    gpsAccuracy: number | undefined,
    rawCandidates: RawPlaceCandidate[],
    config: SmartDetectionConfig = DEFAULT_SMART_DETECTION_CONFIG
  ): Promise<SmartDetectionResult> {
    const seenPlaceIds = new Set<string>();
    const seenCoords: Array<{ lat: number; lng: number }> = [];

    const evaluatedList: EvaluatedCandidate[] = [];

    for (const raw of rawCandidates) {
      // Discard candidates that have numeric, place-id, or unreadable names
      if (!this.isReadableAlphabeticName(raw.name)) continue;

      if (raw.googlePlaceId && seenPlaceIds.has(raw.googlePlaceId)) continue;
      if (
        !raw.googlePlaceId &&
        seenCoords.some(
          (c) => AutoGpsLocationService.calculateDistanceMeters(raw.latitude, raw.longitude, c.lat, c.lng) < 8
        )
      ) {
        continue;
      }

      if (raw.googlePlaceId) seenPlaceIds.add(raw.googlePlaceId);
      seenCoords.push({ lat: raw.latitude, lng: raw.longitude });

      const distance = AutoGpsLocationService.calculateDistanceMeters(
        playingLat,
        playingLng,
        raw.latitude,
        raw.longitude
      );

      const classification = this.classifyPlace(raw.name, raw.types);
      const suggestedName = this.generateSmartGroundName(raw.name, classification.category);
      const confidence = this.calculateConfidenceScore(
        classification.relevance,
        distance,
        gpsAccuracy
      );

      let namingSource: NamingSource = 'PLACES_CRICKET';
      if (raw.isSaved) {
        namingSource = 'CONFIRMED_DB';
      } else if (classification.category === 'EDUCATIONAL_CAMPUS') {
        namingSource = 'PLACES_INSTITUTION';
      } else if (classification.category === 'PARK_RECREATIONAL') {
        namingSource = 'PLACES_PARK';
      } else if (classification.category === 'CRICKET_STADIUM' || classification.category === 'SPORTS_FACILITY') {
        namingSource = 'PLACES_CRICKET';
      } else {
        namingSource = 'PLACES_CRICKET';
      }

      evaluatedList.push({
        rawName: raw.name,
        suggestedGroundName: suggestedName,
        category: classification.category,
        categoryRelevance: classification.relevance,
        latitude: raw.latitude,
        longitude: raw.longitude,
        googlePlaceId: raw.googlePlaceId,
        address: raw.address,
        distanceMeters: distance,
        confidenceScore: confidence,
        isSaved: Boolean(raw.isSaved),
        savedGroundId: raw.savedGroundId,
        namingSource,
      });
    }

    // Sort all evaluated candidates by distance ascending
    evaluatedList.sort((a, b) => a.distanceMeters - b.distanceMeters);

    // ─────────────────────────────────────────────────────────────
    // STEP 4: Progressive 100m to 1,500m evaluation
    // ─────────────────────────────────────────────────────────────
    let matchedCandidate: EvaluatedCandidate | undefined;
    let matchedRadius = config.maxRadiusMeters;
    let stepCount = 0;

    for (let r = config.initialRadiusMeters; r <= config.maxRadiusMeters; r += config.stepMeters) {
      stepCount++;
      const inRadius = evaluatedList.filter(
        (c) => c.distanceMeters <= r && c.confidenceScore >= config.confidenceThreshold
      );

      if (inRadius.length > 0) {
        // Sort priority in current ring:
        // Priority 1: Confirmed ground in DB
        // Priority 2: Higher confidence score
        // Priority 3: Closer distance
        inRadius.sort((a, b) => {
          if (a.isSaved && !b.isSaved) return -1;
          if (!a.isSaved && b.isSaved) return 1;
          if (Math.abs(b.confidenceScore - a.confidenceScore) > 0.05) {
            return b.confidenceScore - a.confidenceScore;
          }
          return a.distanceMeters - b.distanceMeters;
        });

        matchedCandidate = inRadius[0];
        matchedRadius = r;
        break; // STOP expanding search radius immediately when suitable candidate found!
      }
    }

    // Check for ambiguity (multiple similarly plausible candidates in range)
    let hasAmbiguity = false;
    let alternativeCandidates: EvaluatedCandidate[] = [];

    if (matchedCandidate) {
      alternativeCandidates = evaluatedList.filter(
        (c) =>
          c !== matchedCandidate &&
          c.distanceMeters <= matchedRadius + 100 &&
          c.confidenceScore >= config.confidenceThreshold * 0.8
      );
      if (
        alternativeCandidates.length > 0 &&
        alternativeCandidates.some(
          (alt) => Math.abs(alt.confidenceScore - matchedCandidate!.confidenceScore) <= 0.12
        )
      ) {
        hasAmbiguity = true;
      }

      // Construct confirmed / auto-detected ground
      // Note: Ground coordinates = actual playing coordinates!
      // Reference place coordinates = candidate coordinates!
      const groundId = matchedCandidate.savedGroundId || `ground_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();

      const ground: CricketGround = {
        id: groundId,
        name: matchedCandidate.suggestedGroundName,
        latitude: playingLat, // ACTUAL PLAYING COORDINATES
        longitude: playingLng, // ACTUAL PLAYING COORDINATES
        accuracy: gpsAccuracy,
        locationSource: 'AUTO_DETECTED',
        googlePlaceId: matchedCandidate.googlePlaceId,
        address: matchedCandidate.address,
        referencePlaceId: matchedCandidate.googlePlaceId,
        referencePlaceName: matchedCandidate.rawName,
        referenceLatitude: matchedCandidate.latitude,
        referenceLongitude: matchedCandidate.longitude,
        referenceDistanceMeters: matchedCandidate.distanceMeters,
        isProvisional: false,
        isUserConfirmed: matchedCandidate.isSaved,
        namingSource: matchedCandidate.namingSource,
        confidenceScore: matchedCandidate.confidenceScore,
        detectionRadiusMeters: matchedRadius,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'PENDING',
      };

      return {
        ground,
        candidates: evaluatedList,
        matchedCandidate,
        detectionRadiusMeters: matchedRadius,
        stepCount,
        namingSource: matchedCandidate.namingSource,
        confidenceScore: matchedCandidate.confidenceScore,
        isProvisional: false,
        isConfirmedDbMatch: matchedCandidate.isSaved,
        hasAmbiguity,
        alternativeCandidates,
        diagnosticMessage: `Identified candidate "${matchedCandidate.suggestedGroundName}" at ${matchedCandidate.distanceMeters}m (Ring: ${matchedRadius}m, Confidence: ${Math.round(matchedCandidate.confidenceScore * 100)}%).`,
      };
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 5: Locality-Based Fallback when no ground found within 1500m
    // ─────────────────────────────────────────────────────────────
    const locality = await this.resolveLocalityName(playingLat, playingLng);
    const fallbackName =
      locality && this.isReadableAlphabeticName(locality)
        ? (locality.toLowerCase().includes('cricket') || locality.toLowerCase().includes('ground')
            ? locality
            : `${this.sanitizeLocalityName(locality)} Cricket Ground`)
        : 'Local Cricket Ground';

    const now = new Date().toISOString();
    const fallbackGround: CricketGround = {
      id: `ground_prov_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: fallbackName,
      latitude: playingLat, // ACTUAL PLAYING COORDINATES
      longitude: playingLng, // ACTUAL PLAYING COORDINATES
      accuracy: gpsAccuracy,
      locationSource: 'LOCALITY_FALLBACK',
      address: locality ? `${locality} area` : undefined,
      isProvisional: true,
      isUserConfirmed: false,
      namingSource: 'LOCALITY_FALLBACK',
      confidenceScore: 0.35,
      detectionRadiusMeters: config.maxRadiusMeters,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'PENDING',
    };

    return {
      ground: fallbackGround,
      candidates: evaluatedList,
      detectionRadiusMeters: config.maxRadiusMeters,
      stepCount: Math.ceil((config.maxRadiusMeters - config.initialRadiusMeters) / config.stepMeters) + 1,
      namingSource: 'LOCALITY_FALLBACK',
      confidenceScore: 0.35,
      isProvisional: true,
      isConfirmedDbMatch: false,
      hasAmbiguity: false,
      alternativeCandidates: [],
      localityName: locality,
      diagnosticMessage: `No candidate met confidence threshold within ${config.maxRadiusMeters}m. Applied provisional locality fallback "${fallbackName}".`,
    };
  }

  /**
   * Helper to perform a single Google Places Text Search within maximum radius (1500m).
   */
  private static fetchPlacesSingleRequest(
    lat: number,
    lng: number,
    radius: number,
    google: any
  ): Promise<RawPlaceCandidate[]> {
    return new Promise((resolve) => {
      const dummyDiv = document.createElement('div');
      const service = new google.maps.places.PlacesService(dummyDiv);
      const center = new google.maps.LatLng(lat, lng);

      // Search for cricket grounds, sports complexes, stadiums, schools, and parks
      const request = {
        location: center,
        radius,
        query: 'cricket ground stadium sports ground school park playground',
      };

      service.textSearch(request, (results: any[] | null, status: any) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
          const parsed: RawPlaceCandidate[] = [];
          for (const r of results.slice(0, 20)) {
            const readableName = SmartGroundDetectionService.extractReadablePlaceName(r);
            if (!readableName) continue; // Discard places without human-readable alphabetic name

            parsed.push({
              name: readableName,
              latitude: Number(r.geometry?.location?.lat()?.toFixed(6)) || lat,
              longitude: Number(r.geometry?.location?.lng()?.toFixed(6)) || lng,
              googlePlaceId: r.place_id || r.id,
              address: r.formatted_address || r.formattedAddress || '',
              types: r.types || [],
            });
          }
          resolve(parsed);
        } else {
          resolve([]);
        }
      });
    });
  }
}
