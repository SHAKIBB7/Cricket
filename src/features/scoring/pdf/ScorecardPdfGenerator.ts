/**
 * ScorecardPdfGenerator — Official Match Scorecard PDF Generator
 * Matches the exact A4 layout, styling, and derived metrics from Flutter's
 * FullScoreboardScreen and REUSABLE_LOGIC_GUIDE_BN.md §7.
 */

import type jsPDFType from 'jspdf';
import { MatchScorecard, InningsData } from '@/domain/cricket/types';
import {
 cleanPlayerName,
 pdfStrikeRate,
 economyRate,
 currentRunRate,
 ballsFromOversString,
} from '@/domain/cricket/formatters';
import { ManOfTheMatchEngine } from '@/domain/cricket/analytics/ManOfTheMatchEngine';

export class ScorecardPdfGenerator {
 static async generatePdf(match: MatchScorecard): Promise<jsPDFType> {
 const jsPDF = (await import('jspdf')).default;
 const autoTable = (await import('jspdf-autotable')).default;

 const doc = new jsPDF({
 orientation: 'portrait',
 unit: 'mm',
 format: 'a4',
 });

 const pageWidth = doc.internal.pageSize.getWidth();
 const margin = 14;

 // Cricket Color Palette (Primary emerald #1B7A4E, HeaderBg #E8F5E9, Text #1C1917)
 const primaryColor: [number, number, number] = [27, 122, 78];
 const headerBgColor: [number, number, number] = [232, 245, 233];
 const textColor: [number, number, number] = [28, 25, 23];
 const mutedColor: [number, number, number] = [110, 110, 115];

 let currentY = margin;

 // ── HEADER ──
 doc.setFillColor(...primaryColor);
 doc.rect(margin, currentY, pageWidth - margin * 2, 18, 'F');

 doc.setTextColor(255, 255, 255);
 doc.setFont('helvetica', 'bold');
 doc.setFontSize(14);
 doc.text('CRIC SCORER PRO — OFFICIAL MATCH SCORECARD', pageWidth / 2, currentY + 7, {
 align: 'center',
 });

 doc.setFontSize(10);
 doc.setFont('helvetica', 'normal');
 doc.text(`${match.teamA} vs ${match.teamB}`, pageWidth / 2, currentY + 13, {
 align: 'center',
 });

 currentY += 24;

 // ── MATCH OVERVIEW INFO GRID ──
 doc.setTextColor(...textColor);
 doc.setFontSize(9);

 const matchDate = match.createdAt
 ? new Date(match.createdAt).toLocaleDateString(undefined, {
 year: 'numeric',
 month: 'short',
 day: 'numeric',
 hour: '2-digit',
 minute: '2-digit',
 })
 : 'Live Match';

 const infoData: any[][] = [
 [
 { content: `Venue: ${match.venue || 'Standard Ground'}`, styles: { fontStyle: 'bold' } },
 { content: `Toss: ${match.tossWinner} opted to ${match.tossDecision}`, styles: { fontStyle: 'bold' } },
 ],
 [
 { content: `Match Type: ${match.totalOvers} Overs Limited Match` },
 { content: `Date & Time: ${matchDate}` },
 ],
 [
 {
 content: `Result: ${match.result || (match.winner ? `${match.winner} won` : 'Match in Progress')}`,
 colSpan: 2,
 styles: { textColor: primaryColor, fontStyle: 'bold' },
 },
 ],
 ];

 autoTable(doc, {
 startY: currentY,
 margin: { left: margin, right: margin },
 body: infoData,
 theme: 'grid',
 styles: { fontSize: 8.5, cellPadding: 2, textColor },
 headStyles: { fillColor: headerBgColor },
 });

 currentY = (doc as any).lastAutoTable.finalY + 6;

 // ── INNINGS SCORE SUMMARY ──
 const summaryRows = [];
 if (match.firstInnings) {
 const inn1 = match.firstInnings;
 const balls1 = ballsFromOversString(inn1.oversString);
 const rr1 = currentRunRate(inn1.totalRuns, balls1);
 const totalExtras1 = inn1.wideRuns + inn1.nbRuns + inn1.byeRuns + inn1.lbRuns;
 const extrasStr1 = `${totalExtras1} (b ${inn1.byeRuns}, lb ${inn1.lbRuns}, w ${inn1.wideRuns}, nb ${inn1.nbRuns})`;

 summaryRows.push([
 inn1.team,
 `${inn1.totalRuns}/${inn1.totalWickets}`,
 inn1.oversString,
 rr1.toFixed(2),
 extrasStr1,
 ]);
 }

 if (match.secondInnings) {
 const inn2 = match.secondInnings;
 const balls2 = ballsFromOversString(inn2.oversString);
 const rr2 = currentRunRate(inn2.totalRuns, balls2);
 const totalExtras2 = inn2.wideRuns + inn2.nbRuns + inn2.byeRuns + inn2.lbRuns;
 const extrasStr2 = `${totalExtras2} (b ${inn2.byeRuns}, lb ${inn2.lbRuns}, w ${inn2.wideRuns}, nb ${inn2.nbRuns})`;

 summaryRows.push([
 inn2.team,
 `${inn2.totalRuns}/${inn2.totalWickets}`,
 inn2.oversString,
 rr2.toFixed(2),
 extrasStr2,
 ]);
 }

 if (summaryRows.length > 0) {
 autoTable(doc, {
 startY: currentY,
 margin: { left: margin, right: margin },
 head: [['Team', 'Score', 'Overs', 'Run Rate', 'Extras']],
 body: summaryRows,
 theme: 'striped',
 headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
 styles: { fontSize: 8.5, cellPadding: 2.5, halign: 'center' },
 columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
 });
 currentY = (doc as any).lastAutoTable.finalY + 6;
 }

 // ── MAN OF THE MATCH SECTION ──
 const mom = ManOfTheMatchEngine.calculateForMatch(match.firstInnings, match.secondInnings);
 if (mom) {
 doc.setFillColor(...headerBgColor);
 doc.roundedRect(margin, currentY, pageWidth - margin * 2, 14, 2, 2, 'F');
 doc.setDrawColor(...primaryColor);
 doc.roundedRect(margin, currentY, pageWidth - margin * 2, 14, 2, 2, 'S');

 doc.setTextColor(...primaryColor);
 doc.setFont('helvetica', 'bold');
 doc.setFontSize(9.5);
 doc.text(`MAN OF THE MATCH: ${mom.name.toUpperCase()} (${mom.role}) — IMPACT POINTS: ${mom.totalPoints}`, margin + 5, currentY + 6);

 doc.setFont('helvetica', 'normal');
 doc.setTextColor(...textColor);
 doc.setFontSize(8);
 const batStats = mom.balls > 0 ? `Batting: ${mom.runs} (${mom.balls}b, ${mom.fours}x4, ${mom.sixes}x6)` : '';
 const bowlStats = mom.ballsBowled > 0 ? `Bowling: ${mom.wickets}/${mom.bowlingRuns} (${(mom.ballsBowled / 6).toFixed(1)} ov)` : '';
 const sep = batStats && bowlStats ? ' | ' : '';
 doc.text(`${batStats}${sep}${bowlStats}`, margin + 5, currentY + 11);

 currentY += 19;
 }

 // ── RENDER INNINGS DETAILS ──
 const renderInningsScorecard = (inn: InningsData, title: string) => {
 // Check page space
 if (currentY > 230) {
 doc.addPage();
 currentY = margin;
 }

 doc.setFont('helvetica', 'bold');
 doc.setFontSize(10.5);
 doc.setTextColor(...primaryColor);
 doc.text(title, margin, currentY);
 currentY += 3;

 // Batting Table
 const battingHeaders = ['Bat #', 'Batsman', 'Dismissal', 'R', 'B', '4s', '6s', 'SR'];
 const battingRows = inn.players.map((p, idx) => {
 const cleanName = cleanPlayerName(p.name);
 let dismissal = 'did not bat';
 if (p.isDismissed) {
 dismissal = p.dismissalText || 'out';
 } else if (p.balls > 0 || p.runs > 0) {
 dismissal = 'not out*';
 }

 const sr = pdfStrikeRate(p.runs, p.balls);
 return [
 (idx + 1).toString(),
 cleanName,
 dismissal,
 p.runs.toString(),
 p.balls.toString(),
 p.fours.toString(),
 p.sixes.toString(),
 sr.toString(),
 ];
 });

 autoTable(doc, {
 startY: currentY,
 margin: { left: margin, right: margin },
 head: [battingHeaders],
 body: battingRows,
 theme: 'plain',
 headStyles: { fillColor: headerBgColor, textColor: primaryColor, fontStyle: 'bold' },
 styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
 columnStyles: {
 0: { cellWidth: 12 },
 1: { halign: 'left', fontStyle: 'bold', cellWidth: 42 },
 2: { halign: 'left', fontStyle: 'italic', textColor: mutedColor },
 },
 });

 currentY = (doc as any).lastAutoTable.finalY + 4;

 // Bowling Table (Active bowlers)
 const activeBowlers = inn.bowlers.filter((b) => b.ballsBowled > 0 || b.runs > 0 || b.wickets > 0);
 if (activeBowlers.length > 0) {
 const bowlingHeaders = ['Bowler', 'O', 'M', 'R', 'W', 'Econ'];
 const bowlingRows = activeBowlers.map((b) => {
 const overs = `${Math.floor(b.ballsBowled / 6)}.${b.ballsBowled % 6}`;
 const econ = economyRate(b.runs, b.ballsBowled).toFixed(1);
 return [
 cleanPlayerName(b.name),
 overs,
 b.maidens.toString(),
 b.runs.toString(),
 b.wickets.toString(),
 econ,
 ];
 });

 autoTable(doc, {
 startY: currentY,
 margin: { left: margin, right: margin },
 head: [bowlingHeaders],
 body: bowlingRows,
 theme: 'plain',
 headStyles: { fillColor: headerBgColor, textColor: primaryColor, fontStyle: 'bold' },
 styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
 columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 45 } },
 });

 currentY = (doc as any).lastAutoTable.finalY + 4;
 }

 // Fall of Wickets
 if (inn.fallOfWickets && inn.fallOfWickets.length > 0) {
 doc.setFont('helvetica', 'normal');
 doc.setFontSize(7.5);
 doc.setTextColor(...mutedColor);
 const fowStr = inn.fallOfWickets
 .map((f) => `${f.wicket}-${f.score} (${cleanPlayerName(f.player)}, ${f.over} ov)`)
 .join(', ');
 doc.text(`Fall of Wickets: ${fowStr}`, margin, currentY);
 currentY += 6;
 }
 };

 if (match.firstInnings) {
 renderInningsScorecard(
 match.firstInnings,
 `1st Innings — ${match.firstInnings.team} (${match.firstInnings.totalRuns}/${match.firstInnings.totalWickets})`
);
 }

 if (match.secondInnings) {
 renderInningsScorecard(
 match.secondInnings,
 `2nd Innings — ${match.secondInnings.team} (${match.secondInnings.totalRuns}/${match.secondInnings.totalWickets})`
);
 }

 // ── FOOTER PAGE NUMBERS ──
 const pageCount = (doc as any).internal.getNumberOfPages();
 for (let i = 1; i <= pageCount; i++) {
 doc.setPage(i);
 doc.setFontSize(7.5);
 doc.setTextColor(...mutedColor);
 doc.text(
 `Generated by Cric Scorer Pro — Official Match Record — Page ${i} of ${pageCount}`,
 pageWidth / 2,
 doc.internal.pageSize.getHeight() - 8,
 { align: 'center' }
);
 }

 return doc;
 }

 static async downloadPdf(match: MatchScorecard): Promise<void> {
 const doc = await this.generatePdf(match);
 const fileName = `${match.teamA} vs ${match.teamB} Scoreboard.pdf`.replace(/[/\\?%*:|"<>]/g, '-');
 doc.save(fileName);
 }
}
