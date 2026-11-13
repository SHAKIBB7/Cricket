import React from 'react';
import TournamentDetailPage from './client';

/**
 * Server wrapper (Capacitor Phase 1): see the score route's
 * wrapper for the full rationale. Emits the '_' placeholder shell
 * for the static export; the real id is recovered after mount by
 * useShellRouteParam. Web behaviour unchanged (dynamicParams
 * defaults to true).
 */
export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function Page() {
  return <TournamentDetailPage />;
}
