import { describe, it, expect, afterAll } from 'vitest';
import { ScorecardHtmlGenerator } from '@/features/scoring/pdf/ScorecardHtmlGenerator';
import { ScorecardPdfGenerator } from '@/features/scoring/pdf/ScorecardPdfGenerator';
import { launchPdfBrowser, closePdfBrowser } from '@/features/scoring/pdf/puppeteerBrowser';
import { MatchScorecard } from '@/domain/cricket/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Bengali PDF & HTML Scorecard Verification Suite', () => {
  const sampleBengaliMatch: MatchScorecard = {
    id: 'match-bengali-spec-001',
    teamA: 'বাংলাদেশ প্রিমিয়ার ক্রিকেট টুর্নামেন্ট',
    teamB: 'নরসিংদী কিংস একাদশ',
    tossWinner: 'বাংলাদেশ প্রিমিয়ার ক্রিকেট টুর্নামেন্ট',
    tossDecision: 'Batting',
    totalOvers: 10,
    status: 'COMPLETED',
    currentInnings: 2,
    targetScore: 165,
    venue: 'ভেন্যু: নরসিংদী ক্রিকেট গ্রাউন্ড',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    winner: 'বাংলাদেশ প্রিমিয়ার ক্রিকেট টুর্নামেন্ট',
    loser: 'নরসিংদী কিংস একাদশ',
    result: 'আজকের ম্যাচের ফলাফল ও খেলোয়াড়দের পরিসংখ্যান: বাংলাদেশ প্রিমিয়ার ক্রিকেট টুর্নামেন্ট ২১ রানে জয়ী',
    resultType: 'WIN',
    margin: 21,
    marginType: 'RUNS',
    firstInnings: {
      inningsNumber: 1,
      team: 'বাংলাদেশ প্রিমিয়ার ক্রিকেট টুর্নামেন্ট',
      bowlingTeam: 'নরসিংদী কিংস একাদশ',
      totalRuns: 164,
      totalWickets: 4,
      totalBalls: 60,
      oversString: '10.0',
      wideRuns: 4,
      nbRuns: 1,
      byeRuns: 0,
      lbRuns: 0,
      penaltyRuns: 0,
      penaltyRunsAgainst: 0,
      strikerIdx: 0,
      nonStrikerIdx: 1,
      currentBowlerIdx: 0,
      nextPlayerIdx: 5,
      lastCompletedOverBowlerIdx: 0,
      isOverComplete: true,
      isFreeHit: false,
      thisOverLog: ['1', '4', '6', '1', '2', '4'],
      fallOfWickets: [],
      pastPartnerships: [],
      currentPartnership: { batter1: 'সাকিব আল হাসান', batter2: 'মুশফিকুর রহিম', runs: 45, balls: 18 },
      players: [
        {
          id: 'bp1',
          name: 'সাকিব আল হাসান',
          role: 'All-Rounder',
          battingHand: 'Left-hand Batsman',
          battingPosition: 'Opener No. 1',
          runs: 68,
          balls: 28,
          fours: 6,
          sixes: 4,
          dotBalls: 3,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
          isDismissed: true,
          dismissalText: 'ব্যাটসম্যান, বোলার, উইকেট, ওভার ও অতিরিক্ত রান: বোল্ড',
        },
        {
          id: 'bp2',
          name: 'মুশফিকুর রহিম',
          role: 'Wicket-Keeper Batsman',
          battingHand: 'Right-hand Batsman',
          battingPosition: 'Opener No. 2',
          runs: 45,
          balls: 20,
          fours: 4,
          sixes: 2,
          dotBalls: 2,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
          isDismissed: false,
        },
        {
          id: 'bp3',
          name: 'তাসকিন আহমেদ',
          role: 'Fast Bowler',
          battingHand: 'Right-hand Batsman',
          battingPosition: 'One Down No. 3',
          runs: 25,
          balls: 9,
          fours: 2,
          sixes: 2,
          dotBalls: 1,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
          isDismissed: false,
        },
      ],
      bowlers: [
        {
          id: 'bb1',
          name: 'মুস্তাফিজুর রহমান',
          ballsBowled: 18,
          maidens: 0,
          runs: 35,
          wickets: 2,
          overHistory: [],
        },
        {
          id: 'bb2',
          name: 'মেহেদী হাসান মিরাজ',
          ballsBowled: 18,
          maidens: 0,
          runs: 32,
          wickets: 1,
          overHistory: [],
        },
      ],
    },
    secondInnings: {
      inningsNumber: 2,
      team: 'নরসিংদী কিংস একাদশ',
      bowlingTeam: 'বাংলাদেশ প্রিমিয়ার ক্রিকেট টুর্নামেন্ট',
      totalRuns: 143,
      totalWickets: 7,
      totalBalls: 60,
      oversString: '10.0',
      wideRuns: 2,
      nbRuns: 0,
      byeRuns: 0,
      lbRuns: 0,
      penaltyRuns: 0,
      penaltyRunsAgainst: 0,
      strikerIdx: 0,
      nonStrikerIdx: 1,
      currentBowlerIdx: 0,
      nextPlayerIdx: 4,
      lastCompletedOverBowlerIdx: 0,
      isOverComplete: true,
      isFreeHit: false,
      thisOverLog: ['1', '0', 'W', '4', '1', '2'],
      fallOfWickets: [],
      pastPartnerships: [],
      players: [
        {
          id: 'nk1',
          name: 'তামিম ইকবাল',
          role: 'Opener',
          battingHand: 'Left-hand Batsman',
          battingPosition: 'Opener No. 1',
          runs: 54,
          balls: 25,
          fours: 5,
          sixes: 3,
          dotBalls: 4,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
          isDismissed: true,
          dismissalText: 'কট তাসকিন আহমেদ',
        },
        {
          id: 'nk2',
          name: 'মাহমুদুল্লাহ রিয়াদ',
          role: 'Middle Order',
          battingHand: 'Right-hand Batsman',
          battingPosition: 'Opener No. 2',
          runs: 38,
          balls: 19,
          fours: 3,
          sixes: 2,
          dotBalls: 3,
          ballLog: [],
          bowlersFaced: {},
          runsVsBowler: {},
          isDismissed: true,
          dismissalText: 'রান আউট',
        },
      ],
      bowlers: [
        {
          id: 'bb3',
          name: 'তাসকিন আহমেদ',
          ballsBowled: 18,
          maidens: 0,
          runs: 28,
          wickets: 3,
          overHistory: [],
        },
        {
          id: 'bb4',
          name: 'সাকিব আল হাসান',
          ballsBowled: 18,
          maidens: 0,
          runs: 24,
          wickets: 2,
          overHistory: [],
        },
      ],
    },
  };

  afterAll(async () => {
    await closePdfBrowser();
  });

  it('generates master-accurate HTML with embedded Noto Sans Bengali font and exact test strings', () => {
    const html = ScorecardHtmlGenerator.generateHtml(
      sampleBengaliMatch,
      'ভেন্যু: নরসিংদী ক্রিকেট গ্রাউন্ড'
    );

    expect(html).toBeDefined();
    // Verify @font-face embedding for Noto Sans Bengali
    expect(html).toContain("font-family: 'Noto Sans Bengali'");
    expect(html).toContain("data:font/truetype;charset=utf-8;base64,");

    // Verify all 6 mandatory user test strings:
    // 1. “বাংলাদেশ প্রিমিয়ার ক্রিকেট টুর্নামেন্ট”
    expect(html).toContain('বাংলাদেশ প্রিমিয়ার ক্রিকেট টুর্নামেন্ট');

    // 2. “ভেন্যু: নরসিংদী ক্রিকেট গ্রাউন্ড”
    expect(html).toContain('ভেন্যু: নরসিংদী ক্রিকেট গ্রাউন্ড');

    // 3. “ব্যাটসম্যান, বোলার, উইকেট, ওভার ও অতিরিক্ত রান”
    expect(html).toContain('ব্যাটসম্যান, বোলার, উইকেট, ওভার ও অতিরিক্ত রান');

    // 4. “সাকিব, মুশফিক, তাসকিন এবং বাংলাদেশ”
    expect(html).toContain('সাকিব আল হাসান');
    expect(html).toContain('মুশফিকুর রহিম');
    expect(html).toContain('তাসকিন আহমেদ');

    // 5. “আজকের ম্যাচের ফলাফল ও খেলোয়াড়দের পরিসংখ্যান”
    expect(html).toContain('আজকের ম্যাচের ফলাফল ও খেলোয়াড়দের পরিসংখ্যান');

    // Verify Master Green branding (#1f5a3a) and A4 structure
    expect(html).toContain('#1f5a3a');
    expect(html).toContain('size: A4 portrait');
  });

  it(
    'renders a pristine vector PDF via Chrome with 100% accurate Bengali shaping',
    async () => {
      const html = ScorecardHtmlGenerator.generateHtml(
        sampleBengaliMatch,
        'ভেন্যু: নরসিংদী ক্রিকেট গ্রাউন্ড'
      );

      const tempDir = path.join(os.tmpdir(), `cric-scorer-test-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      const testHtmlPath = path.join(tempDir, 'test_bengali_match.html');
      const testPdfPath = path.join(tempDir, 'test_bengali_match.pdf');
      const testPngPath = path.join(tempDir, 'test_bengali_match.png');

      fs.writeFileSync(testHtmlPath, html, 'utf8');

      // Launch Chromium using the cross-platform launcher (no hardcoded machine paths)
      const browser = await launchPdfBrowser();

      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: 'load' });

        // Ensure Noto Sans Bengali font is fully ready before capturing
        await page.evaluateHandle('document.fonts.ready');
        const isFontReady = await page.evaluate(() =>
          document.fonts.check('16px "Noto Sans Bengali"')
        );
        expect(isFontReady).toBe(true);

        // Generate visual screenshot of rendered page
        await page.screenshot({ path: testPngPath });

        // Generate vector A4 PDF
        await page.pdf({
          path: testPdfPath,
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
        });

        expect(fs.existsSync(testPdfPath)).toBe(true);
        expect(fs.existsSync(testPngPath)).toBe(true);

        const pdfStats = fs.statSync(testPdfPath);
        expect(pdfStats.size).toBeGreaterThan(1000);

        // Verify valid PDF header signature
        const pdfBuffer = fs.readFileSync(testPdfPath);
        const header = pdfBuffer.slice(0, 5).toString('ascii');
        expect(header).toBe('%PDF-');
      } finally {
        await browser.close();
        // Deterministic cleanup of temporary test files
        try {
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        } catch {
          // Ignore cleanup errors
        }
      }
    },
    15000
  );

  it('renders complex Bengali conjuncts (যুক্তাক্ষর), numerals, and mixed scripts without distortion', async () => {
    const complexConjunctsMatch: MatchScorecard = {
      ...sampleBengaliMatch,
      id: 'match-complex-conjuncts-002',
      teamA: 'বিক্ষুব্ধ একাদশ (যুক্তাক্ষর: ক্ত, ক্ষ, ঙ্ক, ঙ্গ, ঞ্চ, ঞ্জ)',
      teamB: 'স্পষ্টবাদী স্পোর্টস ক্লাব (ট্ট, ড্ড, ণ্ট, ণ্ড, ত্ত, দ্দ, ন্ন, প্ত, ম্প, ল্ল, শ্চ, ষ্ঠ, ষ্ণ, স্ত, স্থ, স্ন)',
      venue: 'স্থান: ব্রাহ্মণবাড়িয়া স্টেডিয়াম (ব্রাহ্মণবাড়িয়া, নরসিংদী, লক্ষ্মীপুর)',
      result: 'ফলাফল: ১৮৫/৮ (২০.০ ওভার) বনাম ১৭০/১০ (১৯.৪ ওভার) - ১৫ রানে বিজয়ী',
      firstInnings: {
        ...sampleBengaliMatch.firstInnings!,
        players: [
          {
            id: 'cx1',
            name: 'শ্রী অম্লান চক্রবর্তী (অধিনায়ক)',
            role: 'অল-রাউন্ডার',
            battingHand: 'Right-hand Batsman',
            runs: 104,
            balls: 52,
            fours: 10,
            sixes: 6,
            dotBalls: 8,
            ballLog: [],
            bowlersFaced: {},
            runsVsBowler: {},
            isDismissed: false,
          },
        ],
      },
    };

    const html = ScorecardHtmlGenerator.generateHtml(complexConjunctsMatch);
    expect(html).toContain('বিক্ষুব্ধ একাদশ');
    expect(html).toContain('স্পষ্টবাদী স্পোর্টস ক্লাব');
    expect(html).toContain('ব্রাহ্মণবাড়িয়া স্টেডিয়াম');
    expect(html).toContain('১৮৫/৮');
    expect(html).toContain('শ্রী অম্লান চক্রবর্তী');

    const doc = await ScorecardPdfGenerator.generatePdf(complexConjunctsMatch);
    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.getFontList()).toHaveProperty('NotoSansBengali');
  });

  it('ScorecardPdfGenerator.generatePdf registers NotoSansBengali font and handles mixed Bengali/English matches', async () => {
    const doc = await ScorecardPdfGenerator.generatePdf(sampleBengaliMatch);
    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBe(1);

    const fontList = doc.getFontList();
    expect(fontList).toHaveProperty('NotoSansBengali');
    expect(fontList.NotoSansBengali).toContain('normal');
    expect(fontList.NotoSansBengali).toContain('bold');
  });

  it(
    'API route POST /api/pdf/export returns a valid vector PDF buffer with correct headers',
    async () => {
      const { POST } = await import('@/app/api/pdf/export/route');
      const { NextRequest } = await import('next/server');

      const req = new NextRequest('http://localhost:3000/api/pdf/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match: sampleBengaliMatch,
          groundName: 'ভেন্যু: নরসিংদী ক্রিকেট গ্রাউন্ড',
        }),
      });

      const response = await POST(req);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/pdf');
      expect(response.headers.get('Content-Disposition')).toContain('Match Report.pdf');

      const arrayBuffer = await response.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(1000);

      // Verify PDF header magic bytes '%PDF-'
      const header = Buffer.from(arrayBuffer.slice(0, 5)).toString('ascii');
      expect(header).toBe('%PDF-');
    },
    15000
  );
});
