/**
 * puppeteerBrowser.ts
 * Cross-platform browser launcher for server-side vector PDF generation.
 */

import fs from 'fs';

export async function resolveChromeExecutablePath(): Promise<string | undefined> {
  // 1. Explicit environment variable
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // 2. Common Windows paths
  const windowsPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ];
  for (const p of windowsPaths) {
    if (fs.existsSync(p)) return p;
  }

  // 3. Common Linux / Unix paths
  const unixPaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const p of unixPaths) {
    if (fs.existsSync(p)) return p;
  }

  // 4. Fallback to puppeteer bundled cache if present
  try {
    const puppeteer = await import('puppeteer');
    if (typeof puppeteer.executablePath === 'function') {
      const p = await puppeteer.executablePath();
      if (p && fs.existsSync(p)) return p;
    }
  } catch {
    // Ignore and return undefined
  }

  return undefined;
}

export async function launchPdfBrowser() {
  const executablePath = await resolveChromeExecutablePath();
  const puppeteer = await import('puppeteer-core');

  return await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  });
}
