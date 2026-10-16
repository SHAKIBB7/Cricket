/**
 * puppeteerBrowser.ts
 * Cross-platform browser launcher and lifecycle manager for server-side vector PDF generation.
 * Supports local development, CI (Linux/Ubuntu), macOS, and Windows without hardcoded paths.
 */

import fs from 'fs';
import path from 'path';

export const DEFAULT_BROWSER_ARGS: string[] = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--font-render-hinting=none',
  '--remote-allow-origins=*',
];

/**
 * Searches the Puppeteer local cache directory for any installed browser executables.
 */
function findPuppeteerCacheExecutables(): string[] {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (!home) return [];

  const cacheBase = path.join(home, '.cache', 'puppeteer');
  if (!fs.existsSync(cacheBase)) return [];

  const results: string[] = [];
  function scan(dir: string, depth = 0) {
    if (depth > 5) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full, depth + 1);
        } else if (entry.isFile()) {
          const lower = entry.name.toLowerCase();
          if (
            lower === 'chrome-headless-shell.exe' ||
            lower === 'chrome.exe' ||
            lower === 'chromium.exe' ||
            lower === 'chrome-headless-shell' ||
            lower === 'chrome' ||
            lower === 'chromium'
          ) {
            results.push(full);
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  scan(cacheBase);
  // Prioritize headless shell over standard chrome in cache
  return results.sort((a, b) => {
    const aIsShell = a.includes('chrome-headless-shell');
    const bIsShell = b.includes('chrome-headless-shell');
    if (aIsShell && !bIsShell) return -1;
    if (!aIsShell && bIsShell) return 1;
    return 0;
  });
}

/**
 * Resolves a valid Chrome/Chromium executable path dynamically across platforms.
 * Priority:
 * 1. Environment variables: PUPPETEER_EXECUTABLE_PATH, CHROME_PATH, CHROMIUM_PATH
 * 2. Puppeteer cached browser binaries (.cache/puppeteer)
 * 3. Linux/Unix standard distribution binaries
 * 4. macOS standard application bundles
 * 5. Windows environment-driven application paths (LOCALAPPDATA, PROGRAMFILES)
 */
export async function resolveChromeExecutablePath(): Promise<string | undefined> {
  // 1. Explicit environment variables
  const envCandidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
  ].filter((p): p is string => Boolean(p && fs.existsSync(p)));

  if (envCandidates.length > 0) {
    return envCandidates[0];
  }

  // 2. Puppeteer cache search
  const cacheCandidates = findPuppeteerCacheExecutables();
  if (cacheCandidates.length > 0) {
    return cacheCandidates[0];
  }

  // 3. Bundled puppeteer.executablePath() check
  try {
    const puppeteer = await import('puppeteer');
    if (typeof puppeteer.executablePath === 'function') {
      const p = await puppeteer.executablePath();
      if (p && fs.existsSync(p)) return p;
    }
  } catch {
    // Ignore and proceed to system candidates
  }

  // 4. Linux / Unix candidates
  const unixPaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
  for (const p of unixPaths) {
    if (fs.existsSync(p)) return p;
  }

  // 5. macOS candidates
  const macPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  for (const p of macPaths) {
    if (fs.existsSync(p)) return p;
  }

  // 6. Windows candidates (dynamically resolved from environment variables, no hardcoded drive letter)
  const winRoots = [
    process.env.LOCALAPPDATA,
    process.env.PROGRAMFILES,
    process.env['PROGRAMFILES(X86)'],
  ].filter((r): r is string => Boolean(r));

  for (const root of winRoots) {
    const chrome = path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe');
    if (fs.existsSync(chrome)) return chrome;

    const edge = path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
    if (fs.existsSync(edge)) return edge;
  }

  return undefined;
}

/**
 * Launches a standalone Chromium/Chrome browser instance.
 * Automatically tries multiple launch strategies for full cross-platform resilience.
 */
export async function launchPdfBrowser(options: Record<string, any> = {}): Promise<any> {
  const executablePath = options.executablePath || (await resolveChromeExecutablePath());
  const args = [...DEFAULT_BROWSER_ARGS, ...(options.args || [])];

  // Try importing full 'puppeteer' first
  try {
    const puppeteer = await import('puppeteer');

    // Strategy A: If explicit executable was resolved, launch with it
    if (executablePath && fs.existsSync(executablePath)) {
      try {
        return await puppeteer.launch({
          executablePath,
          headless: true,
          args,
          ...options,
        });
      } catch (err: any) {
        console.warn(`[puppeteerBrowser] Launch with executablePath (${executablePath}) failed:`, err?.message);
      }
    }

    // Strategy B: Launch with Puppeteer's headless shell
    try {
      return await puppeteer.launch({
        headless: 'shell' as any,
        args,
        ...options,
      });
    } catch {
      // Strategy C: Standard headless
      try {
        return await puppeteer.launch({
          headless: true,
          args,
          ...options,
        });
      } catch {
        // Strategy D: Channel 'chrome'
        return await puppeteer.launch({
          channel: 'chrome' as any,
          headless: true,
          args,
          ...options,
        });
      }
    }
  } catch {
    // Fallback: try 'puppeteer-core' if 'puppeteer' is not available
    const puppeteerCore = await import('puppeteer-core');
    if (!executablePath) {
      throw new Error(
        'Chrome/Chromium executable not found. Please install Chrome, Chromium, or set PUPPETEER_EXECUTABLE_PATH.'
      );
    }
    return await puppeteerCore.launch({
      executablePath,
      headless: true,
      args,
      ...options,
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton Browser Lifecycle & Reusable PDF Renderer
// ---------------------------------------------------------------------------

let sharedBrowser: any = null;
let browserInitPromise: Promise<any> | null = null;

/**
 * Returns a cached, active browser instance, launching one if necessary.
 * Thread-safe with promise deduplication to prevent redundant concurrent launches.
 */
export async function getPdfBrowser(): Promise<any> {
  if (sharedBrowser && typeof sharedBrowser.isConnected === 'function' && sharedBrowser.isConnected()) {
    return sharedBrowser;
  }

  if (browserInitPromise) {
    return await browserInitPromise;
  }

  browserInitPromise = (async () => {
    try {
      sharedBrowser = await launchPdfBrowser();
      return sharedBrowser;
    } finally {
      browserInitPromise = null;
    }
  })();

  return await browserInitPromise;
}

/**
 * Renders an HTML document to an A4 vector PDF buffer with guaranteed font shaping.
 * Reuses the singleton browser instance, opens an isolated page, and cleans it up in a finally block.
 */
export async function renderPdfFromHtml(html: string): Promise<Uint8Array> {
  const browser = await getPdfBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    // Guarantee that embedded Noto Sans Bengali font glyphs & ligatures are ready
    await page.evaluateHandle('document.fonts.ready');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    return pdfBuffer;
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Closes the shared browser instance and releases all resources cleanly.
 */
export async function closePdfBrowser(): Promise<void> {
  if (sharedBrowser) {
    try {
      if (typeof sharedBrowser.isConnected === 'function' && sharedBrowser.isConnected()) {
        await sharedBrowser.close();
      }
    } catch {
      // Ignore errors on shutdown
    } finally {
      sharedBrowser = null;
      browserInitPromise = null;
    }
  }
}

// Automatic cleanup on process termination to prevent zombie browser processes
if (typeof process !== 'undefined') {
  const cleanup = () => {
    if (sharedBrowser) {
      try {
        sharedBrowser.process()?.kill();
      } catch {}
      sharedBrowser = null;
    }
  };
  process.once('exit', cleanup);
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
}
