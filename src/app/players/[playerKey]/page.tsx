import React from 'react';
import PlayerProfilePage from './client';

/**
 * Server wrapper (Capacitor Phase 1): see the score route's
 * wrapper for the full rationale. Emits the '_' placeholder shell
 * for the static export; the real key is recovered after mount by
 * useShellRouteParam. Web behaviour unchanged (dynamicParams
 * defaults to true).
 */
export function generateStaticParams() {
  return [{ playerKey: '_' }];
}

export default function Page() {
  return <PlayerProfilePage />;
}
