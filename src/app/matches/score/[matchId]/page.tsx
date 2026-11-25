import React from 'react';
import LiveScoringPage from './client';

/**
 * Server wrapper (Capacitor Phase 1): the page itself is a client
 * component (client.tsx); this wrapper exists so the static export
 * can emit ONE placeholder shell for this dynamic route. The dummy
 * param '_' is what the shell's flight data freezes in — the real
 * id is recovered after mount by useShellRouteParam. On the web
 * build dynamicParams keeps its default (true), so behaviour is
 * identical to the previous single-file page.
 */
export function generateStaticParams() {
  return [{ matchId: '_' }];
}

export default function Page() {
  return <LiveScoringPage />;
}
