import { db } from '../database/dexie-db';
import { CricketGround, MatchScorecard, LocationSource, NamingSource } from '@/domain/cricket/types';
import { SyncEngine } from '../sync/SyncEngine';
import { SmartGroundDetectionService } from '../maps/SmartGroundDetectionService';

export interface GroundInput {
  id?: string;
  name: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  locationSource?: LocationSource;
  googlePlaceId?: string;
  address?: string;
  syncStatus?: 'SYNCED' | 'PENDING' | 'LOCAL_ONLY';

  // Smart Detection & Coordinate Separation
  referencePlaceId?: string;
  referencePlaceName?: string;
  referenceLatitude?: number;
  referenceLongitude?: number;
  referenceDistanceMeters?: number;
  isProvisional?: boolean;
  isUserConfirmed?: boolean;
  isUserDefined?: boolean;
  namingSource?: NamingSource;
  confidenceScore?: number;
  detectionRadiusMeters?: number;
}

export interface GroundStats {
  groundId: string;
  totalMatches: number;
  mostRecentMatchDate: string | null;
  matches: MatchScorecard[];
}

export class GroundRepository {
  /**
   * Validates ground input data according to geographic and domain rules.
   */
  static validateGroundInput(input: GroundInput): void {
    if (!input.name || !input.name.trim()) {
      throw new Error('Ground name is required and cannot be empty.');
    }
    if (typeof input.latitude !== 'number' || isNaN(input.latitude) || input.latitude < -90 || input.latitude > 90) {
      throw new Error(`Invalid latitude: ${input.latitude}. Must be a valid number between -90 and 90.`);
    }
    if (typeof input.longitude !== 'number' || isNaN(input.longitude) || input.longitude < -180 || input.longitude > 180) {
      throw new Error(`Invalid longitude: ${input.longitude}. Must be a valid number between -180 and 180.`);
    }
  }

  /**
   * Checks whether two geographic coordinate pairs are close to identical (within ~50 meters).
   */
  static areCoordinatesVirtuallyIdentical(lat1: number, lng1: number, lat2: number, lng2: number): boolean {
    const threshold = 0.0005; // approx 55 meters
    return Math.abs(lat1 - lat2) < threshold && Math.abs(lng1 - lng2) < threshold;
  }

  /**
   * Searches for an existing duplicate ground to prevent duplicate marker proliferation:
   * 1. By Google Place ID if provided
   * 2. By matching normalized name AND virtually identical coordinates for custom grounds
   * Never merges grounds solely because they share a common name.
   */
  static async findExistingDuplicate(input: GroundInput): Promise<CricketGround | undefined> {
    const allGrounds = await db.grounds.toArray();

    // 1. Google Place ID match
    if (input.googlePlaceId && input.googlePlaceId.trim()) {
      const matchByPlaceId = allGrounds.find(
        (g) => g.googlePlaceId && g.googlePlaceId.trim() === input.googlePlaceId!.trim()
      );
      if (matchByPlaceId) return matchByPlaceId;
    }

    // 2. Custom ground match: exact same normalized name AND matching coordinates
    const normalizedName = input.name.trim().toLowerCase();
    const matchByProximityAndName = allGrounds.find((g) => {
      const existingName = g.name.trim().toLowerCase();
      if (existingName !== normalizedName) return false;
      return this.areCoordinatesVirtuallyIdentical(g.latitude, g.longitude, input.latitude, input.longitude);
    });

    return matchByProximityAndName;
  }

  /**
   * Validates and repairs ground records that contain incorrect numeric or coordinate-based names
   * (e.g. "Ground at 24.0036, 90.6839", "24.0036, 90.6839", "1", "ground_12345"),
   * recovering the human-readable alphabetic name from reference landmarks or locality.
   * Protects user-confirmed and valid names from modification.
   */
  static sanitizeGroundRecord(ground: CricketGround): CricketGround {
    const isCoord = SmartGroundDetectionService.isCoordinateBasedName(ground.name);
    const isAlpha = SmartGroundDetectionService.isReadableAlphabeticName(ground.name);

    if (!isCoord && isAlpha) {
      return ground;
    }

    // Attempt to recover readable alphabetic name
    let recoveredName = 'Unnamed Ground';
    let isProvisional = true;

    if (
      ground.referencePlaceName &&
      SmartGroundDetectionService.isReadableAlphabeticName(ground.referencePlaceName) &&
      !SmartGroundDetectionService.isCoordinateBasedName(ground.referencePlaceName)
    ) {
      recoveredName = SmartGroundDetectionService.generateSmartGroundName(
        ground.referencePlaceName,
        'EDUCATIONAL_CAMPUS'
      );
      isProvisional = false;
    } else if (
      ground.address &&
      SmartGroundDetectionService.isReadableAlphabeticName(ground.address) &&
      !SmartGroundDetectionService.isCoordinateBasedName(ground.address)
    ) {
      const parts = ground.address.split(',').map((p) => p.trim());
      const validPart = parts.find(
        (p) =>
          SmartGroundDetectionService.isReadableAlphabeticName(p) &&
          !SmartGroundDetectionService.isCoordinateBasedName(p) &&
          !/^\d+/.test(p)
      );
      if (validPart) {
        const cleanLocality = SmartGroundDetectionService.sanitizeLocalityName(validPart);
        recoveredName = `${cleanLocality} Cricket Ground`;
        isProvisional = true;
      }
    }

    const isConfirmed = Boolean(ground.isUserConfirmed || ground.isUserDefined);
    const healed: CricketGround = {
      ...ground,
      name: recoveredName,
      isProvisional: isConfirmed && !isCoord ? false : isProvisional,
      isUserConfirmed: isConfirmed,
      isUserDefined: isConfirmed,
      updatedAt: new Date().toISOString(),
    };

    // Asynchronously heal in background so future reads from Dexie are clean
    db.grounds.put(healed).catch(() => {});
    return healed;
  }

  /**
   * Saves or updates a cricket ground with deduplication and durable offline persistence.
   */
  static async saveGround(input: GroundInput): Promise<CricketGround> {
    this.validateGroundInput(input);

    // Sanitize name: ensure never saved as coordinate-based text, numeric code, array index, or unreadable identifier
    if (
      SmartGroundDetectionService.isCoordinateBasedName(input.name) ||
      !SmartGroundDetectionService.isReadableAlphabeticName(input.name)
    ) {
      if (
        input.referencePlaceName &&
        SmartGroundDetectionService.isReadableAlphabeticName(input.referencePlaceName) &&
        !SmartGroundDetectionService.isCoordinateBasedName(input.referencePlaceName)
      ) {
        input.name = SmartGroundDetectionService.generateSmartGroundName(
          input.referencePlaceName,
          'EDUCATIONAL_CAMPUS'
        );
      } else if (
        input.address &&
        SmartGroundDetectionService.isReadableAlphabeticName(input.address) &&
        !SmartGroundDetectionService.isCoordinateBasedName(input.address)
      ) {
        const parts = input.address.split(',').map((p) => p.trim());
        const validPart = parts.find(
          (p) =>
            SmartGroundDetectionService.isReadableAlphabeticName(p) &&
            !SmartGroundDetectionService.isCoordinateBasedName(p) &&
            !/^\d+/.test(p)
        );
        if (validPart) {
          const cleanLocality = SmartGroundDetectionService.sanitizeLocalityName(validPart);
          input.name = `${cleanLocality} Cricket Ground`;
        } else {
          input.name = 'Unnamed Ground';
        }
      } else {
        input.name = 'Unnamed Ground';
      }
      input.isProvisional = true;
    }

    const now = new Date().toISOString();

    // If an explicit ID is supplied and already exists, update it directly
    if (input.id) {
      const existing = await db.grounds.get(input.id);
      if (existing) {
        // Protect user-confirmed / user-defined ground names from silent automatic overwrite,
        // unless existing name is coordinate-based or unreadable (in which case heal it).
        let effectiveName = input.name.trim();
        const existingIsCoord = SmartGroundDetectionService.isCoordinateBasedName(existing.name);
        const existingIsAlpha = SmartGroundDetectionService.isReadableAlphabeticName(existing.name);

        const isUserProtected = Boolean(
          existing.isUserConfirmed || existing.isUserDefined || existing.namingSource === 'MANUAL'
        );
        const inputIsUserConfirm = Boolean(
          input.isUserConfirmed || input.isUserDefined || input.namingSource === 'MANUAL'
        );

        if (isUserProtected && !inputIsUserConfirm && !existingIsCoord && existingIsAlpha) {
          effectiveName = existing.name;
        } else if (
          SmartGroundDetectionService.isCoordinateBasedName(effectiveName) ||
          !SmartGroundDetectionService.isReadableAlphabeticName(effectiveName)
        ) {
          effectiveName = !existingIsCoord && existingIsAlpha ? existing.name : 'Unnamed Ground';
        }

        const isConfirmed = isUserProtected || inputIsUserConfirm;

        const updated: CricketGround = {
          ...existing,
          name: effectiveName,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracy: input.accuracy !== undefined ? input.accuracy : existing.accuracy,
          locationSource: input.locationSource || existing.locationSource,
          googlePlaceId: input.googlePlaceId || existing.googlePlaceId,
          address: input.address !== undefined ? input.address : existing.address,
          referencePlaceId: input.referencePlaceId || existing.referencePlaceId,
          referencePlaceName: input.referencePlaceName || existing.referencePlaceName,
          referenceLatitude:
            input.referenceLatitude !== undefined ? input.referenceLatitude : existing.referenceLatitude,
          referenceLongitude:
            input.referenceLongitude !== undefined ? input.referenceLongitude : existing.referenceLongitude,
          referenceDistanceMeters:
            input.referenceDistanceMeters !== undefined
              ? input.referenceDistanceMeters
              : existing.referenceDistanceMeters,
          isProvisional: isConfirmed ? false : (input.isProvisional !== undefined ? input.isProvisional : existing.isProvisional),
          isUserConfirmed: isConfirmed,
          isUserDefined: isConfirmed,
          namingSource: input.namingSource || (isConfirmed ? 'MANUAL' : existing.namingSource),
          confidenceScore:
            input.confidenceScore !== undefined ? input.confidenceScore : existing.confidenceScore,
          detectionRadiusMeters:
            input.detectionRadiusMeters !== undefined
              ? input.detectionRadiusMeters
              : existing.detectionRadiusMeters,
          updatedAt: now,
          syncStatus: 'PENDING',
        };
        await db.grounds.put(updated);
        await SyncEngine.queueMutation('UPSERT_GROUND', updated, updated.id);

        // Update all matches linked to this ground so their venue name stays updated
        if (effectiveName && effectiveName.toLowerCase() !== 'unnamed ground') {
          try {
            const linkedMatches = await db.matches.where('groundId').equals(updated.id).toArray();
            for (const m of linkedMatches) {
              if (
                m.venue !== effectiveName ||
                (m.advancedSettings && m.advancedSettings.venue !== effectiveName)
              ) {
                m.venue = effectiveName;
                if (m.advancedSettings) {
                  m.advancedSettings.venue = effectiveName;
                }
                m.updatedAt = now;
                await db.matches.put(m);
              }
            }
          } catch {
            // Non-blocking catch
          }
        }

        return updated;
      }
    }

    // Check for duplicate ground by Place ID or Coordinate Proximity
    const duplicate = await this.findExistingDuplicate(input);
    if (duplicate) {
      // Update any enhanced metadata on the existing ground record
      let hasChanges = false;
      const isInputUser = Boolean(
        input.isUserConfirmed || input.isUserDefined || input.namingSource === 'MANUAL'
      );
      if (isInputUser) {
        duplicate.name = input.name.trim();
        duplicate.isUserConfirmed = true;
        duplicate.isUserDefined = true;
        duplicate.namingSource = 'MANUAL';
        hasChanges = true;
      }
      if (input.address && !duplicate.address) {
        duplicate.address = input.address;
        hasChanges = true;
      }
      if (input.googlePlaceId && !duplicate.googlePlaceId) {
        duplicate.googlePlaceId = input.googlePlaceId;
        hasChanges = true;
      }
      if (input.accuracy !== undefined && duplicate.accuracy === undefined) {
        duplicate.accuracy = input.accuracy;
        hasChanges = true;
      }
      if (input.locationSource && !duplicate.locationSource) {
        duplicate.locationSource = input.locationSource;
        hasChanges = true;
      }
      if (input.referencePlaceName && !duplicate.referencePlaceName) {
        duplicate.referencePlaceName = input.referencePlaceName;
        duplicate.referencePlaceId = input.referencePlaceId;
        duplicate.referenceLatitude = input.referenceLatitude;
        duplicate.referenceLongitude = input.referenceLongitude;
        duplicate.referenceDistanceMeters = input.referenceDistanceMeters;
        hasChanges = true;
      }
      if (input.namingSource && !duplicate.namingSource) {
        duplicate.namingSource = input.namingSource;
        hasChanges = true;
      }

      if (hasChanges) {
        duplicate.updatedAt = now;
        duplicate.syncStatus = 'PENDING';
        await db.grounds.put(duplicate);
        await SyncEngine.queueMutation('UPSERT_GROUND', duplicate, duplicate.id);
      }
      return duplicate;
    }

    // Create new ground record
    const id = input.id || `ground_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const isNewUserDefined = Boolean(
      input.isUserDefined || input.isUserConfirmed || input.namingSource === 'MANUAL'
    );
    const newGround: CricketGround = {
      id,
      name: input.name.trim(),
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy,
      locationSource: input.locationSource || (input.googlePlaceId ? 'MAP_SELECTED' : 'MANUAL'),
      googlePlaceId: input.googlePlaceId?.trim() || undefined,
      address: input.address?.trim() || undefined,
      referencePlaceId: input.referencePlaceId,
      referencePlaceName: input.referencePlaceName,
      referenceLatitude: input.referenceLatitude,
      referenceLongitude: input.referenceLongitude,
      referenceDistanceMeters: input.referenceDistanceMeters,
      isProvisional: input.isProvisional ?? false,
      isUserConfirmed: input.isUserConfirmed ?? isNewUserDefined,
      isUserDefined: input.isUserDefined ?? isNewUserDefined,
      namingSource: input.namingSource || (isNewUserDefined ? 'MANUAL' : input.googlePlaceId ? 'PLACES_CRICKET' : 'MANUAL'),
      confidenceScore: input.confidenceScore,
      detectionRadiusMeters: input.detectionRadiusMeters,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'PENDING',
    };

    await db.grounds.put(newGround);
    await SyncEngine.queueMutation('UPSERT_GROUND', newGround, newGround.id);
    return newGround;
  }

  /**
   * Calculates the great-circle distance between two points in meters using the Haversine formula.
   */
  static calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
  }

  /**
   * Discovers local grounds within proximity (meters), sorted by distance ascending.
   * Offline-first: queries indexed Dexie storage directly without external network dependency.
   */
  static async findNearbyGrounds(
    lat: number,
    lng: number,
    maxDistanceMeters: number = 1000
  ): Promise<Array<CricketGround & { distanceMeters: number }>> {
    const allGrounds = await db.grounds.toArray();
    const sanitized = allGrounds.map((g) => this.sanitizeGroundRecord(g));
    const withDistance = sanitized.map((g) => ({
      ...g,
      distanceMeters: this.calculateDistanceMeters(lat, lng, g.latitude, g.longitude),
    }));

    return withDistance
      .filter((g) => g.distanceMeters <= maxDistanceMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  /**
   * Retrieves a ground by unique ID.
   */
  static async getGround(id: string): Promise<CricketGround | undefined> {
    const ground = await db.grounds.get(id);
    return ground ? this.sanitizeGroundRecord(ground) : undefined;
  }

  static async getGroundById(id: string): Promise<CricketGround | undefined> {
    return this.getGround(id);
  }

  /**
   * Loads all saved grounds ordered by updatedAt desc.
   */
  static async getAllGrounds(): Promise<CricketGround[]> {
    const grounds = await db.grounds.orderBy('updatedAt').reverse().toArray();
    return grounds.map((g) => this.sanitizeGroundRecord(g));
  }

  /**
   * Deletes a ground record and queues cloud sync deletion.
   */
  static async deleteGround(id: string): Promise<void> {
    await db.grounds.delete(id);
    await SyncEngine.queueMutation('DELETE_GROUND', { id }, id);
  }

  /**
   * Computes ground match history and activity statistics derived strictly from actual saved match records.
   * Only includes qualifying played matches (COMPLETED or ONGOING).
   * Excludes ABANDONED or PENDING draft matches.
   */
  static async getGroundStats(groundId: string): Promise<GroundStats> {
    const ground = await this.getGround(groundId);
    const allMatches = await db.matches.toArray();

    const normalizedGroundName = ground ? ground.name.trim().toLowerCase() : '';

    // Filter matches that belong to this ground by groundId, or by venue name as fallback
    const groundMatches = allMatches.filter((m) => {
      // Direct groundId reference
      if (m.groundId && m.groundId === groundId) {
        return true;
      }
      // Fallback matching by venue string for legacy matches
      if (!m.groundId && normalizedGroundName && m.venue) {
        return m.venue.trim().toLowerCase() === normalizedGroundName;
      }
      return false;
    });

    // Qualifying played matches rule: COMPLETED or ONGOING only
    const playedMatches = groundMatches.filter(
      (m) => m.status === 'COMPLETED' || m.status === 'ONGOING'
    );

    // Clean any unreadable/numeric legacy venue names on played matches
    for (const m of playedMatches) {
      if (m.venue && !SmartGroundDetectionService.isReadableAlphabeticName(m.venue)) {
        m.venue = ground ? ground.name : 'Local Cricket Ground';
        db.matches.put(m).catch(() => {});
      }
    }

    // Sort by latest match date descending
    playedMatches.sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt).getTime();
      return timeB - timeA;
    });

    const mostRecentMatch = playedMatches.length > 0 ? playedMatches[0] : null;
    const mostRecentMatchDate = mostRecentMatch
      ? mostRecentMatch.updatedAt || mostRecentMatch.createdAt
      : null;

    return {
      groundId,
      totalMatches: playedMatches.length,
      mostRecentMatchDate,
      matches: playedMatches,
    };
  }

  /**
   * Convenience helper to find or create a ground from a Google Places search result.
   */
  static async findOrCreateFromPlace(place: {
    name: string;
    latitude: number;
    longitude: number;
    googlePlaceId?: string;
    address?: string;
    accuracy?: number;
    locationSource?: LocationSource;
  }): Promise<CricketGround> {
    return this.saveGround({
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      googlePlaceId: place.googlePlaceId,
      address: place.address,
      accuracy: place.accuracy,
      locationSource: place.locationSource || 'MAP_SELECTED',
    });
  }

  /**
   * Scans all stored ground and match records in the database,
   * detecting and repairing any legacy coordinate-based names (e.g. "Ground at 24.0036, 90.6839", "24.0036, 90.6839").
   * Never overwrites valid or user-confirmed non-coordinate names.
   */
  static async healAllExistingGrounds(): Promise<{ groundsHealed: number; matchesHealed: number }> {
    let groundsHealed = 0;
    let matchesHealed = 0;

    try {
      const allGrounds = await db.grounds.toArray();
      const groundMap = new Map<string, CricketGround>();

      for (const g of allGrounds) {
        const isCoord = SmartGroundDetectionService.isCoordinateBasedName(g.name);
        const isAlpha = SmartGroundDetectionService.isReadableAlphabeticName(g.name);

        if (isCoord || !isAlpha) {
          const sanitized = this.sanitizeGroundRecord(g);
          await db.grounds.put(sanitized);
          groundMap.set(sanitized.id, sanitized);
          groundsHealed++;
        } else {
          groundMap.set(g.id, g);
        }
      }

      // Check matches for coordinate-based venues
      const allMatches = await db.matches.toArray();
      for (const m of allMatches) {
        let changed = false;
        if (
          m.venue &&
          (SmartGroundDetectionService.isCoordinateBasedName(m.venue) ||
            !SmartGroundDetectionService.isReadableAlphabeticName(m.venue))
        ) {
          if (m.groundId && groundMap.has(m.groundId)) {
            m.venue = groundMap.get(m.groundId)!.name;
            changed = true;
          } else if (
            m.location?.referencePlaceName &&
            SmartGroundDetectionService.isReadableAlphabeticName(m.location.referencePlaceName) &&
            !SmartGroundDetectionService.isCoordinateBasedName(m.location.referencePlaceName)
          ) {
            m.venue = SmartGroundDetectionService.generateSmartGroundName(
              m.location.referencePlaceName,
              'EDUCATIONAL_CAMPUS'
            );
            changed = true;
          } else {
            m.venue = 'Unnamed Ground';
            changed = true;
          }
        }

        if (changed) {
          await db.matches.put(m);
          matchesHealed++;
        }
      }
    } catch (err) {
      console.warn('[GroundRepository] Database healing note:', err);
    }

    return { groundsHealed, matchesHealed };
  }
}
