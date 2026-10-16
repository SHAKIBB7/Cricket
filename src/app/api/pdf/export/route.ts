/**
 * /api/pdf/export
 * High-performance vector PDF export API route with 100% native Bengali font shaping.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ScorecardHtmlGenerator } from '@/features/scoring/pdf/ScorecardHtmlGenerator';
import { renderPdfFromHtml } from '@/features/scoring/pdf/puppeteerBrowser';
import { MatchScorecard } from '@/domain/cricket/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const match: MatchScorecard = body?.match;
    const groundName: string | undefined = body?.groundName;

    if (!match) {
      return NextResponse.json({ error: 'Missing match scorecard payload' }, { status: 400 });
    }

    const html = ScorecardHtmlGenerator.generateHtml(match, groundName);

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
    console.error('[API /api/pdf/export] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
