import React from 'react';
import LiveMatchPage from './client';

/**
 * Server wrapper (Capacitor static export): emits the `_` placeholder
 * shell; the real match id is recovered after mount by
 * useShellRouteParam. Web behaviour unchanged. See the players
 * route's wrapper for the full rationale.
 */
export function generateStaticParams() {
  return [{ matchId: '_' }];
}

export default function Page() {
  return <LiveMatchPage />;
}
