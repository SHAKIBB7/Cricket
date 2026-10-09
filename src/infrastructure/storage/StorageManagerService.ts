/**
 * StorageManagerService
 * 
 * Manages persistent storage requests, quota monitoring, quota exhaustion mitigation,
 * and app metadata storage for resilient offline-first operation.
 */

import { db, AppMetadataRecord } from '../database/dexie-db';

export interface StorageEstimateResult {
  supported: boolean;
  persisted: boolean;
  usageBytes: number;
  quotaBytes: number;
  usagePercent: number;
  usageMB: number;
  quotaMB: number;
  isLowSpace: boolean;
}

export class StorageManagerService {
  private static persistenceRequested = false;

  /**
   * Requests persistent storage from the browser (e.g. Chrome, Firefox, Safari)
   * so cached matches and IndexedDB data are not evicted under storage pressure.
   */
  static async requestPersistence(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.storage?.persist) {
      return false;
    }

    try {
      const isAlreadyPersisted = await navigator.storage.persisted();
      if (isAlreadyPersisted) {
        return true;
      }

      const granted = await navigator.storage.persist();
      this.persistenceRequested = true;
      return granted;
    } catch (err) {
      console.warn('StorageManagerService: Persistence request failed', err);
      return false;
    }
  }

  /**
   * Checks whether the current origin has persistent storage status.
   */
  static async isPersisted(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.storage?.persisted) {
      return false;
    }
    try {
      return await navigator.storage.persisted();
    } catch {
      return false;
    }
  }

  /**
   * Retrieves accurate storage usage and quota estimates from the browser.
   */
  static async getStorageEstimate(): Promise<StorageEstimateResult> {
    const defaultResult: StorageEstimateResult = {
      supported: false,
      persisted: false,
      usageBytes: 0,
      quotaBytes: 0,
      usagePercent: 0,
      usageMB: 0,
      quotaMB: 0,
      isLowSpace: false,
    };

    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.storage?.estimate) {
      return defaultResult;
    }

    try {
      const [estimate, persisted] = await Promise.all([
        navigator.storage.estimate(),
        this.isPersisted(),
      ]);

      const usageBytes = estimate.usage || 0;
      const quotaBytes = estimate.quota || 0;
      const usagePercent = quotaBytes > 0 ? (usageBytes / quotaBytes) * 100 : 0;
      const usageMB = Math.round((usageBytes / (1024 * 1024)) * 10) / 10;
      const quotaMB = Math.round((quotaBytes / (1024 * 1024)) * 10) / 10;
      const isLowSpace = quotaBytes > 0 && quotaBytes - usageBytes < 20 * 1024 * 1024; // Less than 20MB remaining

      return {
        supported: true,
        persisted,
        usageBytes,
        quotaBytes,
        usagePercent,
        usageMB,
        quotaMB,
        isLowSpace,
      };
    } catch (err) {
      console.warn('StorageManagerService: Failed to estimate storage', err);
      return defaultResult;
    }
  }

  /**
   * Mitigates quota exhaustion by cleaning up completed sync items
   * and notifying caller if storage is dangerously full.
   */
  static async handleQuotaExhaustion(): Promise<{ cleanedItems: number; isStillFull: boolean }> {
    let cleanedItems = 0;
    try {
      const syncedRecords = await db.sync_queue.where('status').equals('SYNCED').toArray();
      if (syncedRecords.length > 0) {
        cleanedItems = syncedRecords.length;
        await db.sync_queue.where('status').equals('SYNCED').delete();
      }
    } catch (err) {
      console.error('StorageManagerService: Error during quota cleanup', err);
    }

    const estimate = await this.getStorageEstimate();
    return {
      cleanedItems,
      isStillFull: estimate.isLowSpace || estimate.usagePercent > 90,
    };
  }

  /**
   * Diagnostic test to verify IndexedDB is unblocked and functioning properly.
   */
  static async verifyStorageHealth(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const testKey = '__health_check__';
      await db.app_metadata.put({
        key: testKey,
        value: Date.now(),
        updatedAt: new Date().toISOString(),
      });
      await db.app_metadata.delete(testKey);
      return { healthy: true };
    } catch (err: any) {
      return {
        healthy: false,
        error: err?.message || 'IndexedDB storage is inaccessible or blocked.',
      };
    }
  }

  /**
   * Stores persistent application metadata key-value pair in IndexedDB.
   */
  static async setMetadata(key: string, value: any): Promise<void> {
    try {
      await db.app_metadata.put({
        key,
        value,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn(`StorageManagerService: Failed to set metadata for ${key}`, err);
    }
  }

  /**
   * Retrieves persistent application metadata value from IndexedDB.
   */
  static async getMetadata<T = any>(key: string): Promise<T | undefined> {
    try {
      const record = await db.app_metadata.get(key);
      return record ? (record.value as T) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Tracks the latest active match ID for immediate restoration on application reopen.
   */
  static async setLastActiveMatchId(matchId: string): Promise<void> {
    await this.setMetadata('last_active_match_id', matchId);
  }

  /**
   * Retrieves the latest active match ID.
   */
  static async getLastActiveMatchId(): Promise<string | undefined> {
    return this.getMetadata<string>('last_active_match_id');
  }
}
