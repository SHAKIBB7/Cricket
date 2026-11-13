import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor shell config (Phase 1). The app is the static export
 * in out/ (npm run build:shell). applicationId + display name were
 * confirmed by TAIMUR for the test build (2026-11-13); both stay
 * changeable until the first store publish.
 *
 * server.errorPath: when the shell's local server cannot resolve
 * a path (every dynamic-route URL with a real id — only '_'
 * placeholder shells exist as files), the WebView is sent to
 * 404.html, the exported not-found page, whose redirector maps
 * the path to its placeholder shell and preserves the real path
 * for useShellRouteParam to recover the id after mount.
 */
const config: CapacitorConfig = {
  appId: 'com.shakibb7.cricscorerpro',
  appName: 'Cricket Scorer Pro',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    errorPath: '404.html',
  },
};

export default config;
