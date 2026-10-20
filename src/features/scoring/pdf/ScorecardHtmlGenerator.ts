/**
 * ScorecardHtmlGenerator — Pixel-Perfect A4 Match Scorecard HTML Generator
 * 
 * Generates print-ready HTML matching the exact master visual design of ScorecardPdfGenerator:
 * - Exact A4 portrait dimensions (210mm x 297mm)
 * - Master dark green palette (#1f5a3a), rounded cards, clean typography
 * - Embedded Noto Sans Bengali fonts for 100% native Bengali shaping & ligatures
 * - Responsive single-page layout with density adaptations
 */

import { MatchScorecard, InningsData, Player, Bowler } from '@/domain/cricket/types';
import {
  cleanPlayerName,
  strikeRate,
  economyRate,
  currentRunRate,
  ballsFromOversString,
} from '@/domain/cricket/formatters';
import { ManOfTheMatchEngine } from '@/domain/cricket/analytics/ManOfTheMatchEngine';
import { SmartGroundDetectionService } from '@/infrastructure/maps/SmartGroundDetectionService';
import { getBengaliFontDataUri } from './bengaliFont';

export class ScorecardHtmlGenerator {
  /**
   * Generates a self-contained, standalone HTML document for the match report.
   */
  static generateHtml(match: MatchScorecard, resolvedGroundName?: string | null): string {
    const teamA = (match.teamA || 'Team A').trim();
    const teamB = (match.teamB || 'Team B').trim();

    // Batting data filtering
    const getActiveBatters = (inn?: InningsData): Player[] => {
      if (!inn || !inn.players) return [];
      return inn.players.filter((p, i) => {
        if (p.balls > 0 || p.runs > 0 || p.isDismissed) return true;
        if (inn.totalBalls > 0) {
          const isAtCrease = i === inn.strikerIdx || i === inn.nonStrikerIdx;
          if (isAtCrease && p.name && p.name.trim() !== '' && p.name !== 'Select Player') {
            return true;
          }
        }
        return false;
      });
    };

    const inn1Batters = getActiveBatters(match.firstInnings);
    const inn2Batters = getActiveBatters(match.secondInnings);

    // Active bowlers
    const getActiveBowlers = (inn?: InningsData): Bowler[] => {
      if (!inn || !inn.bowlers) return [];
      return inn.bowlers.filter((b) => b.ballsBowled > 0 || b.runs > 0 || b.wickets > 0);
    };

    const firstInnBowlers = getActiveBowlers(match.firstInnings);
    const secondInnBowlers = getActiveBowlers(match.secondInnings);

    // Density detection
    const totalBattingRows = inn1Batters.length + inn2Batters.length;
    const maxBowlingRows = Math.max(firstInnBowlers.length, secondInnBowlers.length);
    const isDense = totalBattingRows > 14 || maxBowlingRows > 5;

    // Ground Name validation helper
    const isReadable = (val: unknown): val is string => {
      if (typeof val !== 'string') return false;
      const trimmed = val.trim();
      if (!trimmed) return false;
      if (/^ground_/i.test(trimmed)) return false;
      if (
        /^(null|undefined|n\/a|none|unknown|unnamed ground|unnamed|standard ground|not available|venue not set|\[object\s+object\])$/i.test(
          trimmed
        )
      ) {
        return false;
      }
      if (SmartGroundDetectionService.isCoordinateBasedName(trimmed)) return false;
      return SmartGroundDetectionService.isReadableAlphabeticName(trimmed);
    };

    let displayGroundName = 'Not Available';
    if (resolvedGroundName && isReadable(resolvedGroundName)) {
      displayGroundName = resolvedGroundName.trim();
    } else if (match.venue && isReadable(match.venue)) {
      displayGroundName = match.venue.trim();
    } else if (match.advancedSettings?.venue && isReadable(match.advancedSettings.venue)) {
      displayGroundName = match.advancedSettings.venue.trim();
    }

    // Score Summary
    const inn1 = match.firstInnings;
    const inn2 = match.secondInnings;
    const hasInn1 = !!inn1 && (inn1.totalRuns > 0 || inn1.totalBalls > 0 || inn1.totalWickets > 0);
    const hasInn2 = !!inn2 && (inn2.totalRuns > 0 || inn2.totalBalls > 0 || inn2.totalWickets > 0);

    // Result Text
    let resultText = '';
    if (match.result && match.result.trim()) {
      resultText = match.result.trim();
    } else if (match.winner) {
      if (match.margin && match.marginType) {
        const unit =
          match.marginType === 'RUNS'
            ? match.margin === 1
              ? 'RUN'
              : 'RUNS'
            : match.margin === 1
            ? 'WICKET'
            : 'WICKETS';
        resultText = `${match.winner} WON BY ${match.margin} ${unit}`;
      } else {
        resultText = `${match.winner} WON`;
      }
    } else if (match.status === 'COMPLETED') {
      resultText = match.resultType === 'TIE' ? 'MATCH TIED' : 'MATCH COMPLETED';
    } else if (match.status === 'ABANDONED' || match.resultType === 'NO_RESULT') {
      resultText = 'MATCH ABANDONED';
    } else if (match.status === 'ONGOING') {
      if (hasInn2 && match.targetScore) {
        const needed = match.targetScore - (inn2?.totalRuns || 0);
        resultText = `${teamB.toUpperCase()} NEED ${Math.max(0, needed)} RUNS TO WIN`;
      } else {
        resultText = 'MATCH IN PROGRESS';
      }
    }

    // Man of the Match
    const mom = ManOfTheMatchEngine.resolveForMatch(match);

    // Bowling teams
    const teamABowlers = secondInnBowlers.length > 0 ? secondInnBowlers : [];
    const teamBBowlers = firstInnBowlers.length > 0 ? firstInnBowlers : [];
    const hasTeamABowling = teamABowlers.length > 0;
    const hasTeamBBowling = teamBBowlers.length > 0;

    // Key match notes
    const allPlayers: Player[] = [...inn1Batters, ...inn2Batters];
    let topBatter: Player | null = null;
    for (const p of allPlayers) {
      if (p.runs > 0) {
        if (!topBatter || p.runs > topBatter.runs) {
          topBatter = p;
        }
      }
    }

    const allBowlers: Bowler[] = [...firstInnBowlers, ...secondInnBowlers];
    let bestBowler: Bowler | null = null;
    for (const b of allBowlers) {
      if (b.ballsBowled > 0) {
        if (
          !bestBowler ||
          b.wickets > bestBowler.wickets ||
          (b.wickets === bestBowler.wickets && b.runs < bestBowler.runs)
        ) {
          bestBowler = b;
        }
      }
    }

    let winMarginText = '';
    if (match.margin && match.marginType) {
      winMarginText =
        match.marginType === 'RUNS'
          ? `${match.margin} ${match.margin === 1 ? 'run' : 'runs'}`
          : `${match.margin} ${match.margin === 1 ? 'wicket' : 'wickets'}`;
    }

    const oversLabel = match.totalOvers ? `${match.totalOvers}-OVER GAME` : 'MATCH REPORT';

    const regularFontUri = getBengaliFontDataUri('normal');
    const boldFontUri = getBengaliFontDataUri('bold');

    const escapeHtml = (str: string | null | undefined) =>
      (str ?? '')
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    // Helper for innings summary block
    const renderInningsSummaryHtml = (innings: InningsData) => {
      const balls = ballsFromOversString(innings.oversString);
      const rr = currentRunRate(innings.totalRuns, balls);
      return `
        <div class="score-innings-box">
          <div class="score-team-label">${escapeHtml(innings.team.toUpperCase())}</div>
          <div class="score-runs-wickets">${innings.totalRuns} / ${innings.totalWickets}</div>
          <div class="score-overs-rr">${innings.oversString} overs &bull; RR ${rr.toFixed(2)}</div>
        </div>
      `;
    };

    // Helper for batting table rows
    const renderBattingRows = (batters: Player[]) => {
      return batters
        .map((p, idx) => {
          const name = cleanPlayerName(p.name);
          let status = 'Not out';
          if (p.isDismissed) {
            if (p.dismissalText) {
              status = p.dismissalText;
            } else if (p.dismissalType) {
              status =
                p.fielderName && p.dismissalType === 'Caught'
                  ? `Caught by ${p.fielderName}`
                  : p.dismissalType;
            } else {
              status = 'Dismissed';
            }
          }
          const sr = p.balls > 0 ? strikeRate(p.runs, p.balls).toFixed(1) : '0.0';
          return `
            <tr>
              <td class="col-center text-muted">${idx + 1}</td>
              <td class="col-left text-bold text-primary pl-2">${escapeHtml(name)}</td>
              <td class="col-center text-muted">${escapeHtml(status)}</td>
              <td class="col-center text-bold text-primary">${p.runs}</td>
              <td class="col-center text-secondary">${p.balls}</td>
              <td class="col-center text-secondary">${p.fours}</td>
              <td class="col-center text-secondary">${p.sixes}</td>
              <td class="col-center text-bold text-primary">${sr}</td>
            </tr>
          `;
        })
        .join('');
    };

    // Helper for bowler row
    const renderBowlerRows = (bowlers: Bowler[]) => {
      return bowlers
        .map((b) => {
          const overs = `${Math.floor(b.ballsBowled / 6)}.${b.ballsBowled % 6}`;
          const eco = economyRate(b.runs, b.ballsBowled).toFixed(1);
          return `
            <tr>
              <td class="col-left text-primary pl-2">${escapeHtml(cleanPlayerName(b.name))}</td>
              <td class="col-center text-secondary">${overs}</td>
              <td class="col-center text-secondary">${b.runs}</td>
              <td class="col-center text-bold text-primary">${b.wickets}</td>
              <td class="col-center text-primary">${eco}</td>
            </tr>
          `;
        })
        .join('');
    };

    return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(teamA)} vs ${escapeHtml(teamB)} Match Report</title>
  <style>
    @font-face {
      font-family: 'Noto Sans Bengali';
      src: url('${regularFontUri}') format('truetype');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Noto Sans Bengali';
      src: url('${boldFontUri}') format('truetype');
      font-weight: 700;
      font-style: normal;
    }

    @page {
      size: A4 portrait;
      margin: 0;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      width: 210mm;
      min-height: 297mm;
      max-height: 297mm;
      margin: 0 auto;
      padding: 10mm 12mm;
      background-color: #f4f6f5;
      font-family: 'Noto Sans Bengali', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    /* Master Typography & Color Tokens */
    .text-primary { color: #0f172a; }
    .text-secondary { color: #475569; }
    .text-muted { color: #64748b; }
    .text-dark-green { color: #1f5a3a; }
    .text-amber { color: #d6a640; }
    .text-white { color: #ffffff; }
    .text-bold { font-weight: 700; }
    .text-center { text-align: center; }
    .pl-2 { padding-left: 6px; }

    /* Gap controls */
    .section-gap {
      margin-bottom: ${isDense ? '2.0mm' : '2.6mm'};
    }

    /* 1. Header Card */
    .header-card {
      background-color: #1f5a3a;
      border-radius: 3.5mm;
      padding: ${isDense ? '2.2mm 4mm' : '2.8mm 4mm'};
      text-align: center;
      color: #ffffff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .header-team-title {
      font-size: ${isDense ? '13.5pt' : '14.5pt'};
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: 0.02em;
    }
    .header-vs {
      font-size: ${isDense ? '7.5pt' : '8pt'};
      color: #d0e6d8;
      margin: 1px 0;
      font-weight: 400;
    }

    /* Tabs & Cards */
    .section-tab {
      background-color: #1f5a3a;
      border-radius: 2.2mm;
      padding: ${isDense ? '1.2mm 3.5mm' : '1.4mm 4mm'};
      color: #ffffff;
      font-size: 7.2pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      display: flex;
      align-items: center;
      gap: 5px;
      margin-bottom: 1.0mm;
    }
    .card-body {
      background-color: #ffffff;
      border: 0.2mm solid #e2e8f0;
      border-radius: 2.2mm;
      padding: ${isDense ? '2mm 3.5mm' : '2.5mm 4mm'};
    }

    /* Ground Information Card */
    .ground-card-body {
      font-size: ${isDense ? '7.6pt' : '8.2pt'};
      font-weight: 700;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: ${isDense ? '1.5mm 3.5mm' : '2.0mm 4mm'};
    }

    /* 2. Score Summary Card */
    .score-summary-card {
      background-color: #ffffff;
      border: 0.2mm solid #e2e8f0;
      border-radius: 3mm;
      padding: ${isDense ? '2.0mm 4mm' : '2.6mm 4mm'};
      display: flex;
      justify-content: ${hasInn1 && hasInn2 ? 'space-around' : 'center'};
      align-items: center;
      text-align: center;
    }
    .score-innings-box {
      flex: 1;
    }
    .score-team-label {
      font-size: ${isDense ? '7pt' : '7.5pt'};
      font-weight: 700;
      color: #334155;
      margin-bottom: 1px;
    }
    .score-runs-wickets {
      font-size: ${isDense ? '15pt' : '16.5pt'};
      font-weight: 700;
      color: #0f172a;
      line-height: 1.1;
    }
    .score-overs-rr {
      font-size: ${isDense ? '7pt' : '7.5pt'};
      color: #64748b;
      margin-top: 1px;
    }

    /* 3. Match Result Bar */
    .result-bar {
      background-color: #dbe9e2;
      border-radius: 2.5mm;
      padding: ${isDense ? '1.5mm 3mm' : '1.8mm 3mm'};
      text-align: center;
      color: #174d32;
      font-weight: 700;
      font-size: ${isDense ? '8pt' : '8.5pt'};
      letter-spacing: 0.03em;
    }

    /* 4. Man of the Match */
    .motm-cols-container {
      display: flex;
      justify-content: space-around;
      align-items: center;
      text-align: center;
      padding: ${isDense ? '1mm 0' : '1.5mm 0'};
    }
    .motm-col {
      flex: 1;
    }
    .motm-val {
      font-size: ${isDense ? '10.5pt' : '11.5pt'};
      font-weight: 700;
      color: #0f172a;
      line-height: 1.15;
    }
    .motm-val.amber {
      color: #d6a640;
      font-size: ${isDense ? '12pt' : '12.5pt'};
    }
    .motm-val.title {
      font-size: ${isDense ? '10pt' : '10.5pt'};
    }
    .motm-sub {
      font-size: ${isDense ? '6.5pt' : '6.8pt'};
      color: #64748b;
      margin-top: 1px;
    }

    /* Tables */
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: ${isDense ? '6.5pt' : '6.8pt'};
      background-color: #ffffff;
      border: 0.15mm solid #e2e8f0;
      border-radius: 2mm;
      overflow: hidden;
    }
    table.data-table thead tr {
      background-color: #1f5a3a;
      color: #ffffff;
      font-weight: 400;
      height: ${isDense ? '5mm' : '5.5mm'};
    }
    table.data-table thead th {
      padding: ${isDense ? '1.0mm 1.5mm' : '1.3mm 1.5mm'};
      font-size: ${isDense ? '6.5pt' : '6.8pt'};
      font-weight: 400;
    }
    table.data-table tbody tr {
      border-bottom: 0.15mm solid #f1f5f9;
      height: ${isDense ? '4.2mm' : '4.6mm'};
    }
    table.data-table tbody tr:last-child {
      border-bottom: none;
    }
    table.data-table td {
      padding: ${isDense ? '0.8mm 1.2mm' : '1.1mm 1.5mm'};
      vertical-align: middle;
    }

    .col-center { text-align: center; }
    .col-left { text-align: left; }

    /* Bowling two-column layout */
    .bowling-container {
      display: flex;
      gap: 4mm;
    }
    .bowling-col {
      flex: 1;
      border: 0.2mm solid #e2e8f0;
      border-radius: 2.2mm;
      background-color: #ffffff;
      padding: 1.5mm;
    }
    .bowling-team-title {
      font-size: 7.5pt;
      font-weight: 700;
      color: #1f5a3a;
      margin-bottom: 1.2mm;
      padding-left: 2px;
    }

    /* Key Notes */
    .notes-container {
      display: flex;
      align-items: center;
      justify-content: space-around;
      text-align: center;
      padding: ${isDense ? '1mm 0' : '1.5mm 0'};
    }
    .note-item {
      flex: 1;
      position: relative;
    }
    .note-item:not(:last-child)::after {
      content: '';
      position: absolute;
      right: 0;
      top: 15%;
      height: 70%;
      width: 0.2mm;
      background-color: #e2e8f0;
    }
    .note-label {
      font-size: ${isDense ? '6.2pt' : '6.8pt'};
      color: #64748b;
      margin-bottom: 1px;
    }
    .note-val {
      font-size: ${isDense ? '8.5pt' : '9.5pt'};
      font-weight: 700;
      color: #0f172a;
    }

    /* Footer */
    .footer {
      text-align: center;
      font-size: 7pt;
      color: #64748b;
      margin-top: 1.5mm;
      font-weight: 400;
      letter-spacing: 0.02em;
    }
  </style>
</head>
<body>
  <div>
    <!-- 1. Top Match Header Card -->
    <div class="header-card section-gap">
      <div class="header-team-title">${escapeHtml(teamA.toUpperCase())}</div>
      <div class="header-vs">vs</div>
      <div class="header-team-title">${escapeHtml(teamB.toUpperCase())}</div>
    </div>

    <!-- 1.5. Ground Information Section -->
    <div class="section-gap">
      <div class="section-tab">GROUND INFORMATION</div>
      <div class="card-body ground-card-body">
        Ground Name: ${escapeHtml(displayGroundName)}
      </div>
    </div>

    <!-- 2. Score Summary Card -->
    ${
      hasInn1 || hasInn2
        ? `
    <div class="score-summary-card section-gap">
      ${hasInn1 && hasInn2 ? renderInningsSummaryHtml(inn1!) + renderInningsSummaryHtml(inn2!) : ''}
      ${hasInn1 && !hasInn2 ? renderInningsSummaryHtml(inn1!) : ''}
      ${!hasInn1 && hasInn2 ? renderInningsSummaryHtml(inn2!) : ''}
    </div>
    `
        : ''
    }

    <!-- 3. Match Result Bar -->
    ${
      resultText
        ? `
    <div class="result-bar section-gap">
      ${escapeHtml(resultText.toUpperCase())}
    </div>
    `
        : ''
    }

    <!-- 4. Man of the Match Card -->
    ${
      mom && mom.name
        ? `
    <div class="section-gap">
      <div class="section-tab">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="#ffffff">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
        </svg>
        MAN OF THE MATCH
      </div>
      <div class="card-body">
        <div class="motm-cols-container">
          <div class="motm-col">
            <div class="motm-val title">${escapeHtml(cleanPlayerName(mom.name).toUpperCase())}</div>
            <div class="motm-sub">${escapeHtml(mom.role || 'Player')}</div>
          </div>
          ${
            mom.balls > 0 || mom.runs > 0
              ? `
          <div class="motm-col">
            <div class="motm-val">${mom.runs}</div>
            <div class="motm-sub">off ${mom.balls} balls</div>
          </div>
          `
              : ''
          }
          ${
            mom.ballsBowled > 0
              ? `
          <div class="motm-col">
            <div class="motm-val">${mom.wickets} / ${mom.bowlingRuns}</div>
            <div class="motm-sub">${Math.floor(mom.ballsBowled / 6)}.${mom.ballsBowled % 6} overs</div>
          </div>
          `
              : ''
          }
          ${
            mom.balls > 0
              ? `
          <div class="motm-col">
            <div class="motm-val">${strikeRate(mom.runs, mom.balls).toFixed(1)}</div>
            <div class="motm-sub">strike rate</div>
          </div>
          `
              : ''
          }
          ${
            mom.totalPoints > 0
              ? `
          <div class="motm-col">
            <div class="motm-val amber">${mom.totalPoints.toFixed(1)}</div>
            <div class="motm-sub">impact score</div>
          </div>
          `
              : ''
          }
        </div>
      </div>
    </div>
    `
        : ''
    }

    <!-- 5. Innings 1 Batting Table -->
    ${
      inn1Batters.length > 0
        ? `
    <div class="section-gap">
      <div class="section-tab">${escapeHtml(inn1!.team.toUpperCase())} &bull; BATTING</div>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 8%" class="col-center">#</th>
            <th style="width: 38%" class="col-left pl-2">PLAYER</th>
            <th style="width: 24%" class="col-center">STATUS</th>
            <th style="width: 6%" class="col-center">R</th>
            <th style="width: 6%" class="col-center">B</th>
            <th style="width: 6%" class="col-center">4s</th>
            <th style="width: 6%" class="col-center">6s</th>
            <th style="width: 10%" class="col-center">SR</th>
          </tr>
        </thead>
        <tbody>
          ${renderBattingRows(inn1Batters)}
        </tbody>
      </table>
    </div>
    `
        : ''
    }

    <!-- 6. Innings 2 Batting Table -->
    ${
      inn2Batters.length > 0
        ? `
    <div class="section-gap">
      <div class="section-tab">${escapeHtml(inn2!.team.toUpperCase())} &bull; BATTING</div>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 8%" class="col-center">#</th>
            <th style="width: 38%" class="col-left pl-2">PLAYER</th>
            <th style="width: 24%" class="col-center">STATUS</th>
            <th style="width: 6%" class="col-center">R</th>
            <th style="width: 6%" class="col-center">B</th>
            <th style="width: 6%" class="col-center">4s</th>
            <th style="width: 6%" class="col-center">6s</th>
            <th style="width: 10%" class="col-center">SR</th>
          </tr>
        </thead>
        <tbody>
          ${renderBattingRows(inn2Batters)}
        </tbody>
      </table>
    </div>
    `
        : ''
    }

    <!-- 7. Bowling Figures -->
    ${
      hasTeamABowling || hasTeamBBowling
        ? `
    <div class="section-gap">
      <div class="section-tab">BOWLING FIGURES</div>
      ${
        hasTeamABowling && hasTeamBBowling
          ? `
      <div class="bowling-container">
        <!-- Team A Bowling -->
        <div class="bowling-col">
          <div class="bowling-team-title">${escapeHtml(teamA.toUpperCase())}</div>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 44%" class="col-left pl-2">BOWLER</th>
                <th style="width: 14%" class="col-center">O</th>
                <th style="width: 14%" class="col-center">R</th>
                <th style="width: 14%" class="col-center">W</th>
                <th style="width: 14%" class="col-center">ECO</th>
              </tr>
            </thead>
            <tbody>
              ${renderBowlerRows(teamABowlers)}
            </tbody>
          </table>
        </div>
        <!-- Team B Bowling -->
        <div class="bowling-col">
          <div class="bowling-team-title">${escapeHtml(teamB.toUpperCase())}</div>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 44%" class="col-left pl-2">BOWLER</th>
                <th style="width: 14%" class="col-center">O</th>
                <th style="width: 14%" class="col-center">R</th>
                <th style="width: 14%" class="col-center">W</th>
                <th style="width: 14%" class="col-center">ECO</th>
              </tr>
            </thead>
            <tbody>
              ${renderBowlerRows(teamBBowlers)}
            </tbody>
          </table>
        </div>
      </div>
      `
          : `
      <div class="card-body">
        <div class="bowling-team-title">${escapeHtml((hasTeamBBowling ? teamB : teamA).toUpperCase())}</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 44%" class="col-left pl-2">BOWLER</th>
              <th style="width: 14%" class="col-center">O</th>
              <th style="width: 14%" class="col-center">R</th>
              <th style="width: 14%" class="col-center">W</th>
              <th style="width: 14%" class="col-center">ECO</th>
            </tr>
          </thead>
          <tbody>
            ${renderBowlerRows(hasTeamBBowling ? teamBBowlers : teamABowlers)}
          </tbody>
        </table>
      </div>
      `
      }
    </div>
    `
        : ''
    }

    <!-- 8. Key Match Notes -->
    ${
      topBatter || bestBowler || winMarginText
        ? `
    <div class="section-gap">
      <div class="section-tab">KEY MATCH NOTES</div>
      <div class="card-body">
        <div class="notes-container">
          ${
            topBatter
              ? `
          <div class="note-item">
            <div class="note-label">TOP BATTER</div>
            <div class="note-val">${escapeHtml(cleanPlayerName(topBatter.name))} &bull; ${topBatter.runs} (${topBatter.balls})</div>
          </div>
          `
              : ''
          }
          ${
            bestBowler
              ? `
          <div class="note-item">
            <div class="note-label">BEST BOWLER</div>
            <div class="note-val">${escapeHtml(cleanPlayerName(bestBowler.name))} &bull; ${bestBowler.wickets}/${bestBowler.runs}</div>
          </div>
          `
              : ''
          }
          ${
            winMarginText
              ? `
          <div class="note-item">
            <div class="note-label">WIN MARGIN</div>
            <div class="note-val">${escapeHtml(winMarginText)}</div>
          </div>
          `
              : ''
          }
        </div>
      </div>
    </div>
    `
        : ''
    }
  </div>

  <!-- 9. Footer -->
  <div class="footer">
    OFFICIAL MATCH PERFORMANCE &bull; ${escapeHtml(oversLabel)}
  </div>
</body>
</html>`;
  }
}
