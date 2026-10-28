/**
 * GoogleMapsLoaderService — Resilient Official Google Maps JavaScript API Loader
 * 
 * Capabilities:
 * - Dynamic asynchronous script loading with official parameters
 * - Safe missing API-key and offline detection without unhandled exceptions
 * - Google authentication failure listener (gm_authFailure)
 * - Structured load state observable by React components
 * - Clean singleton lifecycle
 */

export type GoogleMapsStatus = 'IDLE' | 'LOADING' | 'LOADED' | 'NO_API_KEY' | 'OFFLINE' | 'ERROR';

export interface GoogleMapsLoadResult {
  success: boolean;
  status: GoogleMapsStatus;
  errorMessage?: string;
}

export class GoogleMapsLoaderService {
  private static loadPromise: Promise<GoogleMapsLoadResult> | null = null;
  private static currentStatus: GoogleMapsStatus = 'IDLE';
  private static errorMessage: string | undefined = undefined;
  private static consoleIntercepted = false;

  private static initConsoleInterception(): void {
    if (typeof window === 'undefined' || this.consoleIntercepted) return;
    this.consoleIntercepted = true;

    const originalConsoleError = console.error.bind(console);
    console.error = (...args: any[]) => {
      const errorStr = args
        .map((a) => {
          if (typeof a === 'string') return a;
          if (a instanceof Error) return a.message + ' ' + (a.stack || '');
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(' ');

      if (
        errorStr.includes('BillingNotEnabledMapError') ||
        errorStr.includes('BillingNotEnabled') ||
        (errorStr.includes('Google Maps JavaScript API error') && errorStr.toLowerCase().includes('billing'))
      ) {
        console.warn(
          '[GoogleMapsLoader] Google Maps API Notice: Cloud Billing account not linked (BillingNotEnabledMapError). Switching to offline ground catalog and manual coordinate entry.'
        );
        this.currentStatus = 'ERROR';
        this.errorMessage =
          'Google Maps API authentication failed: Cloud Billing account not linked (BillingNotEnabledMapError). Saved grounds and custom ground creation remain fully functional offline.';
        this.notifyListeners();
        return;
      }

      originalConsoleError(...args);
    };
  }

  /**
   * Reads Google Maps API key from existing Next.js public environment variable.
   */
  static getApiKey(): string {
    return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || '';
  }

  static hasValidKey(): boolean {
    const key = this.getApiKey();
    return Boolean(key && key !== 'your-google-maps-api-key' && key.length > 5);
  }

  static getStatus(): GoogleMapsStatus {
    if (this.currentStatus === 'ERROR') return 'ERROR';
    if (this.isLoaded()) return 'LOADED';
    return this.currentStatus;
  }

  static getErrorMessage(): string | undefined {
    return this.errorMessage;
  }

  private static listeners: Array<(status: GoogleMapsStatus, error?: string) => void> = [];

  /**
   * Subscribe to status and error updates (e.g. when gm_authFailure triggers after script load).
   */
  static subscribe(listener: (status: GoogleMapsStatus, error?: string) => void): () => void {
    this.listeners.push(listener);
    if (this.currentStatus === 'ERROR' || this.currentStatus === 'NO_API_KEY' || this.currentStatus === 'OFFLINE') {
      try {
        listener(this.currentStatus, this.errorMessage);
      } catch (err) {
        console.error('[GoogleMapsLoader] Listener error:', err);
      }
    }
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private static notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentStatus, this.errorMessage);
      } catch (err) {
        console.error('[GoogleMapsLoader] Listener error:', err);
      }
    }
  }

  static resetForTesting(): void {
    this.loadPromise = null;
    this.currentStatus = 'IDLE';
    this.errorMessage = undefined;
    this.listeners = [];
  }

  /**
   * Verifies if Google Maps Platform JS API is loaded and available on window.
   */
  static isLoaded(): boolean {
    if (this.currentStatus === 'ERROR') return false;
    return (
      typeof window !== 'undefined' &&
      typeof (window as any).google !== 'undefined' &&
      typeof (window as any).google.maps !== 'undefined'
    );
  }

  /**
   * Asynchronously loads Google Maps Platform JS API with required libraries.
   */
  static async load(): Promise<GoogleMapsLoadResult> {
    if (typeof window !== 'undefined') {
      this.initConsoleInterception();
      (window as any).gm_authFailure = () => {
        console.warn('[GoogleMapsLoader] Google Maps API Authentication Failure (gm_authFailure).');
        this.currentStatus = 'ERROR';
        this.errorMessage =
          'Google Maps API authentication failed: Cloud Billing account not linked (BillingNotEnabledMapError). Saved grounds and custom ground creation remain fully functional offline.';
        this.notifyListeners();
      };
    }

    // 1. Check API key presence
    const apiKey = this.getApiKey();
    if (!this.hasValidKey()) {
      this.currentStatus = 'NO_API_KEY';
      this.errorMessage =
        'Google Maps API key is not configured. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local (for local development) or in your deployment environment variables (e.g. Vercel) to enable interactive satellite/street maps and Places search.';
      return { success: false, status: 'NO_API_KEY', errorMessage: this.errorMessage };
    }

    if (typeof window === 'undefined') {
      return { success: false, status: 'IDLE' };
    }

    if (this.isLoaded()) {
      this.currentStatus = 'LOADED';
      return { success: true, status: 'LOADED' };
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    // 2. Check network connectivity
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.currentStatus = 'OFFLINE';
      this.errorMessage = 'Offline mode: Google Maps requires an active internet connection.';
      return { success: false, status: 'OFFLINE', errorMessage: this.errorMessage };
    }

    this.currentStatus = 'LOADING';

    this.loadPromise = new Promise<GoogleMapsLoadResult>((resolve) => {
      const scriptId = 'google-maps-platform-script';
      const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

      // Ensure gm_authFailure also resolves promise if triggered before load callback
      (window as any).gm_authFailure = () => {
        console.warn('[GoogleMapsLoader] Google Maps API Authentication Failure (gm_authFailure).');
        this.currentStatus = 'ERROR';
        this.errorMessage =
          'Google Maps API authentication failed: Cloud Billing account not linked (BillingNotEnabledMapError). Saved grounds and custom ground creation remain fully functional offline.';
        this.notifyListeners();
        resolve({ success: false, status: 'ERROR', errorMessage: this.errorMessage });
      };

      let timeoutId: NodeJS.Timeout | null = null;
      const callbackName = `__initGoogleMaps_${Date.now()}`;
      (window as any)[callbackName] = () => {
        if (timeoutId) clearTimeout(timeoutId);
        delete (window as any)[callbackName];
        this.currentStatus = 'LOADED';
        this.errorMessage = undefined;
        this.notifyListeners();
        resolve({ success: true, status: 'LOADED' });
      };

      if (existingScript) {
        if (this.isLoaded()) {
          this.currentStatus = 'LOADED';
          resolve({ success: true, status: 'LOADED' });
          return;
        }

        existingScript.addEventListener(
          'load',
          () => {
            if (timeoutId) clearTimeout(timeoutId);
            this.currentStatus = 'LOADED';
            this.errorMessage = undefined;
            this.notifyListeners();
            resolve({ success: true, status: 'LOADED' });
          },
          { once: true }
        );

        existingScript.addEventListener(
          'error',
          () => {
            if (timeoutId) clearTimeout(timeoutId);
            this.currentStatus = 'ERROR';
            this.errorMessage = 'Failed to load Google Maps script.';
            this.notifyListeners();
            resolve({ success: false, status: 'ERROR', errorMessage: this.errorMessage });
          },
          { once: true }
        );

        return;
      }

      const script = document.createElement('script');
      script.id = scriptId;
      script.type = 'text/javascript';
      script.async = true;
      script.defer = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        apiKey
      )}&libraries=places,marker,geometry&loading=async&callback=${callbackName}`;

      script.onerror = () => {
        if (timeoutId) clearTimeout(timeoutId);
        delete (window as any)[callbackName];
        this.currentStatus = 'ERROR';
        this.errorMessage =
          'Failed to load Google Maps script. Check your internet connection or network firewall.';
        resolve({ success: false, status: 'ERROR', errorMessage: this.errorMessage });
      };

      // 12-second load timeout safety
      timeoutId = setTimeout(() => {
        if (this.currentStatus === 'LOADING') {
          this.currentStatus = 'ERROR';
          this.errorMessage = 'Google Maps request timed out. Please check your network connection.';
          resolve({ success: false, status: 'ERROR', errorMessage: this.errorMessage });
        }
      }, 12000);

      document.head.appendChild(script);
    });

    return this.loadPromise;
  }
}
