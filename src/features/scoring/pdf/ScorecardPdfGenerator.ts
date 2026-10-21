/**
 * ScorecardPdfGenerator — Official Match Report PDF Generator
 * Master Visual Design Reference:
 * Exact A4 portrait layout, dark green visual identity (#1f5a3a),
 * white rounded cards, dynamic highlights, two-column bowling figures,
 * and 100% dynamic data mapping from application state.
 * Refined typography, vertical centering, perfect column alignment, and balanced font weights.
 */

import type jsPDFType from 'jspdf';
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

export type PdfGenerationStep = 'preparing' | 'generating' | 'finalizing' | 'ready';

export interface DownloadPdfOptions {
  onProgress?: (step: PdfGenerationStep) => void;
  signal?: AbortSignal;
}

export class ScorecardPdfGenerator {
  /**
   * Draws a 5-pointed vector star with crisp lines in any PDF viewer.
   */
  private static drawStar(
    doc: any,
    cx: number,
    cy: number,
    r: number,
    color: [number, number, number] = [255, 255, 255]
  ): void {
    doc.setFillColor(...color);
    const innerR = r * 0.4;
    const spikes = 5;
    const step = Math.PI / spikes;
    let rot = -Math.PI / 2;
    const pts: [number, number][] = [];
    for (let i = 0; i < spikes * 2; i++) {
      const curR = i % 2 === 0 ? r : innerR;
      pts.push([cx + Math.cos(rot) * curR, cy + Math.sin(rot) * curR]);
      rot += step;
    }
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      doc.triangle(cx, cy, p1[0], p1[1], p2[0], p2[1], 'F');
    }
  }

  /**
   * Resolves the actual human-readable ground name associated with the match from
   * the database (GroundRepository) and data model.
   * Strictly avoids numeric IDs, array indexes, or placeholder codes.
   * Returns null if no valid alphabetic ground name is available.
   */
  static async resolveGroundName(match: MatchScorecard): Promise<string | null> {
    if (!match) return null;

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

    // 0. Query persisted Dexie match record if available for latest persisted match state
    let dbMatch: MatchScorecard | undefined;
    if (match.id) {
      try {
        const { db } = await import('@/infrastructure/database/dexie-db');
        dbMatch = await db.matches.get(match.id);
      } catch {
        // Fall through gracefully if Dexie lookup fails
      }
    }

    // 1. Direct match venue: authoritative user-specified or saved venue on the match
    const directVenue = (match.venue || '').trim();
    const dbVenue = (dbMatch?.venue || '').trim();
    const advVenue = (match.advancedSettings?.venue || dbMatch?.advancedSettings?.venue || '').trim();

    // If venue field itself contains a ground ID (e.g. "ground_12345"), resolve from GroundRepository
    const possibleGroundIdInVenue =
      (/^ground_/i.test(directVenue) && directVenue) ||
      (/^ground_/i.test(dbVenue) && dbVenue) ||
      (/^ground_/i.test(advVenue) && advVenue);

    if (possibleGroundIdInVenue) {
      try {
        const { GroundRepository } = await import('@/infrastructure/storage/GroundRepository');
        const ground = await GroundRepository.getGround(possibleGroundIdInVenue);
        if (ground && isReadable(ground.name)) {
          return ground.name.trim();
        }
      } catch {
        // Fall through
      }
    }

    // 2. Query GroundRepository using target groundId
    const targetGroundId =
      match.groundId ||
      dbMatch?.groundId ||
      match.advancedSettings?.groundId ||
      dbMatch?.advancedSettings?.groundId;

    let linkedGroundName: string | null = null;
    if (targetGroundId && typeof targetGroundId === 'string' && targetGroundId.trim()) {
      try {
        const { GroundRepository } = await import('@/infrastructure/storage/GroundRepository');
        const ground = await GroundRepository.getGround(targetGroundId.trim());
        if (ground && isReadable(ground.name)) {
          linkedGroundName = ground.name.trim();
        }
      } catch {
        // Fall through
      }
    }

    // Direct venue precedence:
    // User explicitly provided or confirmed direct venue on the match has top priority
    if (isReadable(directVenue)) {
      return directVenue;
    }
    if (isReadable(dbVenue)) {
      return dbVenue;
    }
    if (isReadable(advVenue)) {
      return advVenue;
    }

    // If direct venue was empty or invalid (e.g. was a ground ID or numeric), use linked ground from database
    if (linkedGroundName) {
      return linkedGroundName;
    }

    // 3. Fallback: Check location referencePlaceName (e.g. from GPS smart landmark detection)
    const refPlace = match.location?.referencePlaceName || dbMatch?.location?.referencePlaceName;
    if (refPlace && isReadable(refPlace)) {
      const smartName = SmartGroundDetectionService.generateSmartGroundName(
        refPlace,
        'EDUCATIONAL_CAMPUS'
      );
      if (isReadable(smartName)) {
        return smartName;
      }
    }

    return null;
  }

  /**
   * Generates the Master PDF document populated dynamically with match data.
   */
  static async generatePdf(
    match: MatchScorecard,
    options?: { groundName?: string | null }
  ): Promise<jsPDFType> {
    const jsPDF = (await import('jspdf')).default;
    await import('jspdf-autotable');
    const { registerBengaliFontsInJsPdf, hasBengaliText, BENGALI_FONT_NAME } = await import('./bengaliFont');

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    registerBengaliFontsInJsPdf(doc);

    const setDocFont = (text: string | null | undefined, weight: 'bold' | 'normal' = 'normal') => {
      if (text && hasBengaliText(text)) {
        doc.setFont(BENGALI_FONT_NAME, weight);
      } else {
        doc.setFont('helvetica', weight);
      }
    };

    const pageWidth = doc.internal.pageSize.getWidth(); // 210 mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
    const margin = 12;
    const contentWidth = pageWidth - margin * 2; // 186 mm

    // Master Color Palette
    const pageBgColor: [number, number, number] = [244, 246, 245]; // #f4f6f5
    const darkGreen: [number, number, number] = [31, 90, 58]; // #1f5a3a
    const lightMintText: [number, number, number] = [208, 230, 216]; // #d0e6d8
    const resultBarBg: [number, number, number] = [219, 233, 226]; // #dbe9e2
    const resultBarText: [number, number, number] = [23, 77, 50]; // #174d32
    const white: [number, number, number] = [255, 255, 255];
    const cardBorder: [number, number, number] = [226, 232, 240]; // #e2e8f0
    const primaryText: [number, number, number] = [15, 23, 42]; // #0f172a
    const secondaryText: [number, number, number] = [71, 85, 105]; // #475569
    const mutedText: [number, number, number] = [100, 116, 139]; // #64748b
    const darkSlateText: [number, number, number] = [51, 65, 85]; // #334155
    const amberScoreText: [number, number, number] = [214, 166, 64]; // #d6a640
    const tableLineColor: [number, number, number] = [241, 245, 249]; // #f1f5f9

    const paintPageBackground = () => {
      doc.setFillColor(...pageBgColor);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
    };

    paintPageBackground();

    // ── DATA PREPARATION & CONDITIONAL CHECKS ──
    const teamA = (match.teamA || 'Team A').trim();
    const teamB = (match.teamB || 'Team B').trim();

    // Batting data filtering (only players who participated in batting)
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

    // Bowlers who bowled against Team 1 (first innings bowlers)
    const firstInnBowlers = getActiveBowlers(match.firstInnings);
    // Bowlers who bowled against Team 2 (second innings bowlers)
    const secondInnBowlers = getActiveBowlers(match.secondInnings);

    // Dynamic density calculation
    const totalBattingRows = inn1Batters.length + inn2Batters.length;
    const maxBowlingRows = Math.max(firstInnBowlers.length, secondInnBowlers.length);
    const isDenseMatch = totalBattingRows > 14 || maxBowlingRows > 5;

    const headerCardH = isDenseMatch ? 18 : 20;
    const scoreCardH = isDenseMatch ? 15 : 17;
    const resultBarH = isDenseMatch ? 6.5 : 7.5;
    const tabHeight = isDenseMatch ? 5.5 : 6;
    const motmBodyH = isDenseMatch ? 13.5 : 15;
    const notesBodyH = isDenseMatch ? 11.5 : 13;
    const baseGap = isDenseMatch ? 2.2 : 2.8;

    const tableCellPadding = isDenseMatch
      ? { top: 1.0, bottom: 1.0, left: 1.5, right: 1.5 }
      : { top: 1.3, bottom: 1.3, left: 1.5, right: 1.5 };
    const tableFontSize = isDenseMatch ? 6.5 : 6.8;

    let currentY = 10;

    // ── 1. TOP MATCH HEADER CARD ──
    doc.setFillColor(...darkGreen);
    doc.roundedRect(margin, currentY, contentWidth, headerCardH, 3.5, 3.5, 'F');

    doc.setTextColor(...white);
    setDocFont(teamA, 'bold');
    doc.setFontSize(isDenseMatch ? 13.5 : 14.5);
    doc.text(teamA.toUpperCase(), pageWidth / 2, currentY + (isDenseMatch ? 5.8 : 6.5), { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isDenseMatch ? 7.5 : 8);
    doc.setTextColor(...lightMintText);
    doc.text('vs', pageWidth / 2, currentY + (isDenseMatch ? 10.5 : 11.5), { align: 'center' });

    setDocFont(teamB, 'bold');
    doc.setFontSize(isDenseMatch ? 13.5 : 14.5);
    doc.setTextColor(...white);
    doc.text(teamB.toUpperCase(), pageWidth / 2, currentY + (isDenseMatch ? 15.5 : 17), { align: 'center' });

    currentY += headerCardH + baseGap;

    // ── 1.5. GROUND INFORMATION SECTION ──
    const groundName =
      options?.groundName !== undefined
        ? options.groundName
        : await ScorecardPdfGenerator.resolveGroundName(match);
    const displayGroundName = groundName || 'Not Available';

    const groundTabH = isDenseMatch ? 5.0 : 5.6;
    const groundBodyH = isDenseMatch ? 6.2 : 7.0;

    // Section header tab
    doc.setFillColor(...darkGreen);
    doc.roundedRect(margin, currentY, contentWidth, groundTabH, 2.0, 2.0, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isDenseMatch ? 7.0 : 7.5);
    doc.setTextColor(...white);
    doc.text('GROUND INFORMATION', margin + 5, currentY + groundTabH * 0.72);

    currentY += groundTabH + 1.0;

    // Section body card (Displays ONLY the single "Ground Name" field)
    doc.setFillColor(...white);
    doc.setDrawColor(...cardBorder);
    doc.setLineWidth(0.2);
    doc.roundedRect(margin, currentY, contentWidth, groundBodyH, 2.0, 2.0, 'FD');

    setDocFont(displayGroundName, 'bold');
    doc.setFontSize(isDenseMatch ? 7.6 : 8.2);
    doc.setTextColor(...primaryText);

    const prefix = 'Ground Name: ';
    const maxTextWidth = contentWidth - 10;
    let fullText = `${prefix}${displayGroundName}`;
    if (doc.getTextWidth(fullText) > maxTextWidth) {
      while (fullText.length > prefix.length + 3 && doc.getTextWidth(fullText + '...') > maxTextWidth) {
        fullText = fullText.slice(0, -1);
      }
      fullText += '...';
    }

    doc.text(fullText, margin + 5, currentY + groundBodyH * 0.65);

    currentY += groundBodyH + baseGap;

    // ── 2. SCORE SUMMARY CARD ──
    const inn1 = match.firstInnings;
    const inn2 = match.secondInnings;
    const hasInn1 = !!inn1 && (inn1.totalRuns > 0 || inn1.totalBalls > 0 || inn1.totalWickets > 0);
    const hasInn2 = !!inn2 && (inn2.totalRuns > 0 || inn2.totalBalls > 0 || inn2.totalWickets > 0);

    if (hasInn1 || hasInn2) {
      doc.setFillColor(...white);
      doc.setDrawColor(...cardBorder);
      doc.setLineWidth(0.2);
      doc.roundedRect(margin, currentY, contentWidth, scoreCardH, 3, 3, 'FD');

      const renderInningsSummary = (
        innings: InningsData,
        cx: number
      ) => {
        const balls = ballsFromOversString(innings.oversString);
        const rr = currentRunRate(innings.totalRuns, balls);

        setDocFont(innings.team, 'bold');
        doc.setFontSize(isDenseMatch ? 7 : 7.5);
        doc.setTextColor(...darkSlateText);
        doc.text(innings.team.toUpperCase(), cx, currentY + (isDenseMatch ? 3.8 : 4.2), { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(isDenseMatch ? 15 : 16.5);
        doc.setTextColor(...primaryText);
        doc.text(`${innings.totalRuns} / ${innings.totalWickets}`, cx, currentY + (isDenseMatch ? 9.8 : 10.8), {
          align: 'center',
        });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(isDenseMatch ? 7 : 7.5);
        doc.setTextColor(...mutedText);
        doc.text(
          `${innings.oversString} overs \u2022 RR ${rr.toFixed(2)}`,
          cx,
          currentY + (isDenseMatch ? 13.5 : 14.8),
          { align: 'center' }
        );
      };

      if (hasInn1 && hasInn2) {
        renderInningsSummary(inn1!, margin + contentWidth * 0.25);
        renderInningsSummary(inn2!, margin + contentWidth * 0.75);
      } else if (hasInn1) {
        renderInningsSummary(inn1!, pageWidth / 2);
      } else if (hasInn2) {
        renderInningsSummary(inn2!, pageWidth / 2);
      }

      currentY += scoreCardH + baseGap;
    }

    // ── 3. MATCH RESULT BAR ──
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

    if (resultText) {
      doc.setFillColor(...resultBarBg);
      doc.roundedRect(margin, currentY, contentWidth, resultBarH, 2.5, 2.5, 'F');

      setDocFont(resultText, 'bold');
      doc.setFontSize(isDenseMatch ? 8 : 8.5);
      doc.setTextColor(...resultBarText);
      doc.text(resultText.toUpperCase(), pageWidth / 2, currentY + (isDenseMatch ? 4.5 : 5.0), { align: 'center' });

      currentY += resultBarH + baseGap;
    }

    // ── 4. MAN OF THE MATCH CARD ──
    const mom = ManOfTheMatchEngine.resolveForMatch(match);

    if (mom && mom.name) {
      // Header pill
      doc.setFillColor(...darkGreen);
      doc.roundedRect(margin, currentY, contentWidth, tabHeight, 2.5, 2.5, 'F');

      ScorecardPdfGenerator.drawStar(doc, margin + 5.5, currentY + tabHeight / 2, 1.4);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...white);
      doc.text('MAN OF THE MATCH', margin + 8.5, currentY + tabHeight * 0.72);

      currentY += tabHeight + 1.2;

      // Card body
      const motmBodyY = currentY;
      doc.setFillColor(...white);
      doc.setDrawColor(...cardBorder);
      doc.setLineWidth(0.2);
      doc.roundedRect(margin, motmBodyY, contentWidth, motmBodyH, 2.5, 2.5, 'FD');

      // Dynamic Highlight Columns for MOTM
      const motmCols: { title: string; sub: string; isAmber?: boolean; isTitle?: boolean }[] = [];

      motmCols.push({
        title: cleanPlayerName(mom.name).toUpperCase(),
        sub: mom.role || 'Player',
        isTitle: true,
      });

      if (mom.balls > 0 || mom.runs > 0) {
        motmCols.push({
          title: mom.runs.toString(),
          sub: `off ${mom.balls} balls`,
        });
      }

      if (mom.ballsBowled > 0) {
        const oversStr = `${Math.floor(mom.ballsBowled / 6)}.${mom.ballsBowled % 6}`;
        motmCols.push({
          title: `${mom.wickets} / ${mom.bowlingRuns}`,
          sub: `${oversStr} overs`,
        });
      }

      if (mom.balls > 0) {
        const srVal = strikeRate(mom.runs, mom.balls);
        motmCols.push({
          title: srVal.toFixed(1),
          sub: 'strike rate',
        });
      }

      if (mom.totalPoints > 0) {
        motmCols.push({
          title: mom.totalPoints.toFixed(1),
          sub: 'impact score',
          isAmber: true,
        });
      }

      const motmStep = contentWidth / motmCols.length;
      motmCols.forEach((col, idx) => {
        const cx = margin + motmStep * idx + motmStep / 2;

        setDocFont(col.title, col.isTitle ? 'bold' : 'normal');
        doc.setFontSize(col.isAmber ? 12.5 : col.isTitle ? 10.5 : 12.0);
        if (col.isAmber) {
          doc.setTextColor(...amberScoreText);
        } else {
          doc.setTextColor(...primaryText);
        }
        doc.text(col.title, cx, motmBodyY + (isDenseMatch ? 5.8 : 6.2), { align: 'center' });

        setDocFont(col.sub, 'normal');
        doc.setFontSize(isDenseMatch ? 6.5 : 6.8);
        doc.setTextColor(...mutedText);
        doc.text(col.sub, cx, motmBodyY + (isDenseMatch ? 10.2 : 11.0), { align: 'center' });
      });

      currentY = motmBodyY + motmBodyH + baseGap;
    }

    // ── 5 & 6. BATTING TABLES ──
    const renderBattingSection = (innings: InningsData, batters: Player[]) => {
      if (batters.length === 0) return;

      // Section header tab
      doc.setFillColor(...darkGreen);
      doc.roundedRect(margin, currentY, contentWidth, tabHeight, 2.5, 2.5, 'F');

      setDocFont(innings.team, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...white);
      doc.text(`${innings.team.toUpperCase()} \u2022 BATTING`, margin + 5, currentY + tabHeight * 0.72);

      currentY += tabHeight + 1.2;

      const battingRows = batters.map((p, idx) => {
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

        return [
          (idx + 1).toString(),
          name,
          status,
          p.runs.toString(),
          p.balls.toString(),
          p.fours.toString(),
          p.sixes.toString(),
          sr,
        ];
      });

      (doc as any).autoTable({
        startY: currentY,
        margin: { left: margin, right: margin },
        tableWidth: contentWidth,
        head: [['#', 'PLAYER', 'STATUS', 'R', 'B', '4s', '6s', 'SR']],
        body: battingRows,
        theme: 'plain',
        headStyles: {
          fillColor: darkGreen,
          textColor: white,
          fontStyle: 'normal',
          fontSize: tableFontSize,
          cellPadding: { top: 1.5, bottom: 1.5, left: 1.5, right: 1.5 },
          valign: 'middle',
        },
        styles: {
          fontSize: tableFontSize,
          fontStyle: 'normal',
          cellPadding: tableCellPadding,
          valign: 'middle',
          textColor: primaryText,
          lineColor: tableLineColor,
          lineWidth: 0.15,
          fillColor: white,
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 10, textColor: mutedText },
          1: { halign: 'left', cellWidth: 48, textColor: primaryText, cellPadding: { left: 2.5, right: 1.5 } },
          2: { halign: 'center', cellWidth: 44, textColor: mutedText },
          3: { halign: 'center', cellWidth: 14, textColor: primaryText },
          4: { halign: 'center', cellWidth: 14, textColor: secondaryText },
          5: { halign: 'center', cellWidth: 14, textColor: secondaryText },
          6: { halign: 'center', cellWidth: 14, textColor: secondaryText },
          7: { halign: 'center', cellWidth: 28, textColor: primaryText },
        },
        didParseCell: (data: any) => {
          const rawText = String(data.cell.raw ?? data.cell.text ?? '');
          if (hasBengaliText(rawText)) {
            data.cell.styles.font = BENGALI_FONT_NAME;
          }
          if (data.section === 'head') {
            if (data.column.index === 1) {
              data.cell.styles.halign = 'left';
              data.cell.styles.cellPadding = { left: 2.5, right: 1.5 };
            } else {
              data.cell.styles.halign = 'center';
            }
          }
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + baseGap;
    };

    if (match.firstInnings) {
      renderBattingSection(match.firstInnings, inn1Batters);
    }
    if (match.secondInnings) {
      renderBattingSection(match.secondInnings, inn2Batters);
    }

    // ── 7. BOWLING FIGURES (Two columns side by side) ──
    const teamABowlers = secondInnBowlers.length > 0 ? secondInnBowlers : [];
    const teamBBowlers = firstInnBowlers.length > 0 ? firstInnBowlers : [];

    const hasTeamABowling = teamABowlers.length > 0;
    const hasTeamBBowling = teamBBowlers.length > 0;

    if (hasTeamABowling || hasTeamBBowling) {
      doc.setFillColor(...darkGreen);
      doc.roundedRect(margin, currentY, contentWidth, tabHeight, 2.5, 2.5, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...white);
      doc.text('BOWLING FIGURES', margin + 5, currentY + tabHeight * 0.72);

      currentY += tabHeight + 1.2;

      const formatBowlerRow = (b: Bowler) => {
        const overs = `${Math.floor(b.ballsBowled / 6)}.${b.ballsBowled % 6}`;
        const eco = economyRate(b.runs, b.ballsBowled).toFixed(1);
        return [cleanPlayerName(b.name), overs, b.runs.toString(), b.wickets.toString(), eco];
      };

      if (hasTeamABowling && hasTeamBBowling) {
        const bowlColW = (contentWidth - 4) / 2; // 91 mm
        const rightColX = margin + bowlColW + 4;
        const bowlContainerY = currentY;

        // Subheaders
        setDocFont(teamA, 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...darkGreen);
        doc.text(teamA.toUpperCase(), margin + 3, bowlContainerY + 4.8);
        setDocFont(teamB, 'bold');
        doc.text(teamB.toUpperCase(), rightColX + 3, bowlContainerY + 4.8);

        const bowlingHeadStyles = {
          fillColor: darkGreen,
          textColor: white,
          fontStyle: 'normal',
          fontSize: isDenseMatch ? 6.2 : 6.5,
          cellPadding: { top: 1.3, bottom: 1.3, left: 1, right: 1 },
          valign: 'middle',
        };

        const bowlingRowStyles = {
          fontSize: isDenseMatch ? 6.2 : 6.5,
          fontStyle: 'normal',
          cellPadding: isDenseMatch
            ? { top: 0.8, bottom: 0.8, left: 1, right: 1 }
            : { top: 1.0, bottom: 1.0, left: 1, right: 1 },
          valign: 'middle',
          textColor: primaryText,
          lineColor: tableLineColor,
          lineWidth: 0.15,
          fillColor: white,
        };

        const bowlingColumnStyles = {
          0: { halign: 'left', cellWidth: 33, textColor: primaryText, cellPadding: { left: 2, right: 1 } },
          1: { halign: 'center', cellWidth: 14, textColor: secondaryText },
          2: { halign: 'center', cellWidth: 14, textColor: secondaryText },
          3: { halign: 'center', cellWidth: 14, textColor: primaryText },
          4: { halign: 'center', cellWidth: 14, textColor: primaryText },
        };

        // Left Bowling Table (Team A)
        (doc as any).autoTable({
          startY: bowlContainerY + 6.2,
          margin: { left: margin + 1 },
          tableWidth: bowlColW - 2,
          head: [['BOWLER', 'O', 'R', 'W', 'ECO']],
          body: teamABowlers.map(formatBowlerRow),
          theme: 'plain',
          headStyles: bowlingHeadStyles,
          styles: bowlingRowStyles,
          columnStyles: bowlingColumnStyles,
          didParseCell: (data: any) => {
            const rawText = String(data.cell.raw ?? data.cell.text ?? '');
            if (hasBengaliText(rawText)) {
              data.cell.styles.font = BENGALI_FONT_NAME;
            }
            if (data.section === 'head') {
              if (data.column.index === 0) {
                data.cell.styles.halign = 'left';
                data.cell.styles.cellPadding = { left: 2, right: 1 };
              } else {
                data.cell.styles.halign = 'center';
              }
            }
          },
        });
        const leftBowlFinalY = (doc as any).lastAutoTable.finalY;

        // Right Bowling Table (Team B)
        (doc as any).autoTable({
          startY: bowlContainerY + 6.2,
          margin: { left: rightColX + 1 },
          tableWidth: bowlColW - 2,
          head: [['BOWLER', 'O', 'R', 'W', 'ECO']],
          body: teamBBowlers.map(formatBowlerRow),
          theme: 'plain',
          headStyles: bowlingHeadStyles,
          styles: bowlingRowStyles,
          columnStyles: bowlingColumnStyles,
          didParseCell: (data: any) => {
            const rawText = String(data.cell.raw ?? data.cell.text ?? '');
            if (hasBengaliText(rawText)) {
              data.cell.styles.font = BENGALI_FONT_NAME;
            }
            if (data.section === 'head') {
              if (data.column.index === 0) {
                data.cell.styles.halign = 'left';
                data.cell.styles.cellPadding = { left: 2, right: 1 };
              } else {
                data.cell.styles.halign = 'center';
              }
            }
          },
        });
        const rightBowlFinalY = (doc as any).lastAutoTable.finalY;

        const maxBowlFinalY = Math.max(leftBowlFinalY, rightBowlFinalY);
        const actualCardH = maxBowlFinalY - bowlContainerY + 2;

        // Draw card borders around each bowling section
        doc.setDrawColor(...cardBorder);
        doc.setLineWidth(0.2);
        doc.roundedRect(margin, bowlContainerY, bowlColW, actualCardH, 2.5, 2.5, 'S');
        doc.roundedRect(rightColX, bowlContainerY, bowlColW, actualCardH, 2.5, 2.5, 'S');

        currentY = bowlContainerY + actualCardH + baseGap;
      } else {
        // Single bowling table (e.g. 1st innings only)
        const singleTeam = hasTeamBBowling ? teamB : teamA;
        const singleBowlers = hasTeamBBowling ? teamBBowlers : teamABowlers;
        const bowlContainerY = currentY;

        setDocFont(singleTeam, 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...darkGreen);
        doc.text(singleTeam.toUpperCase(), margin + 3, bowlContainerY + 4.8);

        (doc as any).autoTable({
          startY: bowlContainerY + 6.2,
          margin: { left: margin + 1, right: margin + 1 },
          tableWidth: contentWidth - 2,
          head: [['BOWLER', 'O', 'R', 'W', 'ECO']],
          body: singleBowlers.map(formatBowlerRow),
          theme: 'plain',
          headStyles: {
            fillColor: darkGreen,
            textColor: white,
            fontStyle: 'normal',
            fontSize: tableFontSize,
            cellPadding: { top: 1.3, bottom: 1.3, left: 1, right: 1 },
            valign: 'middle',
          },
          styles: {
            fontSize: tableFontSize,
            fontStyle: 'normal',
            cellPadding: tableCellPadding,
            valign: 'middle',
            textColor: primaryText,
            lineColor: tableLineColor,
            lineWidth: 0.15,
            fillColor: white,
          },
          columnStyles: {
            0: { halign: 'left', cellWidth: 70, textColor: primaryText, cellPadding: { left: 2.5, right: 1 } },
            1: { halign: 'center', cellWidth: 28, textColor: secondaryText },
            2: { halign: 'center', cellWidth: 28, textColor: secondaryText },
            3: { halign: 'center', cellWidth: 28, textColor: primaryText },
            4: { halign: 'center', cellWidth: 30, textColor: primaryText },
          },
          didParseCell: (data: any) => {
            const rawText = String(data.cell.raw ?? data.cell.text ?? '');
            if (hasBengaliText(rawText)) {
              data.cell.styles.font = BENGALI_FONT_NAME;
            }
            if (data.section === 'head') {
              if (data.column.index === 0) {
                data.cell.styles.halign = 'left';
                data.cell.styles.cellPadding = { left: 2.5, right: 1 };
              } else {
                data.cell.styles.halign = 'center';
              }
            }
          },
        });

        const singleFinalY = (doc as any).lastAutoTable.finalY;
        const actualCardH = singleFinalY - bowlContainerY + 2;

        doc.setDrawColor(...cardBorder);
        doc.setLineWidth(0.2);
        doc.roundedRect(margin, bowlContainerY, contentWidth, actualCardH, 2.5, 2.5, 'S');

        currentY = bowlContainerY + actualCardH + baseGap;
      }
    }

    // ── 8. KEY MATCH NOTES CARD ──
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

    const notesList: { label: string; val: string }[] = [];
    if (topBatter) {
      notesList.push({
        label: 'TOP BATTER',
        val: `${cleanPlayerName(topBatter.name)} \u2022 ${topBatter.runs} (${topBatter.balls})`,
      });
    }
    if (bestBowler) {
      notesList.push({
        label: 'BEST BOWLER',
        val: `${cleanPlayerName(bestBowler.name)} \u2022 ${bestBowler.wickets}/${bestBowler.runs}`,
      });
    }
    if (winMarginText) {
      notesList.push({
        label: 'WIN MARGIN',
        val: winMarginText,
      });
    }

    if (notesList.length > 0) {
      doc.setFillColor(...darkGreen);
      doc.roundedRect(margin, currentY, contentWidth, tabHeight, 2.5, 2.5, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...white);
      doc.text('KEY MATCH NOTES', margin + 5, currentY + tabHeight * 0.72);

      currentY += tabHeight + 1.2;

      const notesBodyY = currentY;
      doc.setFillColor(...white);
      doc.setDrawColor(...cardBorder);
      doc.setLineWidth(0.2);
      doc.roundedRect(margin, notesBodyY, contentWidth, notesBodyH, 2.5, 2.5, 'FD');

      const noteStep = contentWidth / notesList.length;
      notesList.forEach((item, idx) => {
        const cx = margin + noteStep * idx + noteStep / 2;

        // Dynamic vertical divider between items
        if (idx > 0) {
          const divX = margin + noteStep * idx;
          doc.setDrawColor(...cardBorder);
          doc.setLineWidth(0.2);
          doc.line(divX, notesBodyY + 2.5, divX, notesBodyY + notesBodyH - 2.5);
        }

        setDocFont(item.label, 'normal');
        doc.setFontSize(isDenseMatch ? 6.2 : 6.8);
        doc.setTextColor(...mutedText);
        doc.text(item.label, cx, notesBodyY + (isDenseMatch ? 4.2 : 4.5), { align: 'center' });

        setDocFont(item.val, 'bold');
        doc.setFontSize(isDenseMatch ? 8.5 : 9.5);
        doc.setTextColor(...primaryText);
        doc.text(item.val, cx, notesBodyY + (isDenseMatch ? 8.8 : 9.5), { align: 'center' });
      });

      currentY = notesBodyY + notesBodyH + baseGap + 1;
    }

    // ── 9. FOOTER ──
    const oversLabel = match.totalOvers ? `${match.totalOvers}-OVER GAME` : 'MATCH REPORT';
    setDocFont(oversLabel, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...mutedText);
    doc.text(
      `OFFICIAL MATCH PERFORMANCE \u2022 ${oversLabel}`,
      pageWidth / 2,
      Math.min(pageHeight - 6, currentY + 3),
      { align: 'center' }
    );

    return doc;
  }

  /**
   * Downloads the generated match report PDF with clean file naming.
   * Leverages high-fidelity vector PDF export with Bengali shaping when online,
   * with seamless offline client-side fallback.
   * Reports asynchronous progress steps: 'preparing' -> 'generating' -> 'finalizing' -> 'ready'.
   */
  static async downloadPdf(
    match: MatchScorecard,
    optionsOrProgress?: ((step: PdfGenerationStep) => void) | DownloadPdfOptions
  ): Promise<void> {
    if (!match) {
      throw new Error('Cannot generate PDF: No match scorecard data provided');
    }

    const onProgress = typeof optionsOrProgress === 'function'
      ? optionsOrProgress
      : optionsOrProgress?.onProgress;

    // Step 1: Preparing match data
    onProgress?.('preparing');

    // Yield to the browser so the modal and UI state can paint before heavy operations
    await new Promise<void>((resolve) => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => setTimeout(resolve, 0));
      } else {
        setTimeout(resolve, 0);
      }
    });

    const fileName = `${match.teamA || 'TeamA'} vs ${match.teamB || 'TeamB'} Match Report.pdf`.replace(
      /[/\\?%*:|"<>]/g,
      '-'
    );

    const groundName = await ScorecardPdfGenerator.resolveGroundName(match);

    // Step 2: Generating scorecard
    onProgress?.('generating');
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 1. Try high-fidelity server/Chromium vector PDF export (if in browser)
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        const res = await fetch('/api/pdf/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ match, groundName }),
        });
        if (res.ok) {
          // Step 3: Finalizing PDF
          onProgress?.('finalizing');
          await new Promise((resolve) => setTimeout(resolve, 0));

          const blob = await res.blob();
          if (blob && blob.size > 0) {
            // Step 4: PDF ready
            onProgress?.('ready');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => {
              if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
                URL.revokeObjectURL(url);
              }
            }, 2000);
            return;
          }
        }
      } catch (serverErr) {
        // Fall back gracefully to client jsPDF generation if server API is unreachable (e.g. offline)
        console.warn('[ScorecardPdfGenerator] Server PDF export unavailable, falling back to client jsPDF:', serverErr);
      }
    }

    // 2. Client-side fallback via jsPDF with embedded Bengali font
    try {
      onProgress?.('generating');
      await new Promise((resolve) => setTimeout(resolve, 0));
      const doc = await this.generatePdf(match);

      // Step 3: Finalizing PDF
      onProgress?.('finalizing');
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Step 4: PDF ready
      onProgress?.('ready');
      doc.save(fileName);
    } catch (clientErr: any) {
      console.error('[ScorecardPdfGenerator] Client-side PDF generation failed:', clientErr);
      throw new Error(
        clientErr?.message && typeof clientErr.message === 'string' && !clientErr.message.includes('Error:')
          ? clientErr.message
          : 'Unable to generate PDF scorecard. Please check your device memory or try again.'
      );
    }
  }

  /**
   * Directly triggers the browser print dialog for the generated PDF.
   * Utilizes the master-styled HTML scorecard for crisp vector output & native shaping.
   */
  static async printPdf(match: MatchScorecard): Promise<void> {
    if (typeof window !== 'undefined') {
      try {
        const groundName = await ScorecardPdfGenerator.resolveGroundName(match);
        const { ScorecardHtmlGenerator } = await import('./ScorecardHtmlGenerator');
        const html = ScorecardHtmlGenerator.generateHtml(match, groundName);

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();
          iframe.contentWindow?.focus();
          setTimeout(() => {
            iframe.contentWindow?.print();
            setTimeout(() => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            }, 3000);
          }, 400);
          return;
        }
      } catch (e) {
        console.warn('[ScorecardPdfGenerator] print iframe failed, falling back to jsPDF:', e);
      }
    }

    const doc = await this.generatePdf(match);
    doc.autoPrint();
    const blobUrl = doc.output('bloburl');
    if (typeof window !== 'undefined') {
      window.open(blobUrl, '_blank');
    }
  }
}
