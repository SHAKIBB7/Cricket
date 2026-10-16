import { CricketGround } from '@/domain/cricket/types';
import { GroundRepository } from '../storage/GroundRepository';
import { AutoGpsLocationService } from '../gps/AutoGpsLocationService';
import { GoogleMapsLoaderService } from './GoogleMapsLoaderService';

export interface DetectedGroundCandidate {
  id?: string;
  name: string;
  suggestedGroundName?: string;
  category?: string;
  latitude: number;
  longitude: number;
  address?: string;
  googlePlaceId?: string;
  distanceMeters: number;
  confidenceScore?: number;
  detectionRadiusMeters?: number;
  isSaved: boolean;
  savedGround?: CricketGround;
  source: 'LOCAL_SAVED' | 'GOOGLE_PLACES';
}

export class NearbyGroundDetectionService {
  /**
   * Discovers candidate cricket grounds and sports stadiums near GPS coordinates.
   * Blends offline-first local saved grounds with Google Places results.
   * Prevents duplicates and returns candidates sorted strictly by proximity.
   */
  static async detectNearbyGrounds(
    latitude: number,
    longitude: number,
    radiusMeters: number = 2500
  ): Promise<DetectedGroundCandidate[]> {
    const candidates: DetectedGroundCandidate[] = [];
    const seenPlaceIds = new Set<string>();
    const seenCoordinates: Array<{ lat: number; lng: number }> = [];

    // Helper to check coordinate closeness (< 50 meters)
    const isCoordinateSeen = (lat: number, lng: number): boolean => {
      return seenCoordinates.some(
        (c) => AutoGpsLocationService.calculateDistanceMeters(lat, lng, c.lat, c.lng) < 50
      );
    };

    // 1. STEP 1: Query Local Offline Saved Grounds (100% Offline Resilience)
    try {
      const localNearby = await GroundRepository.findNearbyGrounds(latitude, longitude, radiusMeters);
      for (const g of localNearby) {
        if (g.googlePlaceId) seenPlaceIds.add(g.googlePlaceId);
        seenCoordinates.push({ lat: g.latitude, lng: g.longitude });

        candidates.push({
          id: g.id,
          name: g.name,
          latitude: g.latitude,
          longitude: g.longitude,
          address: g.address,
          googlePlaceId: g.googlePlaceId,
          distanceMeters: g.distanceMeters,
          isSaved: true,
          savedGround: g,
          source: 'LOCAL_SAVED',
        });
      }
    } catch (e) {
      console.warn('[NearbyGroundDetection] Could not query local grounds:', e);
    }

    // 2. STEP 2: Query Google Places API (if online and available)
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
            const placesResults = await this.queryGooglePlacesNearby(
              latitude,
              longitude,
              radiusMeters,
              google
            );

            for (const place of placesResults) {
              if (place.googlePlaceId && seenPlaceIds.has(place.googlePlaceId)) {
                continue;
              }
              if (isCoordinateSeen(place.latitude, place.longitude)) {
                continue;
              }

              if (place.googlePlaceId) seenPlaceIds.add(place.googlePlaceId);
              seenCoordinates.push({ lat: place.latitude, lng: place.longitude });

              const distance = AutoGpsLocationService.calculateDistanceMeters(
                latitude,
                longitude,
                place.latitude,
                place.longitude
              );

              candidates.push({
                name: place.name,
                latitude: place.latitude,
                longitude: place.longitude,
                address: place.address,
                googlePlaceId: place.googlePlaceId,
                distanceMeters: distance,
                isSaved: false,
                source: 'GOOGLE_PLACES',
              });
            }
          }
        }
      } catch (e) {
        // Safe degrade: do not fail if Places API throws quota/network errors
        console.warn('[NearbyGroundDetection] Places API lookup skipped/failed:', e);
      }
    }

    // 3. STEP 3: Sort all candidates by distance ascending
    return candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  /**
   * Queries Google Places API for cricket grounds, stadiums, or sports fields.
   */
  private static queryGooglePlacesNearby(
    lat: number,
    lng: number,
    radius: number,
    google: any
  ): Promise<
    Array<{
      name: string;
      latitude: number;
      longitude: number;
      googlePlaceId?: string;
      address?: string;
    }>
  > {
    return new Promise((resolve) => {
      const dummyDiv = document.createElement('div');
      const service = new google.maps.places.PlacesService(dummyDiv);
      const center = new google.maps.LatLng(lat, lng);

      // Perform textSearch with cricket/stadium query centered at coordinates
      const request = {
        location: center,
        radius,
        query: 'cricket ground stadium sports ground',
      };

      service.textSearch(
        request,
        (results: any[] | null, status: any) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
            const parsed = results.slice(0, 10).map((r) => ({
              name: r.name || 'Sports Ground',
              latitude: Number(r.geometry?.location?.lat()?.toFixed(6)) || lat,
              longitude: Number(r.geometry?.location?.lng()?.toFixed(6)) || lng,
              googlePlaceId: r.place_id,
              address: r.formatted_address || '',
            }));
            resolve(parsed);
          } else {
            resolve([]);
          }
        }
      );
    });
  }
}
