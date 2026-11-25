import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Android shell nav-overlap fix (TAIMUR on-device report, 2026-11-25):
 * in the Capacitor APK the floating bottom nav overlapped page text.
 * Android WebView reports env(safe-area-inset-bottom) as 0, so the
 * iOS-tuned offsets alone are not enough inside the shell. The fix is
 * three layers, all shell-scoped so the live PWA is untouched:
 *  1. Navigation marks <html data-native-shell="true"> post-mount when
 *     an embedded WebView is detected (hydration-safe).
 *  2. globals.css gives the pill a guaranteed bottom floor and page
 *     content (.pb-safe) enough bottom room to always clear it.
 *  3. MainActivity applies the system-bar insets as padding on the
 *     WebView so web content can never slide under the gesture bar.
 */
describe('Android shell bottom-nav clearance', () => {
  const navSrc = fs.readFileSync(
    path.resolve(__dirname, '../components/layout/Navigation.tsx'),
    'utf-8',
  );
  const cssSrc = fs.readFileSync(
    path.resolve(__dirname, '../app/globals.css'),
    'utf-8',
  );
  const mainActivitySrc = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../android/app/src/main/java/com/shakibb7/cricscorerpro/MainActivity.java',
    ),
    'utf-8',
  );
  const buildGradleSrc = fs.readFileSync(
    path.resolve(__dirname, '../../android/app/build.gradle'),
    'utf-8',
  );

  it('marks the document as native shell only from a post-mount effect', () => {
    expect(navSrc).toContain("import { isEmbeddedWebView } from '@/lib/platform';");
    expect(navSrc).toContain("document.documentElement.dataset.nativeShell = 'true';");
    expect(navSrc).toContain('if (isEmbeddedWebView()) {');
  });

  it('lifts the pill and deepens content clearance inside the shell only', () => {
    expect(cssSrc).toContain(
      "html[data-native-shell='true'] nav[aria-label='Cricket Navigation'] {",
    );
    expect(cssSrc).toContain(
      'bottom: max(0.85rem, calc(env(safe-area-inset-bottom, 0px) * 0.65 + 0.5rem));',
    );
    expect(cssSrc).toContain("html[data-native-shell='true'] .pb-safe {");
    expect(cssSrc).toContain(
      'padding-bottom: max(2.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.75rem));',
    );
    // The PWA defaults stay exactly as they were.
    expect(cssSrc).toContain(
      '.pb-safe {\n  padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));\n}',
    );
  });

  it('keeps the WebView clear of the system bars natively', () => {
    expect(mainActivitySrc).toContain('ViewCompat.setOnApplyWindowInsetsListener');
    expect(mainActivitySrc).toContain('WindowInsetsCompat.Type.systemBars()');
    expect(mainActivitySrc).toContain('WindowInsetsCompat.Type.displayCutout()');
    expect(mainActivitySrc).toContain(
      'view.setPadding(bars.left, bars.top, bars.right, bars.bottom);',
    );
  });

  it('signs the release build with the debug key for device testing', () => {
    expect(buildGradleSrc).toContain('signingConfig signingConfigs.debug');
  });
});
