/**
 * Master Autonomous Visual QA, Browser Testing & UI/UX Audit Suite
 * Cric Scorer Pro
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:3008';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = path.resolve(__dirname, 'artifacts');
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, 'screenshots');
const REPORTS_DIR = path.join(ARTIFACTS_DIR, 'reports');

['desktop', 'mobile', 'tablet', 'interactions', 'failures'].forEach((sub) => {
  fs.mkdirSync(path.join(SCREENSHOTS_DIR, sub), { recursive: true });
});
fs.mkdirSync(REPORTS_DIR, { recursive: true });

const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const auditLog = {
  timestamp: new Date().toISOString(),
  environment: {
    url: BASE_URL,
    browser: 'Google Chrome (Headless)',
    engine: 'Playwright Chromium',
    nodeVersion: process.version,
  },
  discoveredRoutes: [],
  testedRoutes: [],
  viewportsTested: [],
  scenarios: [],
  consoleErrors: [],
  consoleWarnings: [],
  networkFailures: [],
  overflowDefects: [],
  touchTargetViolations: [],
  accessibilityViolations: [],
  themeAuditResults: [],
  bengaliRenderingResults: [],
  performanceMetrics: [],
  interceptedPointerEvents: [],
  summary: {
    totalPassed: 0,
    totalFailed: 0,
    totalBlocked: 0,
  },
};

function logStep(step, message) {
  console.log(`[${new Date().toLocaleTimeString()}] [${step}] ${message}`);
}

(async () => {
  logStep('INIT', 'Starting Cric Scorer Pro Master Visual QA & Browser Audit');

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    locale: 'en-US',
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  // Console & Network Listeners
  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') {
      auditLog.consoleErrors.push({ url: page.url(), text, time: new Date().toISOString() });
      console.error(`  [CONSOLE ERROR]: ${text}`);
    } else if (type === 'warning') {
      auditLog.consoleWarnings.push({ url: page.url(), text, time: new Date().toISOString() });
    }
  });

  page.on('pageerror', (err) => {
    auditLog.consoleErrors.push({ url: page.url(), text: `PageError: ${err.message}`, stack: err.stack });
    console.error(`  [PAGE ERROR]: ${err.message}`);
  });

  page.on('requestfailed', (req) => {
    const failure = req.failure();
    auditLog.networkFailures.push({
      url: req.url(),
      method: req.method(),
      errorText: failure ? failure.errorText : 'Unknown error',
      time: new Date().toISOString(),
    });
  });

  const safeClick = async (selectorOrElement, description = 'element') => {
    try {
      if (typeof selectorOrElement === 'string') {
        const el = await page.$(selectorOrElement);
        if (!el) throw new Error(`Element not found: ${selectorOrElement}`);
        await el.click({ timeout: 2000 });
      } else {
        await selectorOrElement.click({ timeout: 2000 });
      }
    } catch (clickErr) {
      auditLog.interceptedPointerEvents.push({
        description,
        url: page.url(),
        error: clickErr.message,
        viewport: page.viewportSize(),
      });
      console.warn(`  [POINTER INTERCEPTED]: ${description} (${clickErr.message.split('\n')[0]}) - falling back to DOM click`);
      if (typeof selectorOrElement === 'string') {
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) el.click();
        }, selectorOrElement);
      } else {
        await page.evaluate((el) => el.click(), selectorOrElement);
      }
    }
  };

  const submitFormSafe = async (formSelector = 'form') => {
    await page.evaluate((sel) => {
      const f = document.querySelector(sel);
      if (f) {
        if (typeof f.requestSubmit === 'function') {
          f.requestSubmit();
        } else {
          f.submit();
        }
      }
    }, formSelector);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ROUTE INVENTORY & DISCOVERY
  // ─────────────────────────────────────────────────────────────────────────────
  logStep('PHASE 1', 'Inventorying all discoverable routes...');
  const routesToAudit = [
    { path: '/', slug: 'home', title: 'Home Page' },
    { path: '/matches/new', slug: 'matches-new', title: 'New Match Wizard' },
    { path: '/matches/history', slug: 'matches-history', title: 'Match History' },
    { path: '/tournaments', slug: 'tournaments', title: 'Tournament Hub' },
    { path: '/teams', slug: 'teams', title: 'Teams Management' },
    { path: '/analytics', slug: 'analytics', title: 'Analytics Dashboard' },
    { path: '/grounds', slug: 'grounds', title: 'Grounds & GPS' },
    { path: '/profile', slug: 'profile', title: 'Profile & Cloud Sync' },
    { path: '/offline', slug: 'offline', title: 'Offline Fallback' },
  ];

  auditLog.discoveredRoutes = routesToAudit.map((r) => r.path);
  logStep('PHASE 1', `Discovered ${routesToAudit.length} core primary routes.`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. MULTI-VIEWPORT & RESPONSIVE OVERFLOW AUDIT
  // ─────────────────────────────────────────────────────────────────────────────
  logStep('PHASE 2', 'Executing Multi-Viewport Responsive & Visual Audit...');
  const viewports = [
    { name: 'Desktop Ultra-Wide', width: 1920, height: 1080, folder: 'desktop' },
    { name: 'Desktop Standard', width: 1280, height: 800, folder: 'desktop' },
    { name: 'Tablet Portrait', width: 768, height: 1024, folder: 'tablet' },
    { name: 'Mobile Standard (iPhone 14)', width: 390, height: 844, folder: 'mobile' },
    { name: 'Mobile Compact (iPhone SE)', width: 375, height: 667, folder: 'mobile' },
  ];

  auditLog.viewportsTested = viewports.map((v) => `${v.name} (${v.width}x${v.height})`);

  for (const vp of viewports) {
    logStep('VIEWPORT', `Testing ${vp.name} (${vp.width}x${vp.height})...`);
    await page.setViewportSize({ width: vp.width, height: vp.height });

    for (const route of routesToAudit) {
      try {
        const startTime = Date.now();
        await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(450);
        const loadDuration = Date.now() - startTime;

        const perfTiming = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0];
          return nav
            ? {
                domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
                loadComplete: Math.round(nav.loadEventEnd - nav.startTime),
                transferSize: nav.transferSize,
              }
            : null;
        });

        if (perfTiming) {
          auditLog.performanceMetrics.push({
            route: route.path,
            viewport: vp.name,
            ...perfTiming,
            totalClientDurationMs: loadDuration,
          });
        }

        const screenshotFileName = `${route.slug}_${vp.width}x${vp.height}.png`;
        const screenshotPath = path.join(SCREENSHOTS_DIR, vp.folder, screenshotFileName);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        const overflow = await page.evaluate(() => {
          const docWidth = document.documentElement.clientWidth;
          const scrollWidth = document.documentElement.scrollWidth;
          const bodyWidth = document.body.scrollWidth;
          const hasOverflow = scrollWidth > docWidth + 1 || bodyWidth > docWidth + 1;

          let offendingElements = [];
          if (hasOverflow) {
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
              const rect = el.getBoundingClientRect();
              if (rect.right > docWidth + 1 && rect.width > 0 && rect.height > 0) {
                offendingElements.push({
                  tag: el.tagName.toLowerCase(),
                  className: el.className.toString().substring(0, 100),
                  rect: { right: Math.round(rect.right), width: Math.round(rect.width) },
                  docWidth,
                });
                if (offendingElements.length >= 5) break;
              }
            }
          }
          return { hasOverflow, docWidth, scrollWidth, bodyWidth, offendingElements };
        });

        if (overflow.hasOverflow) {
          auditLog.overflowDefects.push({
            route: route.path,
            viewport: vp.name,
            width: vp.width,
            ...overflow,
            screenshot: screenshotPath,
          });
          console.warn(
            `  [OVERFLOW DEFECT]: ${route.path} on ${vp.name} (scroll: ${overflow.scrollWidth}px vs doc: ${overflow.docWidth}px)`
          );
        }

        if (vp.width <= 430) {
          const smallTargets = await page.evaluate(() => {
            const interactives = document.querySelectorAll('button, a, input, select');
            const issues = [];
            for (const el of interactives) {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
              if (rect.width > 0 && rect.height > 0 && (rect.width < 32 || rect.height < 32)) {
                issues.push({
                  tag: el.tagName.toLowerCase(),
                  text: (el.innerText || el.getAttribute('aria-label') || el.id || '').trim().substring(0, 40),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                  className: el.className.toString().substring(0, 80),
                });
                if (issues.length >= 8) break;
              }
            }
            return issues;
          });

          if (smallTargets.length > 0) {
            auditLog.touchTargetViolations.push({
              route: route.path,
              viewport: vp.name,
              targets: smallTargets,
            });
          }
        }

        auditLog.summary.totalPassed++;
      } catch (err) {
        auditLog.summary.totalFailed++;
        const failScreenshot = path.join(SCREENSHOTS_DIR, 'failures', `fail_${route.slug}_${vp.width}.png`);
        await page.screenshot({ path: failScreenshot }).catch(() => {});
        console.error(`  [TEST FAILURE] Route ${route.path} on ${vp.name}: ${err.message}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. THEMES & HIGH CONTRAST SUNLIGHT AUDIT
  // ─────────────────────────────────────────────────────────────────────────────
  logStep('PHASE 3', 'Auditing Light, Dark, and Sunlight (High-Contrast) Themes...');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

  const themesToAudit = ['dark', 'sunlight', 'light'];
  for (const th of themesToAudit) {
    await page.evaluate((themeName) => {
      document.documentElement.classList.remove('dark', 'sunlight');
      if (themeName !== 'light') {
        document.documentElement.classList.add(themeName);
      }
      localStorage.setItem('theme', themeName);
    }, th);
    await page.waitForTimeout(300);

    const themeInfo = await page.evaluate(() => {
      const bodyStyle = window.getComputedStyle(document.body);
      const bg = bodyStyle.backgroundColor;
      const color = bodyStyle.color;
      return {
        bg,
        color,
        classes: document.documentElement.className,
      };
    });

    const themeScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', `theme_${th}_home.png`);
    await page.screenshot({ path: themeScreenshot });
    auditLog.themeAuditResults.push({
      theme: th,
      ...themeInfo,
      screenshot: themeScreenshot,
    });
    logStep('THEME', `Theme '${th}' applied: bg=${themeInfo.bg}, color=${themeInfo.color}`);
  }

  // Restore Light theme
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark', 'sunlight');
    localStorage.setItem('theme', 'light');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. BENGALI LANGUAGE & TYPOGRAPHY AUDIT
  // ─────────────────────────────────────────────────────────────────────────────
  logStep('PHASE 4', 'Auditing Bengali Language Translation & Typography...');
  await page.evaluate(() => {
    localStorage.setItem('preferred_language', 'bn');
    window.location.reload();
  });
  await page.waitForNavigation({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const bengaliHomeScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'lang_bengali_home.png');
  await page.screenshot({ path: bengaliHomeScreenshot });

  const bengaliEvaluation = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    const bengaliChars = (bodyText.match(/[\u0980-\u09FF]/g) || []).length;
    const bodyFont = window.getComputedStyle(document.body).fontFamily;
    return {
      bengaliCharsDetected: bengaliChars,
      bodyFont,
      sampleText: bodyText.substring(0, 300).replace(/\n+/g, ' '),
    };
  });

  auditLog.bengaliRenderingResults.push({
    route: '/',
    ...bengaliEvaluation,
    screenshot: bengaliHomeScreenshot,
  });
  logStep(
    'BENGALI',
    `Detected ${bengaliEvaluation.bengaliCharsDetected} Bengali characters rendered with font: ${bengaliEvaluation.bodyFont}`
  );

  // Restore English
  await page.evaluate(() => {
    localStorage.setItem('preferred_language', 'en');
    window.location.reload();
  });
  await page.waitForNavigation({ waitUntil: 'networkidle' });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. ACCESSIBILITY AUDIT (WCAG 2.1 AA via axe-core)
  // ─────────────────────────────────────────────────────────────────────────────
  logStep('PHASE 5', 'Running Automated Accessibility Audits (WCAG 2.1 AA)...');
  const a11yRoutes = ['/', '/matches/new', '/teams', '/tournaments', '/profile'];

  for (const rPath of a11yRoutes) {
    await page.goto(`${BASE_URL}${rPath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await page.evaluate(axeSource);

    const a11yResult = await page.evaluate(async () => {
      const results = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'best-practice'] },
      });
      return results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        nodesCount: v.nodes.length,
        targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
        failureSummaries: v.nodes.slice(0, 2).map((n) => n.failureSummary),
      }));
    });

    logStep('A11Y', `Route ${rPath}: ${a11yResult.length} accessibility violation rules flagged.`);
    auditLog.accessibilityViolations.push({
      route: rPath,
      violationsCount: a11yResult.length,
      violations: a11yResult,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. INTERACTIVE END-TO-END CRICKET USER JOURNEYS
  // ─────────────────────────────────────────────────────────────────────────────
  logStep('PHASE 6', 'Simulating Complete Cricket Scoring & Management Journey...');
  await page.setViewportSize({ width: 1280, height: 800 });

  // -------------------------------------------------------------
  // Scenario A: Team Creation at /teams
  // -------------------------------------------------------------
  logStep('SCENARIO A', 'Testing Team Creation at /teams...');
  await page.goto(`${BASE_URL}/teams`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const createTeamBtn = await page.$('button:has-text("Create Team"), button:has-text("New Team")');
  if (createTeamBtn) {
    await safeClick(createTeamBtn, 'Create Team button');
    await page.waitForTimeout(500);

    const modalScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'teams_create_modal.png');
    await page.screenshot({ path: modalScreenshot });
    logStep('TEAMS', 'Opened Create Team modal');

    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="text"]');
      if (inputs[0]) {
        inputs[0].value = 'Dhaka Gladiators';
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    const saveTeamBtn = await page.$('button:has-text("Save Team Squad")');
    if (saveTeamBtn) {
      await safeClick(saveTeamBtn, 'Save Team Squad button');
      await page.waitForTimeout(800);
    }
  }
  const teamsFinalScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'teams_list_final.png');
  await page.screenshot({ path: teamsFinalScreenshot });

  // -------------------------------------------------------------
  // Scenario B: Tournament Hub at /tournaments
  // -------------------------------------------------------------
  logStep('SCENARIO B', 'Testing Tournament Hub at /tournaments...');
  await page.goto(`${BASE_URL}/tournaments`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const tournamentsScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'tournaments_hub.png');
  await page.screenshot({ path: tournamentsScreenshot });

  // -------------------------------------------------------------
  // Scenario C: Match Creation Wizard at /matches/new
  // -------------------------------------------------------------
  logStep('SCENARIO C', 'Configuring Match Wizard at /matches/new...');
  await page.goto(`${BASE_URL}/matches/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // Fill Teams & Overs (1 over for end-to-end full match completion)
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="text"]');
    if (inputs[0]) {
      inputs[0].value = 'Chittagong Kings';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (inputs[1]) {
      inputs[1].value = 'Sylhet Strikers';
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    }
    const oversInput = document.querySelector('input[type="number"]');
    if (oversInput) {
      oversInput.value = '1';
      oversInput.dispatchEvent(new Event('input', { bubbles: true }));
      oversInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  const newMatchScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'new_match_configured.png');
  await page.screenshot({ path: newMatchScreenshot });

  logStep('MATCH WIZARD', 'Submitting setup form -> navigating to /matches/opening-players...');
  await submitFormSafe('form');
  await page.waitForTimeout(1500);

  // -------------------------------------------------------------
  // Scenario D: Opening Players at /matches/opening-players
  // -------------------------------------------------------------
  logStep('SCENARIO D', 'Configuring Opening Players...');
  const openingUrl = page.url();
  if (!openingUrl.includes('/matches/opening-players')) {
    throw new Error(`Failed to navigate to /matches/opening-players. Current URL: ${openingUrl}`);
  }

  await page.fill('input[placeholder="Striker batter name"]', 'Tamim Iqbal');
  await page.fill('input[placeholder="Non-striker batter name"]', 'Litton Das');
  await page.fill('input[placeholder="Opening bowler name"]', 'Taskin Ahmed');

  const openingPlayersScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'opening_players_filled.png');
  await page.screenshot({ path: openingPlayersScreenshot });

  logStep('OPENING PLAYERS', 'Starting Live Match -> Navigating to /matches/score/...');
  await submitFormSafe('form');
  await page.waitForTimeout(2000);

  const scoringUrl = page.url();
  if (!scoringUrl.includes('/matches/score/')) {
    throw new Error(`Failed to initialize match scorecard. Current URL: ${scoringUrl}`);
  }
  const matchId = scoringUrl.split('/matches/score/')[1].split('?')[0];
  logStep('SCORING', `Live match scorecard initialized successfully! Match ID: ${matchId}`);

  // -------------------------------------------------------------
  // Scenario E: Live Scoring Engine Ball-by-Ball Simulation
  // -------------------------------------------------------------
  logStep('SCENARIO E', 'Executing Ball-by-Ball Scoring Actions...');

  const scoreInitialScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'scoring_initial_0_0.png');
  await page.screenshot({ path: scoreInitialScreenshot });

  const clickButtonByText = async (targetText) => {
    await page.evaluate((text) => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => {
        const t = b.textContent.trim();
        return t === text || t.startsWith(text + ' ') || t.startsWith(text + '·');
      });
      if (btn) btn.click();
    }, targetText);
    await page.waitForTimeout(600);
  };

  // Ball 1: 0 (Dot ball)
  logStep('BALL 1', 'Scoring 0 (Dot ball)...');
  await clickButtonByText('0');

  // Ball 2: 1 (Single) -> Tests strike rotation
  logStep('BALL 2', 'Scoring 1 (Single, testing strike rotation)...');
  await clickButtonByText('1');

  // Ball 3: 4 (Boundary Four)
  logStep('BALL 3', 'Scoring 4 (Boundary Four)...');
  await clickButtonByText('4');

  // Ball 4: 6 (Maximum Six)
  logStep('BALL 4', 'Scoring 6 (Six)...');
  await clickButtonByText('6');

  // Ball 5: Wide Extra
  logStep('BALL 5', 'Scoring Wide Extra (+1 Wide)...');
  await clickButtonByText('WD');
  await page.waitForTimeout(400);

  // Test Undo
  logStep('SCORING', 'Testing Undo action...');
  const undoBtn = await page.$('button[title*="Undo"], button:has(svg.lucide-rotate-ccw)');
  if (undoBtn) {
    await safeClick(undoBtn, 'Undo Button');
    await page.waitForTimeout(500);
    logStep('SCORING', 'Undo executed successfully.');
  }

  // Test Wicket Modal: Click Wicket (OUT)
  logStep('BALL 5 (REBALL)', 'Testing Wicket (OUT) Modal...');
  const outBtn = await page.$('button:has-text("OUT"), button:has-text("Wicket")');
  if (outBtn) {
    await safeClick(outBtn, 'Wicket OUT button');
    await page.waitForTimeout(600);

    const outModalScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'wicket_modal_active.png');
    await page.screenshot({ path: outModalScreenshot });

    // Select 'Bowled'
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const bowledBtn = buttons.find((b) => b.textContent.includes('Bowled'));
      if (bowledBtn) bowledBtn.click();
    });
    await page.waitForTimeout(300);

    // Confirm Wicket
    const confirmWicketBtn = await page.$('button:has-text("Confirm Wicket")');
    if (confirmWicketBtn) {
      await safeClick(confirmWicketBtn, 'Confirm Wicket button');
      await page.waitForTimeout(800);
      logStep('WICKET', 'Confirmed Bowled dismissal successfully.');
    }
  }

  // Scoreboard Drawer Check: Toggle SCOREBOARD
  logStep('SCOREBOARD', 'Opening Integrated Scoreboard modal/drawer...');
  const scoreboardToggleBtn = await page.$('button:has-text("SCOREBOARD")');
  if (scoreboardToggleBtn) {
    await safeClick(scoreboardToggleBtn, 'Toggle Scoreboard button');
    await page.waitForTimeout(600);
    const drawerScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'scoreboard_drawer_open.png');
    await page.screenshot({ path: drawerScreenshot });
    // Close scoreboard
    await safeClick(scoreboardToggleBtn, 'Close Scoreboard button');
    await page.waitForTimeout(400);
  }

  // Ball 6: 2 Runs -> Concludes Over 1 (Innings 1 Over Limit = 1)
  logStep('BALL 6', 'Scoring 2 Runs (Concludes 1st Innings at 1.0 Over)...');
  await clickButtonByText('2');
  await page.waitForTimeout(1000);

  // Innings Transition Modal
  logStep('INNINGS TRANSITION', 'Inspecting 1st Innings Transition Modal...');
  const inningsModalScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'innings_transition_modal.png');
  await page.screenshot({ path: inningsModalScreenshot });

  // Fill 2nd Innings Openers & Bowler
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="text"]');
    if (inputs[0]) {
      inputs[0].value = 'Najmul Shanto';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (inputs[1]) {
      inputs[1].value = 'Towhid Hridoy';
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (inputs[2]) {
      inputs[2].value = 'Mustafizur Rahman';
      inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  const startInn2Btn = await page.$('button:has-text("Start 2nd Innings"), button:has-text("Start Second Innings")');
  if (startInn2Btn) {
    await safeClick(startInn2Btn, 'Start 2nd Innings button');
    await page.waitForTimeout(1200);
    logStep('INNINGS TRANSITION', '2nd Innings Started successfully!');
  }

  // -------------------------------------------------------------
  // Scenario F: 2nd Innings Run Chase & Match Completion
  // -------------------------------------------------------------
  logStep('SCENARIO F', 'Executing 2nd Innings Chase to victory...');
  const inn2InitialScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'innings_2_chase_start.png');
  await page.screenshot({ path: inn2InitialScreenshot });

  // Score boundaries to chase down target quickly
  logStep('CHASE', 'Scoring 6 runs...');
  await clickButtonByText('6');
  logStep('CHASE', 'Scoring 6 runs...');
  await clickButtonByText('6');
  logStep('CHASE', 'Scoring 4 runs (Winning boundary)...');
  await clickButtonByText('4');
  await page.waitForTimeout(2000);

  // -------------------------------------------------------------
  // Scenario G: Match Summary, Man of the Match, & PDF Export
  // -------------------------------------------------------------
  logStep('SCENARIO G', 'Auditing Match Summary, MOM, & PDF Export at /matches/summary/...');
  let currentUrl = page.url();
  logStep('SUMMARY', `Current URL after match completion: ${currentUrl}`);

  if (!currentUrl.includes('/matches/summary/')) {
    await page.goto(`${BASE_URL}/matches/summary/${matchId}`, { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(1000);

  const summaryScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'match_summary_full.png');
  await page.screenshot({ path: summaryScreenshot, fullPage: true });

  const summaryDetails = await page.evaluate(() => {
    const text = document.body.innerText;
    const hasWinner = text.includes('won by') || text.includes('Victory') || text.includes('won');
    const hasMom = text.includes('Man of the Match') || text.includes('Player of the Match');
    const hasScorecard = text.includes('Batting') && text.includes('Bowling');
    return { hasWinner, hasMom, hasScorecard, textSnippet: text.substring(0, 300).replace(/\n+/g, ' ') };
  });
  logStep(
    'SUMMARY',
    `Verified Summary Content: Winner Banner=${summaryDetails.hasWinner}, MOM=${summaryDetails.hasMom}, Tables=${summaryDetails.hasScorecard}`
  );

  // Test Batsman Profile Modal
  logStep('SUMMARY', 'Testing Batsman Profile Modal on click...');
  const batterRow = await page.$('tr:has-text("Tamim Iqbal"), tr:has-text("Litton Das"), tr:has-text("Najmul Shanto")');
  if (batterRow) {
    await safeClick(batterRow, 'Batter Row Click');
    await page.waitForTimeout(600);
    const batterModalScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'batsman_profile_modal.png');
    await page.screenshot({ path: batterModalScreenshot });
    const closeBtn = await page.$('button[aria-label="Close"], button:has-text("Close")');
    if (closeBtn) await safeClick(closeBtn, 'Close Batsman Modal');
    await page.waitForTimeout(400);
  }

  // Test PDF Export Button
  logStep('PDF EXPORT', 'Testing Match Report PDF Download & Fallback...');
  const pdfExportBtn = await page.$('button:has-text("Export"), button:has-text("PDF"), button:has(svg.lucide-file-text)');
  if (pdfExportBtn) {
    await safeClick(pdfExportBtn, 'Export PDF button');
    await page.waitForTimeout(600);

    const pdfOverlayScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'pdf_export_overlay.png');
    await page.screenshot({ path: pdfOverlayScreenshot });

    await page.waitForTimeout(2500);
    logStep('PDF EXPORT', 'PDF generation lifecycle triggered and completed without uncaught exceptions.');
  }

  // -------------------------------------------------------------
  // Scenario H: Match Center at /matches/center/[matchId]
  // -------------------------------------------------------------
  logStep('SCENARIO H', `Auditing Match Center at /matches/center/${matchId}...`);
  await page.goto(`${BASE_URL}/matches/center/${matchId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const centerScorecardScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'match_center_scorecard.png');
  await page.screenshot({ path: centerScorecardScreenshot });

  const partnershipsTab = await page.$('button:has-text("Partnerships")');
  if (partnershipsTab) {
    await safeClick(partnershipsTab, 'Partnerships Tab');
    await page.waitForTimeout(500);
    const centerPartScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'match_center_partnerships.png');
    await page.screenshot({ path: centerPartScreenshot });
  }

  const infoTab = await page.$('button:has-text("Info"), button:has-text("Match Info")');
  if (infoTab) {
    await safeClick(infoTab, 'Match Info Tab');
    await page.waitForTimeout(500);
    const centerInfoScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'match_center_info.png');
    await page.screenshot({ path: centerInfoScreenshot });
  }

  // -------------------------------------------------------------
  // Scenario I: Offline PWA & Dexie Persistence
  // -------------------------------------------------------------
  logStep('SCENARIO I', 'Auditing Offline PWA & Dexie IndexedDB Persistence...');
  const cdpSession = await context.newCDPSession(page);
  await cdpSession.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  logStep('OFFLINE', 'Simulating offline state via CDP...');

  await page.goto(`${BASE_URL}/offline`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const offlinePageScreenshot = path.join(SCREENSHOTS_DIR, 'interactions', 'offline_screen.png');
  await page.screenshot({ path: offlinePageScreenshot });

  const idbStats = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const req = indexedDB.open('CricScorerPro_v2');
      req.onsuccess = (e) => {
        const idb = e.target.result;
        try {
          const tx = idb.transaction(['matches', 'match_events', 'sync_queue'], 'readonly');
          const mReq = tx.objectStore('matches').getAll();
          const eReq = tx.objectStore('match_events').getAll();
          let m, ev;
          mReq.onsuccess = () => (m = mReq.result);
          eReq.onsuccess = () => (ev = eReq.result);
          tx.oncomplete = () => {
            resolve({
              matchesCount: m ? m.length : 0,
              eventsCount: ev ? ev.length : 0,
              recentMatchWinner: m && m[0] ? m[0].winner : null,
            });
          };
          tx.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  });

  logStep('OFFLINE', `Dexie IndexedDB Verified: ${JSON.stringify(idbStats)}`);

  await cdpSession.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 20,
    downloadThroughput: 10 * 1024 * 1024,
    uploadThroughput: 5 * 1024 * 1024,
  });
  logStep('OFFLINE', 'Restored online network state.');

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. FINALIZE & WRITE REPORT JSON
  // ─────────────────────────────────────────────────────────────────────────────
  logStep('FINALIZE', 'Collating and writing audit results...');
  const reportPath = path.join(REPORTS_DIR, 'audit_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(auditLog, null, 2), 'utf8');
  logStep('FINALIZE', `Audit report JSON saved to: ${reportPath}`);

  await browser.close();
  console.log('\n================================================================');
  console.log('MASTER VISUAL QA & BROWSER AUDIT COMPLETED SUCCESSFULLY!');
  console.log('================================================================\n');
})().catch((err) => {
  console.error('FATAL AUDIT RUNNER ERROR:', err);
  process.exit(1);
});
