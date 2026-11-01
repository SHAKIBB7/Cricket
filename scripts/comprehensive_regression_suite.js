const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3008';
const SCREENSHOT_DIR = path.resolve(__dirname, '../artifacts/screenshots/after');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: '320x700_mobile_small', width: 320, height: 700, isDesktop: false },
  { name: '390x844_mobile_modern', width: 390, height: 844, isDesktop: false },
  { name: '768x1024_tablet', width: 768, height: 1024, isDesktop: true },
  { name: '1280x720_desktop_720p', width: 1280, height: 720, isDesktop: true },
  { name: '1366x768_desktop_laptop', width: 1366, height: 768, isDesktop: true },
  { name: '1440x900_desktop_macbook', width: 1440, height: 900, isDesktop: true },
  { name: '1920x1080_desktop_fhd', width: 1920, height: 1080, isDesktop: true },
];

const TEST_MATCH_ID = 'match-desktop-test-99';

// Setup mock match in Dexie so match-dependent routes work seamlessly
async function seedMatch(page) {
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle2' });
  await page.evaluate(async (mId) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('CricScorerPro_v2');
      req.onsuccess = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('matches')) {
          return resolve();
        }
        const tx = db.transaction(['matches'], 'readwrite');
        const store = tx.objectStore('matches');
        const matchData = {
          id: mId,
          title: 'Titans vs Warriors Final',
          teamA: 'Titans',
          teamB: 'Warriors',
          teamASquad: ['Player 1', 'Player 2', 'Player 3', 'Player 4'],
          teamBSquad: ['Player A', 'Player B', 'Player C', 'Player D'],
          tossWinner: 'Titans',
          tossDecision: 'bat',
          overs: 5,
          totalOvers: 5,
          ballsPerOver: 6,
          status: 'ONGOING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          venue: 'Lord\'s Cricket Ground',
          currentInnings: 1,
          innings: [
            {
              inningsNumber: 1,
              battingTeam: 'Titans',
              bowlingTeam: 'Warriors',
              runs: 48,
              wickets: 1,
              overs: 3.2,
              balls: 20,
              extras: { wides: 2, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
              striker: 'Player 1',
              nonStriker: 'Player 2',
              bowler: 'Player A',
              recentBalls: [
                { runs: 1, isWicket: false, isFour: false, isSix: false },
                { runs: 4, isWicket: false, isFour: true, isSix: false },
                { runs: 0, isWicket: true, isFour: false, isSix: false },
                { runs: 6, isWicket: false, isFour: false, isSix: true },
              ],
              batsmen: [
                { id: 'p1', name: 'Player 1', runs: 28, balls: 14, fours: 3, sixes: 1, isStriker: true, isOut: false },
                { id: 'p2', name: 'Player 2', runs: 12, balls: 6, fours: 1, sixes: 0, isStriker: false, isOut: false },
              ],
              bowlers: [
                { id: 'b1', name: 'Player A', overs: 1.2, maidens: 0, runs: 18, wickets: 1 },
              ],
            },
          ],
        };
        store.put(matchData);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, TEST_MATCH_ID);
}

// In-page layout overlap and collision detector
async function inspectPageLayout(page) {
  return await page.evaluate(() => {
    const docScrollWidth = document.documentElement.scrollWidth;
    const docClientWidth = document.documentElement.clientWidth;
    const windowInnerWidth = window.innerWidth;
    const hasHorizontalOverflow = docScrollWidth > windowInnerWidth + 1; // 1px threshold for sub-pixel anti-aliasing

    // Bottom nav detection
    const bNav = document.querySelector('nav[aria-label="Cricket Navigation"]');
    let bNavVisible = false;
    let bNavDebug = null;
    if (bNav) {
      const style = window.getComputedStyle(bNav);
      bNavVisible = style.display !== 'none' && style.visibility !== 'hidden' && bNav.offsetHeight > 0;
      bNavDebug = {
        present: true,
        display: style.display,
        visibility: style.visibility,
        offsetHeight: bNav.offsetHeight,
        offsetWidth: bNav.offsetWidth,
        bodyModalAttr: document.body.getAttribute('data-modal-open'),
        bodyClass: document.body.className,
      };
    } else {
      bNavDebug = { present: false, pathname: window.location.pathname };
    }

    // Desktop sidebar detection
    const aside = document.querySelector('aside');
    let asideVisible = false;
    let asideDebug = null;
    if (aside) {
      const style = window.getComputedStyle(aside);
      asideVisible = style.display !== 'none' && style.visibility !== 'hidden' && aside.offsetWidth > 0;
      asideDebug = {
        present: true,
        display: style.display,
        visibility: style.visibility,
        offsetWidth: aside.offsetWidth,
      };
    } else {
      asideDebug = { present: false, pathname: window.location.pathname };
    }

    // Top header detection
    const header = document.querySelector('header');
    let headerVisible = false;
    if (header) {
      const style = window.getComputedStyle(header);
      headerVisible = style.display !== 'none' && style.visibility !== 'hidden' && header.offsetHeight > 0;
    }

    // Overlapping elements audit for major visible block cards and text in the flow
    // Exclude header, nav, floating modals, poppers, tooltips, background decorative items, and loading skeletons
    const candidates = Array.from(
      document.querySelectorAll('main div, main section, main article, main form')
    ).filter((el) => {
      // Must not be inside header, nav, or dialog
      if (el.closest('header, nav, [role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]')) return false;
      // Exclude loading shimmer skeletons
      if (el.classList.contains('animate-shimmer') || el.closest('.animate-shimmer')) return false;

      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);

      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
      if (s.pointerEvents === 'none') return false;
      if (s.position === 'fixed' || s.position === 'absolute') return false; // Exclude floating badges/overlays
      if (r.width < 80 || r.height < 30) return false;

      // Only check elements in visible vertical layout range
      return r.bottom > 0 && r.top < window.innerHeight;
    });

    const overlaps = [];
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        if (a.contains(b) || b.contains(a)) continue;

        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();

        // Check if bounding boxes strictly intersect with significant intersection area
        const xOverlap = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
        const yOverlap = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));

        // Area threshold: > 250px^2 (e.g., 25px x 10px overlap)
        if (xOverlap > 15 && yOverlap > 15) {
          overlaps.push({
            tagA: a.tagName,
            classA: (a.className || '').toString().slice(0, 50),
            tagB: b.tagName,
            classB: (b.className || '').toString().slice(0, 50),
            overlapArea: Math.round(xOverlap * yOverlap),
          });
        }
      }
    }

    return {
      docScrollWidth,
      docClientWidth,
      windowInnerWidth,
      hasHorizontalOverflow,
      bNavVisible,
      bNavDebug,
      asideVisible,
      asideDebug,
      headerVisible,
      overlapsCount: overlaps.length,
      overlaps: overlaps.slice(0, 5),
    };
  });
}

async function runRegressionSuite() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  console.log('Seeding initial match data in Dexie DB...');
  await seedMatch(page);
  await page.close();
  console.log('Match seeded successfully.\n');

  const ROUTES_TO_TEST = [
    { path: '/', name: 'home', isPrimary: true },
    { path: '/matches/new', name: 'new_match', isPrimary: true },
    { path: '/matches/history', name: 'match_history', isPrimary: true },
    { path: '/tournaments', name: 'tournaments', isPrimary: true },
    { path: '/teams', name: 'teams', isPrimary: true },
    { path: '/profile', name: 'profile', isPrimary: false },
    { path: `/matches/score/${TEST_MATCH_ID}`, name: 'live_score', isPrimary: false },
    { path: `/matches/center/${TEST_MATCH_ID}`, name: 'match_center', isPrimary: false },
    { path: `/matches/summary/${TEST_MATCH_ID}`, name: 'match_summary', isPrimary: false },
    { path: '/offline', name: 'offline', isPrimary: false },
  ];

  const results = [];

  for (const vp of VIEWPORTS) {
    console.log(`================================================================`);
    console.log(`TESTING VIEWPORT: ${vp.name} (${vp.width}x${vp.height})`);
    console.log(`================================================================`);

    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[${vp.name}] ${msg.text()}`);
      }
    });

    await page.setViewport({ width: vp.width, height: vp.height });

    for (const route of ROUTES_TO_TEST) {
      const url = `${BASE_URL}${route.path}`;
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
      } catch (e) {
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Expected visibility assertions:
      const expectedBottomNavVisible = !vp.isDesktop && route.isPrimary;
      const expectedAsideVisible = vp.isDesktop;

      if (expectedBottomNavVisible) {
        try {
          await page.waitForSelector('nav[aria-label="Cricket Navigation"]', { timeout: 8000 });
        } catch (e) {
          console.warn(`[Timeout] waitForSelector bNav on ${route.path}`);
        }
      }

      if (expectedAsideVisible) {
        try {
          await page.waitForSelector('aside', { timeout: 8000 });
        } catch (e) {
          console.warn(`[Timeout] waitForSelector aside on ${route.path}`);
        }
      }

      await new Promise((r) => setTimeout(r, 400));

      const layout = await inspectPageLayout(page);
      const bNavMatchesExpected = layout.bNavVisible === expectedBottomNavVisible;
      const asideMatchesExpected = layout.asideVisible === expectedAsideVisible;

      // Pass criteria
      const pass =
        !layout.hasHorizontalOverflow &&
        layout.overlapsCount === 0 &&
        bNavMatchesExpected &&
        asideMatchesExpected;

      const screenshotName = `${vp.name}_${route.name}.png`;
      const screenshotPath = path.join(SCREENSHOT_DIR, screenshotName);
      await page.screenshot({ path: screenshotPath, fullPage: false });

      const routeResult = {
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        route: route.path,
        routeName: route.name,
        isPrimary: route.isPrimary,
        docScrollWidth: layout.docScrollWidth,
        windowWidth: layout.windowInnerWidth,
        hasHorizontalOverflow: layout.hasHorizontalOverflow,
        bNavVisible: layout.bNavVisible,
        expectedBNav: expectedBottomNavVisible,
        bNavOk: bNavMatchesExpected,
        asideVisible: layout.asideVisible,
        expectedAside: expectedAsideVisible,
        asideOk: asideMatchesExpected,
        overlapsCount: layout.overlapsCount,
        pass,
        screenshot: screenshotName,
      };

      results.push(routeResult);

      const statusIcon = pass ? 'PASS' : 'FAIL';
      console.log(
        `[${statusIcon}] ${route.path.padEnd(35)} | bNav: ${layout.bNavVisible} (exp ${expectedBottomNavVisible}) | aside: ${layout.asideVisible} | scroll: ${layout.docScrollWidth}/${vp.width} | overlaps: ${layout.overlapsCount}`
      );
      if (!pass) {
        if (layout.hasHorizontalOverflow) console.log(`   -> Horizontal overflow: scrollWidth ${layout.docScrollWidth} > innerWidth ${vp.width}`);
        if (!bNavMatchesExpected) console.log(`   -> BottomNav mismatch: got ${layout.bNavVisible}, expected ${expectedBottomNavVisible}`, layout.bNavDebug);
        if (!asideMatchesExpected) console.log(`   -> Aside mismatch: got ${layout.asideVisible}, expected ${expectedAsideVisible}`, layout.asideDebug);
        if (layout.overlapsCount > 0) console.log(`   -> Overlaps detected:`, layout.overlaps);
      }
    }
    await page.close();
  }

  // Direct Navigation, Client Navigation & Refresh Test
  console.log(`\n================================================================`);
  console.log(`TESTING DIRECT NAVIGATION, CLIENT NAVIGATION & PAGE REFRESH`);
  console.log(`================================================================`);
  const navTestPage = await browser.newPage();
  await navTestPage.setViewport({ width: 390, height: 844 }); // Mobile modern

  // 1. Direct navigation to /profile
  await navTestPage.goto(`${BASE_URL}/profile`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 500));
  let check = await inspectPageLayout(navTestPage);
  console.log(`Direct navigation to /profile: bNavVisible=${check.bNavVisible} (expected false) - ${check.bNavVisible === false ? 'PASS' : 'FAIL'}`);

  // 2. Page refresh on /profile
  await navTestPage.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 500));
  check = await inspectPageLayout(navTestPage);
  console.log(`Page refresh on /profile: bNavVisible=${check.bNavVisible} (expected false) - ${check.bNavVisible === false ? 'PASS' : 'FAIL'}`);

  // 3. Client navigation from /profile to /
  await navTestPage.click('header a[title="Home"]');
  await new Promise((r) => setTimeout(r, 600));
  check = await inspectPageLayout(navTestPage);
  console.log(`Client navigation to /: bNavVisible=${check.bNavVisible} (expected true) - ${check.bNavVisible === true ? 'PASS' : 'FAIL'}`);

  // 4. Browser back to /profile
  await navTestPage.goBack({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 600));
  check = await inspectPageLayout(navTestPage);
  console.log(`Browser back to /profile: bNavVisible=${check.bNavVisible} (expected false) - ${check.bNavVisible === false ? 'PASS' : 'FAIL'}`);

  // 5. Browser forward to /
  await navTestPage.goForward({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 600));
  check = await inspectPageLayout(navTestPage);
  console.log(`Browser forward to /: bNavVisible=${check.bNavVisible} (expected true) - ${check.bNavVisible === true ? 'PASS' : 'FAIL'}`);

  await navTestPage.close();

  await browser.close();

  // Summary
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;
  console.log(`\n================================================================`);
  console.log(`REGRESSION AUDIT SUMMARY`);
  console.log(`Total checks: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Console errors captured: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log(`Console errors:`, consoleErrors.slice(0, 5));
  }
  console.log(`================================================================\n`);

  // Write results JSON
  fs.writeFileSync(
    path.resolve(__dirname, '../artifacts/regression_results.json'),
    JSON.stringify({ total, passed, failed, consoleErrors, results }, null, 2)
  );
}

runRegressionSuite().catch((err) => {
  console.error('Regression suite failed:', err);
  process.exit(1);
});
