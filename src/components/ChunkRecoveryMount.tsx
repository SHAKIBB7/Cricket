'use client';

import { useEffect } from 'react';
import { installChunkRecovery } from '@/lib/chunk-recovery';

/**
 * Mounts the deploy version-skew recovery guard exactly once.
 * Renders nothing. If a stale build's chunk loads fail after a
 * new deploy, the guard reloads the page into the fresh shell
 * (see src/lib/chunk-recovery.ts).
 */
export function ChunkRecoveryMount() {
  useEffect(() => installChunkRecovery(), []);
  return null;
}
