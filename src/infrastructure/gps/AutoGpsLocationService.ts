/**
 * AutoGpsLocationService — Battery-Friendly, Transparent One-Shot Browser Geolocation Service
 * 
 * Capabilities:
 * - One-shot location detection without continuous/background tracking
 * - Non-intrusive permission status query via Permissions API
 * - Accuracy validation: flags coordinates if accuracy > 500m (low accuracy warning)
 * - Safe error mapping for permission denial, timeout, and hardware unavailability
 * - Haversine distance computation and human-friendly distance formatting
 */

export interface GpsLocationResult {
  latitude: number;
  longitude: number;
  accuracy: number; // meters
  timestamp: string; // ISO string
  isLowAccuracy: boolean; // true if accuracy > 500m
}

export type GpsPermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

export class GpsLocationServiceError extends Error {
  code: 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED' | 'UNKNOWN';

  constructor(
    code: 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED' | 'UNKNOWN',
    message: string
  ) {
    super(message);
    this.name = 'GpsLocationServiceError';
    this.code = code;
  }
}

export class AutoGpsLocationService {
  /**
   * Accuracy threshold in meters above which location is classified as inaccurate.
   */
  static readonly LOW_ACCURACY_THRESHOLD_METERS = 500;

  /**
   * Checks current browser location permission without prompting the user.
   */
  static async checkPermission(): Promise<GpsPermissionState> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return 'unsupported';
    }

    try {
      if ('permissions' in navigator && typeof navigator.permissions?.query === 'function') {
        const permissionStatus = await navigator.permissions.query({
          name: 'geolocation' as PermissionName,
        });
        return permissionStatus.state as GpsPermissionState;
      }
    } catch {
      // Permissions API query not supported or restricted in some browsers/iframes
    }

    return 'prompt';
  }

  /**
   * Captures the current device coordinates via a one-shot Geolocation query.
   * Never initiates continuous background tracking.
   */
  static async getCurrentPosition(options?: PositionOptions): Promise<GpsLocationResult> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new GpsLocationServiceError(
        'UNSUPPORTED',
        'Geolocation is not supported by your current browser or device.'
      );
    }

    const defaultOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
      ...options,
    };

    return new Promise<GpsLocationResult>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = Number(position.coords.latitude.toFixed(6));
          const lng = Number(position.coords.longitude.toFixed(6));
          const accuracy = Math.round(position.coords.accuracy || 0);
          const timestamp = new Date(position.timestamp || Date.now()).toISOString();
          const isLowAccuracy = accuracy > this.LOW_ACCURACY_THRESHOLD_METERS;

          resolve({
            latitude: lat,
            longitude: lng,
            accuracy,
            timestamp,
            isLowAccuracy,
          });
        },
        (error) => {
          let code: GpsLocationServiceError['code'] = 'UNKNOWN';
          let message = 'Failed to retrieve location.';

          switch (error.code) {
            case error.PERMISSION_DENIED:
              code = 'PERMISSION_DENIED';
              message = 'Location access was denied. Please allow location permissions in your browser or select your ground manually.';
              break;
            case error.POSITION_UNAVAILABLE:
              code = 'POSITION_UNAVAILABLE';
              message = 'GPS location is currently unavailable. Ensure your device GPS/location service is enabled.';
              break;
            case error.TIMEOUT:
              code = 'TIMEOUT';
              message = 'Location request timed out. You can retry or pick a ground on the map.';
              break;
            default:
              code = 'UNKNOWN';
              message = error.message || 'An unknown error occurred while acquiring GPS location.';
              break;
          }

          reject(new GpsLocationServiceError(code, message));
        },
        defaultOptions
      );
    });
  }

  /**
   * Calculates the great-circle distance between two geographic coordinates in meters using the Haversine formula.
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
   * Formats a distance in meters into human-readable text (e.g. "85m" or "1.2 km").
   */
  static formatDistance(meters: number): string {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  }
}
