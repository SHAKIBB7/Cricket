import { db } from '../database/dexie-db';
import { CricketGround, MatchScorecard, LocationSource } from '@/domain/cricket/types';
import { SyncEngine } from '../sync/SyncEngine';

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
   * Saves or updates a cricket ground with deduplication and durable offline persistence.
   */
  static async saveGround(input: GroundInput): Promise<CricketGround> {
    this.validateGroundInput(input);

    const now = new Date().toISOString();

    // If an explicit ID is supplied and already exists, update it directly
    if (input.id) {
      const existing = await db.grounds.get(input.id);
      if (existing) {
        const updated: CricketGround = {
          ...existing,
          name: input.name.trim(),
          latitude: input.latitude,
          longitude: input.longitude,
          accuracy: input.accuracy !== undefined ? input.accuracy : existing.accuracy,
          locationSource: input.locationSource || existing.locationSource,
          googlePlaceId: input.googlePlaceId || existing.googlePlaceId,
          address: input.address !== undefined ? input.address : existing.address,
          updatedAt: now,
          syncStatus: 'PENDING',
        };
        await db.grounds.put(updated);
        await SyncEngine.queueMutation('UPSERT_GROUND', updated, updated.id);
        return updated;
      }
    }

    // Check for duplicate ground by Place ID or Coordinate Proximity
    const duplicate = await this.findExistingDuplicate(input);
    if (duplicate) {
      // Update any enhanced metadata on the existing ground record
      let hasChanges = false;
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
    const newGround: CricketGround = {
      id,
      name: input.name.trim(),
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy,
      locationSource: input.locationSource || (input.googlePlaceId ? 'MAP_SELECTED' : 'MANUAL'),
      googlePlaceId: input.googlePlaceId?.trim() || undefined,
      address: input.address?.trim() || undefined,
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
    const withDistance = allGrounds.map((g) => ({
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
    return db.grounds.get(id);
  }

  /**
   * Loads all saved grounds ordered by updatedAt desc.
   */
  static async getAllGrounds(): Promise<CricketGround[]> {
    return db.grounds.orderBy('updatedAt').reverse().toArray();
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
}
