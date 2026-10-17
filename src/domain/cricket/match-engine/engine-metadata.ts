/**
 * Match Engine Metadata & Dynamic Version Configuration
 *
 * Single centralized source of truth for the Cricket Match Engine
 * version, metadata, and dynamic display resolution across the application.
 */

'use client';

import { useState, useEffect } from 'react';

export interface MatchEngineMetadata {
  readonly name: string;
  readonly version: string;
  readonly edition?: string;
  readonly build?: string;
  readonly releaseDate?: string;
}

export const DEFAULT_MATCH_ENGINE_METADATA: MatchEngineMetadata = {
  name: 'Match Engine',
  version: '2.1',
  edition: 'Pro',
};

/**
 * Resolves the initial engine version from environment variables if present,
 * or defaults to the baseline engine specification.
 */
function resolveInitialVersion(): string {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_ENGINE_VERSION) {
    const envVersion = process.env.NEXT_PUBLIC_ENGINE_VERSION.trim();
    if (envVersion) return envVersion;
  }
  return DEFAULT_MATCH_ENGINE_METADATA.version;
}

let activeMetadata: MatchEngineMetadata = {
  ...DEFAULT_MATCH_ENGINE_METADATA,
  version: resolveInitialVersion(),
};

type MetadataListener = (metadata: MatchEngineMetadata) => void;
const listeners = new Set<MetadataListener>();

/**
 * Validates whether a version value represents a legitimate, non-misleading version.
 */
export function isValidEngineVersion(version: unknown): version is string {
  if (typeof version !== 'string') {
    return false;
  }
  const trimmed = version.trim();
  if (!trimmed) {
    return false;
  }
  const lower = trimmed.toLowerCase();
  if (['unknown', 'null', 'undefined', 'nan', 'n/a', 'invalid', 'none'].includes(lower)) {
    return false;
  }
  // Matches version patterns like "2.1", "v2.1", "2.1.0", "v2.1 Pro", "2.1.0-beta.1"
  return /^v?(\d+(?:\.[\w.-]+)*)(?:\s+(.+))?$/i.test(trimmed);
}

/**
 * Parses and normalizes a version string into semantic components.
 */
export function parseEngineVersion(
  rawVersion: unknown,
  defaultEdition?: string
): {
  isValid: boolean;
  normalizedVersion: string;
  effectiveEdition: string;
} {
  if (!isValidEngineVersion(rawVersion)) {
    return {
      isValid: false,
      normalizedVersion: '',
      effectiveEdition: '',
    };
  }

  const trimmed = (rawVersion as string).trim();
  const match = trimmed.match(/^v?(\d+(?:\.[\w.-]+)*)(?:\s+(.+))?$/i);
  if (!match) {
    return {
      isValid: false,
      normalizedVersion: '',
      effectiveEdition: '',
    };
  }

  const normalizedVersion = match[1];
  const inlineEdition = match[2]?.trim();
  const effectiveEdition = inlineEdition || defaultEdition?.trim() || '';

  return {
    isValid: true,
    normalizedVersion,
    effectiveEdition,
  };
}

/**
 * Returns an immutable snapshot copy of the active match engine metadata.
 */
export function getEngineMetadata(): MatchEngineMetadata {
  return { ...activeMetadata };
}

/**
 * Updates the centralized engine metadata and notifies all active UI subscribers.
 */
export function setEngineMetadata(metadata: Partial<MatchEngineMetadata>): void {
  activeMetadata = {
    ...activeMetadata,
    ...metadata,
  };
  listeners.forEach((listener) => {
    try {
      listener(activeMetadata);
    } catch (e) {
      console.warn('[EngineMetadata] Listener execution error:', e);
    }
  });
}

/**
 * Resets engine metadata back to defaults (useful for test resets).
 */
export function resetEngineMetadata(): void {
  activeMetadata = {
    ...DEFAULT_MATCH_ENGINE_METADATA,
    version: resolveInitialVersion(),
  };
  listeners.forEach((listener) => {
    try {
      listener(activeMetadata);
    } catch (e) {
      console.warn('[EngineMetadata] Listener execution error:', e);
    }
  });
}

/**
 * Subscribes to engine metadata changes. Returns unsubscribe cleanup function.
 */
export function subscribeEngineMetadata(listener: MetadataListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Returns the normalized engine version string (e.g. "2.1"), or empty string if invalid.
 */
export function getEngineVersion(): string {
  const parsed = parseEngineVersion(activeMetadata.version, activeMetadata.edition);
  return parsed.isValid ? parsed.normalizedVersion : '';
}

export interface EngineDisplayOptions {
  format?: 'full' | 'short';
  fallback?: string;
}

/**
 * Returns a formatted engine version display string for UI presentation.
 * - 'full': e.g. "v2.1 Pro"
 * - 'short': e.g. "v2.1"
 * Gracefully falls back to fallback string (default: "Unavailable") if invalid or missing.
 */
export function getEngineVersionDisplay(options?: EngineDisplayOptions): string {
  const fallback = options?.fallback ?? 'Unavailable';
  const format = options?.format ?? 'full';

  const parsed = parseEngineVersion(activeMetadata.version, activeMetadata.edition);
  if (!parsed.isValid) {
    return fallback;
  }

  if (format === 'short') {
    return `v${parsed.normalizedVersion}`;
  }

  return `v${parsed.normalizedVersion}${parsed.effectiveEdition ? ` ${parsed.effectiveEdition}` : ''}`;
}

/**
 * Returns navigation label representation, e.g. "Match Engine v2.1" or "Match Engine".
 * Handles missing/invalid versions without displaying misleading text.
 */
export function getEngineNavigationLabel(): string {
  const parsed = parseEngineVersion(activeMetadata.version, activeMetadata.edition);
  if (!parsed.isValid) {
    return activeMetadata.name || 'Match Engine';
  }
  return `${activeMetadata.name || 'Match Engine'} v${parsed.normalizedVersion}`;
}

/**
 * React Hook that provides the active formatted engine version string,
 * automatically re-rendering when the centralized engine metadata updates.
 */
export function useEngineVersion(options?: EngineDisplayOptions): string {
  const format = options?.format;
  const fallback = options?.fallback;

  const [versionDisplay, setVersionDisplay] = useState<string>(() =>
    getEngineVersionDisplay({ format, fallback })
  );

  useEffect(() => {
    setVersionDisplay(getEngineVersionDisplay({ format, fallback }));
    return subscribeEngineMetadata(() => {
      setVersionDisplay(getEngineVersionDisplay({ format, fallback }));
    });
  }, [format, fallback]);

  return versionDisplay;
}

/**
 * React Hook that provides the active navigation label string,
 * automatically re-rendering when the centralized engine metadata updates.
 */
export function useEngineNavigationLabel(): string {
  const [navLabel, setNavLabel] = useState<string>(() => getEngineNavigationLabel());

  useEffect(() => {
    setNavLabel(getEngineNavigationLabel());
    return subscribeEngineMetadata(() => {
      setNavLabel(getEngineNavigationLabel());
    });
  }, []);

  return navLabel;
}

/**
 * React Hook providing full engine metadata with reactive updates.
 */
export function useEngineMetadata(): MatchEngineMetadata {
  const [metadata, setMetadata] = useState<MatchEngineMetadata>(() => getEngineMetadata());

  useEffect(() => {
    setMetadata(getEngineMetadata());
    return subscribeEngineMetadata((newMeta) => {
      setMetadata({ ...newMeta });
    });
  }, []);

  return metadata;
}
