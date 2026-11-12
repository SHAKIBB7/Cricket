/**
 * /api/pdf/export
 * High-performance vector PDF export API route with 100% native Bengali font shaping.
 *
 * Hardening (audit P3-M7): the route renders through headless
 * Chromium, so it is deliberately defensive — a body size cap,
 * a minimal scorecard shape check before rendering, a simple
 * per-IP rate limit, and generic client-facing error messages
 * (internal errors are logged server-side only, never returned).
 */

import { NextRequest, NextResponse } from 'next/server';
import { ScorecardHtmlGenerator } from '@/features/scoring/pdf/ScorecardHtmlGenerator';
import { renderPdfFromHtml } from '@/features/scoring/pdf/puppeteerBrowser';
import { MatchScorecard } from '@/domain/cricket/types';

export const dynamic = 'force-dynamic';

/** Maximum accepted request body size (2 MB) — a full scorecard JSON is far smaller. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** Simple in-memory per-IP rate limit: at most 10 renders per minute per IP. */
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const requestLogByIp = new Map<string, number[]>();

function clientIp(req: NextRequest): string {
  // Bug hunt P-4: the FIRST x-forwarded-for entry is entirely
  // client-controlled (any caller can prepend a fake IP and
  // rotate it to defeat the rate limit). Prefer Vercel's own
  // header, which the edge sets from the real connection; else
  // use the LAST XFF entry — the one appended by the nearest
  // trusted proxy — and only then fall back to x-real-ip.
  const vercelForwardedFor = req.headers.get('x-vercel-forwarded-for');
  if (vercelForwardedFor) {
    return vercelForwardedFor.split(',')[0].trim();
  }
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const entries = forwardedFor.split(',').map((entry) => entry.trim()).filter(Boolean);
    if (entries.length > 0) {
      return entries[entries.length - 1];
    }
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return (req as any).ip || 'unknown';
}

/**
 * Bug hunt P-4: the log map used to grow by one entry per
 * distinct IP forever. Drop entries whose window has fully
 * expired (an empty filtered log) whenever we touch the map.
 */
function pruneExpiredRequestLogs(now: number): void {
  for (const [ip, timestamps] of requestLogByIp) {
    if (timestamps.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) {
      requestLogByIp.delete(ip);
    }
  }
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  pruneExpiredRequestLogs(now);
  const recent = (requestLogByIp.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  requestLogByIp.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

/**
 * Minimal MatchScorecard shape gate: the fields the generator
 * cannot render without. Full type validation is intentionally
 * NOT attempted — legitimate clients always send complete
 * scorecards produced by the app itself.
 */
function isRenderableScorecard(value: any): value is MatchScorecard {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.teamA === 'string' &&
    value.teamA.length > 0 &&
    typeof value.teamB === 'string' &&
    value.teamB.length > 0 &&
    typeof value.totalOvers === 'number' &&
    Number.isFinite(value.totalOvers)
  );
}

export async function POST(req: NextRequest) {
  try {
    if (isRateLimited(clientIp(req))) {
      return NextResponse.json(
        { error: 'Too many PDF export requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request payload too large' }, { status: 413 });
    }

    const rawBody = await req.text();
    // Bug hunt P-8: count BYTES, not UTF-16 code units — a body
    // of ~2M Bengali characters is ~6 MB of UTF-8 and used to
    // sail under the "2 MB" cap.
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request payload too large' }, { status: 413 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const match: MatchScorecard = body?.match;
    const groundName: string | undefined = body?.groundName;
    const superOverMatch: MatchScorecard | undefined = body?.superOverMatch;

    if (!match) {
      return NextResponse.json({ error: 'Missing match scorecard payload' }, { status: 400 });
    }

    if (
      !isRenderableScorecard(match) ||
      (groundName !== undefined && typeof groundName !== 'string') ||
      (superOverMatch !== undefined && !isRenderableScorecard(superOverMatch))
    ) {
      return NextResponse.json({ error: 'Invalid match scorecard payload' }, { status: 400 });
    }

    const html = ScorecardHtmlGenerator.generateHtml(match, groundName, superOverMatch);

    const pdfUint8Array = await renderPdfFromHtml(html);

    const teamA = (match.teamA || 'TeamA').replace(/[/\\?%*:|"<>]/g, '-');
    const teamB = (match.teamB || 'TeamB').replace(/[/\\?%*:|"<>]/g, '-');
    const fileName = `${teamA} vs ${teamB} Match Report.pdf`;

    const asciiSafeFileName = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
    const encodedFileName = encodeURIComponent(fileName);

    return new NextResponse(Buffer.from(pdfUint8Array), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${asciiSafeFileName}"; filename*=UTF-8''${encodedFileName}`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error: any) {
    // P3-M7: internal detail stays in the server log; clients get
    // a generic message (the raw error used to be returned verbatim).
    console.error('[API /api/pdf/export] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
