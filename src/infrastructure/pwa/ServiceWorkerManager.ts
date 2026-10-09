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
