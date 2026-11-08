/**
 * ServiceWorkerManager
 * 
 * Manages service worker registration, background sync triggers, offline readiness,
 * and safe update lifecycles preventing active match interruption.
 */

import { StorageManagerService } from '../storage/StorageManagerService';

export interface ServiceWorkerState {
  isRegistered: boolean;
  isOfflineReady: boolean;
  isUpdateAvailable: boolean;
  registration: ServiceWorkerRegistration | null;
}

type SWStateListener = (state: ServiceWorkerState) => void;

export class ServiceWorkerManager {
  private static registration: ServiceWorkerRegistration | null = null;
  private static isOfflineReady = false;
  private static isUpdateAvailable = false;
  private static listeners: Set<SWStateListener> = new Set();
  private static hasInitialized = false;

  static init(): void {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    if (this.hasInitialized) return;
    this.hasInitialized = true;

    // In development mode, unregister any active service worker and clear caches
    // to prevent stale HTML/JS chunk caching conflicts and Next.js hydration errors
    if (process.env.NODE_ENV === 'development') {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
      if (typeof caches !== 'undefined') {
        caches.keys().then((keys) => {
          for (const key of keys) {
            caches.delete(key);
          }
        });
      }
      return;
    }

    // Request persistent browser storage early
    StorageManagerService.requestPersistence().catch(() => {});

    // Register after page load for best initial rendering performance
    if (document.readyState === 'complete') {
      this.registerServiceWorker();
    } else {
      window.addEventListener('load', () => this.registerServiceWorker());
    }
  }

  private static async registerServiceWorker(): Promise<void> {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      this.registration = reg;

      // Check if already controlling and active
      if (reg.active && navigator.serviceWorker.controller) {
        this.isOfflineReady = true;
        this.notify();
      }

      // Check for waiting worker (update available)
      if (reg.waiting) {
        this.isUpdateAvailable = true;
        this.notify();
      }

      // Listen for updates
      reg.addEventListener('updatefound', () => {
        const installingWorker = reg.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // New update is installed and waiting
              this.isUpdateAvailable = true;
              this.notify();
            } else {
              // Pre-cache finished for the first time -> App is offline ready!
              this.isOfflineReady = true;
              this.notify();
            }
          }
        });
      });

      // Listen for messages from Service Worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'CRIC_SW_ACTIVATED') {
          this.isOfflineReady = true;
          this.notify();
        }
      });

      // Register for background sync where supported (Chrome, Edge, Android)
      if ('sync' in reg) {
        try {
          await (reg as any).sync.register('cric-sync-queue');
        } catch {
          // Non-critical: foreground sync will handle it
        }
      }
    } catch (err) {
      console.warn('ServiceWorkerManager: Registration failed', err);
    }
  }

  /**
   * Subscribes to service worker state updates.
   */
  static subscribe(listener: SWStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  static setOfflineReady(ready: boolean): void {
    this.isOfflineReady = ready;
    this.notify();
  }

  /**
   * Verifies that essential offline resources are present in Cache Storage.
   */
  static async verifyCachesReady(): Promise<{ verified: boolean; cachedCount: number; total: number; missing: string[] }> {
    if (typeof window === 'undefined' || typeof caches === 'undefined') {
      return { verified: false, cachedCount: 0, total: 0, missing: ['caches_unsupported'] };
    }

    try {
      const cacheNames = await caches.keys();
      const shellCacheName = cacheNames.find((name) => name.includes('cric-scorer-shell')) || cacheNames[0];
      if (!shellCacheName) {
        return { verified: false, cachedCount: 0, total: 0, missing: ['cache_not_found'] };
      }

      const cache = await caches.open(shellCacheName);
      const essentialUrls = [
        '/',
        '/offline',
        '/matches/new',
        '/matches/opening-players',
        '/matches/history',
        '/tournaments',
        '/teams',
        '/profile',
        '/manifest.json',
      ];

      const results = await Promise.all(
        essentialUrls.map(async (url) => {
          const match = await cache.match(url);
          return { url, cached: !!match };
        })
      );

      const missing = results.filter((r) => !r.cached).map((r) => r.url);
      const verified = missing.length === 0;

      if (verified) {
        this.isOfflineReady = true;
        this.notify();
      }

      return {
        verified,
        cachedCount: results.length - missing.length,
        total: results.length,
        missing,
      };
    } catch (err) {
      console.warn('ServiceWorkerManager: verifyCachesReady failed', err);
      return { verified: false, cachedCount: 0, total: 0, missing: [String(err)] };
    }
  }

  /**
   * Warm-caches an array of URLs into Cache Storage.
   */
  static async warmResources(urls: string[]): Promise<void> {
    if (typeof window === 'undefined' || typeof caches === 'undefined') return;
    try {
      const cacheNames = await caches.keys();
      const targetCacheName = cacheNames.find((n) => n.includes('runtime') || n.includes('shell')) || 'cric-scorer-runtime-v2.2.0';
      const cache = await caches.open(targetCacheName);

      await Promise.allSettled(
        urls.map(async (url) => {
          try {
            const res = await fetch(url, { credentials: 'same-origin' });
            if (res.ok) {
              await cache.put(url, res);
            }
          } catch (err) {
            // One bad URL must not fail the batch, but a silent swallow
            // hid offline-warming failures entirely (Ultimate audit F7).
            console.warn('ServiceWorkerManager: warmResources failed for', url, err);
          }
        })
      );
    } catch (err) {
      console.warn('ServiceWorkerManager: warmResources failed', err);
    }
  }

  /**
   * Warm-caches the JS/CSS assets each route's document references.
   *
   * Why this exists (Phase 15 finding): warmResources() caches route
   * DOCUMENTS, and the SW precaches them too — but a document alone cannot
   * render offline. The App Router needs the route's page chunk
   * (/_next/static/chunks/app/<route>/page-*.js) to boot; a route the user
   * never visited online (and no nav link prefetches — e.g. /offline
   * itself) had no chunk in any cache, so a cold offline navigation to it
   * rendered the app layout around an empty content area. Caching every
   * asset a route's HTML references while online fixes those navigations.
   */
  static async warmRouteAssets(routes: string[]): Promise<void> {
    if (typeof window === 'undefined' || typeof caches === 'undefined') return;
    try {
      const assetUrls = new Set<string>();
      await Promise.allSettled(
        routes.map(async (route) => {
          try {
            const res = await fetch(route, { credentials: 'same-origin' });
            if (!res.ok) return;
            const html = await res.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            doc
              .querySelectorAll('script[src*="/_next/static/"], link[href*="/_next/static/"]')
              .forEach((el) => {
                const url = el.getAttribute('src') || el.getAttribute('href');
                if (url) assetUrls.add(url);
              });
          } catch (err) {
            console.warn('ServiceWorkerManager: warmRouteAssets could not read route', route, err);
          }
        })
      );

      // Store each asset DIRECTLY via the Cache Storage API. Relying on the
      // SW's cache-first fetch handler to store them (plain fetch) races
      // with SW activation: on a first-ever load the page is not yet
      // controlled when setup runs, its fetches bypass the SW entirely, and
      // nothing is stored — verified in Phase 15 browser tests (desktop won
      // the race, mobile lost it). caches.match() in the SW searches every
      // cache, so writing into the same cache warmResources() uses (runtime
      // if present, else the shell cache — both are on the SW's keep-list)
      // makes the chunks available to offline navigations deterministically.
      const cacheNames = await caches.keys();
      const targetCacheName =
        cacheNames.find((n) => n.includes('runtime')) ||
        cacheNames.find((n) => n.includes('shell')) ||
        'cric-scorer-shell-v2.2.2';
      const cache = await caches.open(targetCacheName);

      await Promise.allSettled(
        [...assetUrls].map(async (url) => {
          try {
            if (await caches.match(url)) return; // already stored somewhere
            const res = await fetch(url, { credentials: 'same-origin' });
            if (res.ok) {
              await cache.put(url, res);
            }
          } catch (err) {
            console.warn('ServiceWorkerManager: warmRouteAssets failed for', url, err);
          }
        })
      );
    } catch (err) {
      console.warn('ServiceWorkerManager: warmRouteAssets failed', err);
    }
  }

  static getState(): ServiceWorkerState {
    return {
      isRegistered: !!this.registration,
      isOfflineReady: this.isOfflineReady,
      isUpdateAvailable: this.isUpdateAvailable,
      registration: this.registration,
    };
  }

  private static notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {}
    }
  }

  /**
   * Applies the waiting update safely.
   * If on active scoring screen (/matches/score/*), notifies the user rather than forcing reload.
   */
  static applyUpdate(): void {
    if (typeof window === 'undefined') return;

    // Safeguard: Check if currently scoring a match
    const isScoringActive = window.location.pathname.startsWith('/matches/score/');
    if (isScoringActive) {
      const confirmUpdate = window.confirm(
        'A new version of Cricket Scorer Pro is ready. Would you like to update now? (Your local match data is safely saved in IndexedDB).'
      );
      if (!confirmUpdate) return;
    }

    if (this.registration?.waiting) {
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    // Reload smoothly
    window.location.reload();
  }
}
