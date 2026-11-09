'use client';

import { useEffect } from 'react';
import { installErrorHandlers } from '@/lib/errorReporter';

/**
 * Mounts the in-house error monitoring handlers exactly once.
 * Renders nothing. The coordinator wires this into the root
 * layout next to <AppToastHost />.
 */
export function ErrorReporterMount() {
  useEffect(() => {
    installErrorHandlers();
  }, []);
  return null;
}
