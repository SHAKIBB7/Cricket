/**
 * Profile share card images (TAIMUR, 2026-11-10).
 *
 * Renders a player's full profile — batsman or bowler — to ONE
 * compact portrait PNG, drawn with the same pure-layout + thin
 * canvas-painter pattern as ScoreShareCard (the layout builders
 * are pure functions so the card content is unit-testable without
 * a canvas). The card is purpose-drawn rather than a screenshot:
 * the profile modals scroll, so no single screenshot could hold
 * every section.
 *
 * Palette mirrors the modals' fixed dark design: background
 * #090d16, panel #111827, soft panel #1e293b (slate-800),
 * hairline #334155, foreground #f8fafc, muted #94a3b8.
 */
import { downloadBlob } from '@/lib/download';
import { SHARE_CARD_COLORS } from './ScoreShareCard';

export const PROFILE_CARD_WIDTH = 1080;

const FONT = 'Inter, system-ui, -apple-system, sans-serif';
const C = {
  ...SHARE_CARD_COLORS,
  panelSoft: '#1e293b',
  hairline: '#334155',
  blue: '#60a5fa',
  blueDeep: '#2563eb',
  teal: '#2dd4bf',
  red: '#f87171',
  redDeep: '#dc2626',
  white70: 'rgba(248,250,252,0.7)',
  white85: 'rgba(248,250,252,0.85)',
};

export type CardOp =
  | { kind: 'panel'; x: number; y: number; w: number; h: number; fill: string; border?: string; radius: number; gradient?: [string, string] }
  | { kind: 'text'; x: number; y: number; text: string; font: string; color: string; align: CanvasTextAlign; baseline?: CanvasTextBaseline; tracking?: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string; border: string; text: string; textColor: string; font: string }
  | { kind: 'bar'; x: number; y: number; w: number; h: number; segments: { w: number; color: string }[] }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; color: string };

export interface ProfileCardLayout {
  width: number;
  height: number;
  background: string;
  ops: CardOp[];
}

/** Rough text width for layout flow (Inter-like averages). */
export function estTextWidth(text: string, fontSize: number, weight = 600): number {
  let units = 0;
  for (const ch of text) {
    if (ch === ' ') units += 0.3;
    else if (ch === '•') units += 0.32;
    else if (ch === '★') units += 0.72;
    else if (ch >= '0' && ch <= '9') units += 0.60;
    else if (ch >= 'A' && ch <= 'Z') units += 0.69;
    else if (ch === '=') units += 0.58;
    else if (ch === '%') units += 0.85;
    else units += 0.54;
  }
  const weightFactor = weight >= 800 ? 1.06 : weight >= 700 ? 1.03 : 1;
  return units * fontSize * weightFactor;
}

export function truncateToWidth(text: string, fontSize: number, weight: number, maxWidth: number): string {
  if (estTextWidth(text, fontSize, weight) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && estTextWidth(`${out}…`, fontSize, weight) > maxWidth) {
    out = [...out].slice(0, -1).join('');
  }
  return `${out.trimEnd()}…`;
}

const MARGIN = 36;
const PANEL_X = MARGIN;
const CONTENT_X = 84;
const CONTENT_W = PROFILE_CARD_WIDTH - CONTENT_X * 2; // 912
const PANEL_W = PROFILE_CARD_WIDTH - MARGIN * 2; // 1008

interface Ctx {
  ops: CardOp[];
  y: number;
}

function text(ctx: Ctx, x: number, y: number, value: string, font: string, color: string, align: CanvasTextAlign = 'left', tracking?: number, baseline: CanvasTextBaseline = 'alphabetic') {
  ctx.ops.push({ kind: 'text', x, y, text: value, font, color, align, baseline, tracking });
}

function panel(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, radius = 24, border?: string, gradient?: [string, string]) {
  ctx.ops.push({ kind: 'panel', x, y, w, h, fill, border, radius, gradient });
}

function hline(ctx: Ctx, x1: number, x2: number, y: number, color = C.hairline) {
  ctx.ops.push({ kind: 'line', x1, y1: y, x2, y2: y, color });
}

/** Brand + optional match-context header; advances ctx.y. */
function cardHeader(ctx: Ctx, context: string | undefined) {
  text(ctx, CONTENT_X, 108, 'CRICKET SCORER PRO', `800 27px ${FONT}`, C.muted, 'left', 3);
  if (context) {
    let shown = context;
    if (estTextWidth(shown, 25, 600) > 470 && shown.includes(' • ')) {
      shown = shown.split(' • ')[0];
    }
    text(ctx, CONTENT_X + CONTENT_W, 108, truncateToWidth(shown, 25, 600, 470), `600 25px ${FONT}`, C.muted, 'right');
  }
  hline(ctx, CONTENT_X, CONTENT_X + CONTENT_W, 138);
  ctx.y = 138;
}

/** Player identity block: avatar tile, name, meta segments. */
function identity(
  ctx: Ctx,
  opts: {
    name: string;
    tileGradient: [string, string];
    dotColor?: string;
    meta: { text: string; color: string; bold?: boolean }[];
    chip?: string;
  }
) {
  const top = ctx.y + 30;
  panel(ctx, CONTENT_X, top, 118, 118, opts.tileGradient[0], 28, undefined, opts.tileGradient);
  const initials = opts.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  text(ctx, CONTENT_X + 59, top + 60, initials, `900 46px ${FONT}`, '#ffffff', 'center', undefined, 'middle');
  if (opts.dotColor) {
    ctx.ops.push({ kind: 'circle', cx: CONTENT_X + 108, cy: top + 108, r: 13, fill: opts.dotColor, border: C.background, text: '', textColor: '#fff', font: `900 1px ${FONT}` });
  }
  const nameX = CONTENT_X + 142;
  const shownName = truncateToWidth(opts.name.toUpperCase(), 56, 800, CONTENT_X + CONTENT_W - nameX);
  text(ctx, nameX, top + 52, shownName, `800 56px ${FONT}`, C.foreground);
  // Position chip beside the name (the modal shows #{position}).
  if (opts.chip) {
    const chipX = nameX + estTextWidth(shownName, 56, 800) + 16;
    const chipW = estTextWidth(opts.chip, 24, 800) + 24;
    if (chipX + chipW <= CONTENT_X + CONTENT_W) {
      panel(ctx, chipX, top + 16, chipW, 40, C.panelSoft, 10, C.hairline);
      text(ctx, chipX + chipW / 2, top + 37, opts.chip, `800 24px ${FONT}`, '#cbd5e1', 'center', undefined, 'middle');
    }
  }
  // Meta segments flow — budgeted: a segment that would cross the
  // content edge is truncated and ends the flow (audit 2026-11-10:
  // a long dismissal text ran ~75px past the panel edge).
  let mx = nameX;
  const metaY = top + 96;
  const metaEdge = CONTENT_X + CONTENT_W;
  for (let i = 0; i < opts.meta.length; i++) {
    const seg = opts.meta[i]!;
    if (i > 0) {
      text(ctx, mx + 6, metaY, '•', `600 25px ${FONT}`, C.muted);
      mx += estTextWidth('•', 25, 600) + 22;
    }
    const weight = seg.bold ? 800 : 600;
    const w = estTextWidth(seg.text, 25, weight);
    if (mx + w > metaEdge) {
      text(ctx, mx, metaY, truncateToWidth(seg.text, 25, weight, Math.max(40, metaEdge - mx)), `${weight} 25px ${FONT}`, seg.color);
      break;
    }
    text(ctx, mx, metaY, seg.text, `${weight} 25px ${FONT}`, seg.color);
    mx += w + 10;
  }
  ctx.y = top + 118;
}

interface StripCell {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  frac?: number;
}

/** Hairline stat strip: label / value / optional sub per cell. */
function statStrip(ctx: Ctx, cells: StripCell[], opts: { height?: number } = {}) {
  const top = ctx.y + 26;
  const hasSub = cells.some((c) => c.sub);
  const h = opts.height ?? (hasSub ? 148 : 116);
  panel(ctx, PANEL_X, top, PANEL_W, h, '#182236', 24, C.border);
  const totalFrac = cells.reduce((a, c) => a + (c.frac ?? 1), 0);
  let cx = PANEL_X;
  cells.forEach((cell, i) => {
    const w = (PANEL_W * (cell.frac ?? 1)) / totalFrac;
    if (i > 0) {
      ctx.ops.push({ kind: 'line', x1: cx, y1: top + 14, x2: cx, y2: top + h - 14, color: C.hairline });
    }
    const center = cx + w / 2;
    text(ctx, center, top + 42, cell.label, `700 21px ${FONT}`, C.muted, 'center');
    text(ctx, center, top + (hasSub ? 96 : 88), cell.value, `900 46px ${FONT}`, cell.valueColor ?? C.foreground, 'center');
    if (hasSub && cell.sub) {
      text(ctx, center, top + 128, cell.sub, `500 21px ${FONT}`, C.muted, 'center');
    }
    cx += w;
  });
  ctx.y = top + h;
}

function sectionTitle(ctx: Ctx, title: string, right?: { text: string; color: string; font?: string }) {
  ctx.y += 34;
  text(ctx, CONTENT_X, ctx.y + 8, title, `800 27px ${FONT}`, C.foreground, 'left', 1);
  if (right) {
    text(ctx, CONTENT_X + CONTENT_W, ctx.y + 8, right.text, right.font ?? `800 27px ${FONT}`, right.color, 'right');
  }
  ctx.y += 8;
}

/** Ball-token colours, mirroring the modals' getBallCircleStyle. */
export function ballTokenColors(token: string): { fill: string; border: string; text: string } {
  const t = token.trim();
  if (t === '4') return { fill: '#059669', border: '#34d399', text: '#ffffff' };
  if (t === '6') return { fill: '#14b8a6', border: '#5eead4', text: '#ffffff' };
  if (t === 'W' || t === 'Out' || t.startsWith('W-')) return { fill: '#dc2626', border: '#f87171', text: '#ffffff' };
  if (t === '0') return { fill: '#1e293b', border: '#334155', text: '#94a3b8' };
  if (t.startsWith('Wd') || t.startsWith('Nb')) return { fill: 'rgba(217,119,6,0.30)', border: '#f59e0b', text: '#fcd34d' };
  if (t.startsWith('B') || t.startsWith('LB')) return { fill: 'rgba(30,58,138,0.35)', border: '#2563eb', text: '#93c5fd' };
  if (t.startsWith('Retire')) return { fill: '#dc2626', border: '#f87171', text: '#ffffff' };
  return { fill: '#334155', border: '#475569', text: '#f1f5f9' };
}

export interface BatsmanCardInput {
  name: string;
  hand: string;
  status: string;
  statusColor: string;
  crease?: { text: string; color: string };
  position?: number;
  context?: string;
  intent: string;
  intentDescription: string;
  intentGradient: [string, string];
  runs: number;
  balls: number;
  strikeRate: string;
  fours: number;
  sixes: number;
  boundaryRuns: number;
  boundaryPct: number;
  runningRuns: number;
  runningPct: number;
  dotBalls: number;
  dotPct: string;
  scoringBalls: number;
  scoringPct: string;
  shotControl: string;
  maxDotStreak: number;
  encounters: { bowler: string; runs: number; balls: number; econ: string; sr: string }[];
  ballLog: string[];
}

export function buildBatsmanCardLayout(input: BatsmanCardInput): ProfileCardLayout {
  const ctx: Ctx = { ops: [], y: 0 };
  cardHeader(ctx, input.context);
  const meta: { text: string; color: string; bold?: boolean }[] = [
    { text: input.hand, color: '#cbd5e1' },
    { text: input.status, color: input.statusColor, bold: true },
  ];
  if (input.crease) meta.push({ text: input.crease.text, color: input.crease.color, bold: true });
  identity(ctx, {
    name: input.name,
    tileGradient: ['#059669', '#0d9488'],
    // The modal's at-crease badge is emerald for BOTH crease
    // positions (it only pulses for the striker).
    dotColor: input.crease ? '#34d399' : undefined,
    meta,
    chip: input.position ? `#${input.position}` : undefined,
  });

  // Batting intent banner — only with evidence (audit 2026-11-10:
  // a yet-to-bat player has no intent and no shot control).
  if (input.balls > 0) {
  const bTop = ctx.y + 26;
  panel(ctx, CONTENT_X, bTop, CONTENT_W, 138, input.intentGradient[0], 24, undefined, input.intentGradient);
  text(ctx, CONTENT_X + 24, bTop + 44, 'BATTING INTENT', `800 22px ${FONT}`, C.white70, 'left', 2);
  text(ctx, CONTENT_X + 24, bTop + 92, input.intent.toUpperCase(), `900 42px ${FONT}`, '#ffffff');
  text(ctx, CONTENT_X + 24, bTop + 124, truncateToWidth(input.intentDescription, 24, 500, CONTENT_W - 120), `500 24px ${FONT}`, C.white85);
  ctx.y = bTop + 138;
  }

  // Primary stats strip
  statStrip(ctx, [
    { label: 'RUNS', value: String(input.runs), sub: '', frac: 0.9 },
    { label: 'BALLS FACED', value: String(input.balls), sub: '', frac: 1.1 },
    { label: 'STRIKE RATE', value: input.strikeRate, sub: '', frac: 1.3 },
    { label: '4S', value: String(input.fours), sub: `${input.fours * 4} runs`, frac: 0.75 },
    { label: '6S', value: String(input.sixes), sub: `${input.sixes * 6} runs`, frac: 0.75 },
  ]);

  // Run production
  sectionTitle(ctx, 'RUN PRODUCTION SOURCES', { text: `${input.runs} Total Runs`, color: C.muted, font: `600 24px ${FONT}` });
  const barY = ctx.y + 16;
  const bPct = Math.max(0, Math.min(100, input.boundaryPct));
  ctx.ops.push({
    kind: 'bar',
    x: PANEL_X,
    y: barY,
    w: PANEL_W,
    h: 26,
    segments: [
      { w: (PANEL_W * bPct) / 100, color: '#10b981' },
      { w: PANEL_W - (PANEL_W * bPct) / 100, color: '#2563eb' },
    ],
  });
  const legY = barY + 58;
  ctx.ops.push({ kind: 'circle', cx: CONTENT_X + 10, cy: legY - 8, r: 8, fill: '#10b981', border: '#10b981', text: '', textColor: '#fff', font: `900 1px ${FONT}` });
  text(ctx, CONTENT_X + 30, legY, `Boundaries ${input.boundaryRuns}r (${Math.round(input.boundaryPct)}%)`, `600 24px ${FONT}`, '#cbd5e1');
  const runningText = `Running ${input.runningRuns}r (${Math.round(input.runningPct)}%)`;
  ctx.ops.push({ kind: 'circle', cx: CONTENT_X + CONTENT_W - estTextWidth(runningText, 24, 600) - 28, cy: legY - 8, r: 8, fill: '#2563eb', border: '#2563eb', text: '', textColor: '#fff', font: `900 1px ${FONT}` });
  text(ctx, CONTENT_X + CONTENT_W, legY, runningText, `600 24px ${FONT}`, '#cbd5e1', 'right');
  ctx.y = legY;

  // Dot ball & shot control strip — same evidence gate as the banner.
  if (input.balls > 0) {
  sectionTitle(ctx, 'DOT BALL & SHOT CONTROL');
  statStrip(ctx, [
    { label: 'DOT BALLS', value: String(input.dotBalls), sub: `${input.dotPct}% of balls` },
    { label: 'SCORING BALLS', value: String(input.scoringBalls), sub: `${input.scoringPct}% score rate` },
    { label: 'SHOT CONTROL', value: `${input.shotControl}%`, sub: 'non-dot ratio' },
    { label: 'MAX DOT STREAK', value: String(input.maxDotStreak), sub: 'balls in a row' },
  ]);
  }

  // Encounter vs bowlers
  if (input.encounters.length > 0) {
    sectionTitle(ctx, 'ENCOUNTER VS BOWLERS', { text: 'Sorted by runs scored', color: C.muted, font: `500 23px ${FONT}` });
    const tTop = ctx.y + 14;
    const rowH = 56;
    const headH = 48;
    const h = headH + rowH * input.encounters.length;
    panel(ctx, PANEL_X, tTop, PANEL_W, h, '#182236', 24, C.border);
    const fracs = [4, 2, 2, 2, 2];
    const colX: number[] = [];
    {
      let acc = PANEL_X;
      const tot = fracs.reduce((a, b) => a + b, 0);
      for (const f of fracs) {
        colX.push(acc);
        acc += (PANEL_W * f) / tot;
      }
      colX.push(acc);
    }
    const headY = tTop + 32;
    text(ctx, colX[0] + 24, headY, 'BOWLER', `700 21px ${FONT}`, C.muted);
    text(ctx, (colX[1] + colX[2]) / 2, headY, 'RUNS', `700 21px ${FONT}`, C.muted, 'center');
    text(ctx, (colX[2] + colX[3]) / 2, headY, 'BALLS', `700 21px ${FONT}`, C.muted, 'center');
    text(ctx, (colX[3] + colX[4]) / 2, headY, 'ECON', `700 21px ${FONT}`, C.muted, 'center');
    text(ctx, colX[5] - 24, headY, 'STRIKE RATE', `700 21px ${FONT}`, C.muted, 'right');
    hline(ctx, PANEL_X + 24, PANEL_X + PANEL_W - 24, tTop + headH);
    input.encounters.forEach((row, i) => {
      const ry = tTop + headH + rowH * i + 38;
      text(ctx, colX[0] + 24, ry, truncateToWidth(row.bowler, 26, 700, colX[1] - colX[0] - 36), `700 26px ${FONT}`, C.foreground);
      text(ctx, (colX[1] + colX[2]) / 2, ry, String(row.runs), `900 27px ${FONT}`, '#34d399', 'center');
      text(ctx, (colX[2] + colX[3]) / 2, ry, String(row.balls), `600 26px ${FONT}`, '#cbd5e1', 'center');
      text(ctx, (colX[3] + colX[4]) / 2, ry, row.econ, `600 26px ${FONT}`, '#e2e8f0', 'center');
      text(ctx, colX[5] - 24, ry, row.sr, `800 26px ${FONT}`, '#e2e8f0', 'right');
      if (i < input.encounters.length - 1) {
        hline(ctx, PANEL_X + 24, PANEL_X + PANEL_W - 24, tTop + headH + rowH * (i + 1), 'rgba(51,65,85,0.55)');
      }
    });
    ctx.y = tTop + h;
  }

  // Deliveries faced
  if (input.ballLog.length > 0) {
    sectionTitle(ctx, `DELIVERIES FACED (${input.ballLog.length})`, { text: 'Chronological', color: C.muted, font: `500 23px ${FONT}` });
    const dTop = ctx.y + 14;
    const perRow = 14;
    const rows = Math.ceil(input.ballLog.length / perRow);
    const h = rows * 62 + 28;
    panel(ctx, PANEL_X, dTop, PANEL_W, h, '#182236', 24, C.border);
    input.ballLog.forEach((token, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const cx = PANEL_X + 52 + col * 66;
      const cy = dTop + 45 + row * 62;
      const colors = ballTokenColors(token);
      ctx.ops.push({
        kind: 'circle',
        cx,
        cy,
        r: 25,
        fill: colors.fill,
        border: colors.border,
        text: token === '0' ? '0' : token,
        textColor: colors.text,
        font: `${token.length > 2 ? '700 16px' : '700 21px'} ${FONT}`,
      });
    });
    ctx.y = dTop + h;
  }

  return finishLayout(ctx);
}

function finishLayout(ctx: Ctx): ProfileCardLayout {
  const fY = ctx.y + 44;
  hline(ctx, CONTENT_X, CONTENT_X + CONTENT_W, fY - 26);
  text(ctx, PROFILE_CARD_WIDTH / 2, fY + 8, 'Generated with Cricket Scorer Pro', `500 23px ${FONT}`, C.muted, 'center');
  const height = fY + 62;
  return {
    width: PROFILE_CARD_WIDTH,
    height,
    background: C.background,
    ops: [
      { kind: 'panel', x: PANEL_X, y: MARGIN, w: PANEL_W, h: height - MARGIN * 2, fill: C.panel, border: C.border, radius: 28 },
      ...ctx.ops,
    ],
  };
}

export interface BowlerCardOver {
  label: string;
  isOngoing: boolean;
  log: string[];
  runs: number;
  wickets: { player: string; detail: string }[];
}

export interface BowlerCardInput {
  name: string;
  context?: string;
  oversText: string;
  econText: string;
  econColor: string;
  isCurrentlyBowling: boolean;
  ballsBowled: number;
  maidens: number;
  runs: number;
  wickets: number;
  dotBalls: number;
  dotPct: string;
  wides: number;
  noBalls: number;
  overs: BowlerCardOver[];
  wicketsTaken: { player: string; detail: string }[];
}

export function buildBowlerCardLayout(input: BowlerCardInput): ProfileCardLayout {
  const ctx: Ctx = { ops: [], y: 0 };
  cardHeader(ctx, input.context);
  const meta: { text: string; color: string; bold?: boolean }[] = [
    { text: `${input.oversText} Overs`, color: '#cbd5e1' },
    { text: `Econ ${input.econText}`, color: input.econColor, bold: true },
  ];
  if (input.isCurrentlyBowling) meta.push({ text: 'CURRENT BOWLER', color: C.blue, bold: true });
  identity(ctx, {
    name: input.name,
    tileGradient: ['#2563eb', '#4f46e5'],
    dotColor: input.isCurrentlyBowling ? '#3b82f6' : undefined,
    meta,
  });

  statStrip(ctx, [
    { label: 'OVERS', value: input.oversText },
    { label: 'MAIDENS', value: String(input.maidens) },
    { label: 'RUNS', value: String(input.runs) },
    { label: 'WICKETS', value: String(input.wickets) },
  ]);
  if (input.overs.length > 0 || input.ballsBowled === 0) {
  statStrip(ctx, [
    { label: 'DOT BALLS', value: String(input.dotBalls) },
    { label: 'DOT %', value: `${input.dotPct}%` },
    { label: 'WIDES', value: String(input.wides) },
    { label: 'NO BALLS', value: String(input.noBalls) },
  ]);
  }

  // Over-by-over equation rows
  if (input.overs.length > 0) {
    // Section title with the Econ rate on the right
    ctx.y += 34;
    text(ctx, CONTENT_X, ctx.y + 8, `OVER-BY-OVER DELIVERIES (${input.overs.length})`, `800 27px ${FONT}`, C.foreground, 'left', 1);
    const econLabel = 'ECON ';
    const econLabelW = estTextWidth(econLabel, 23, 700);
    const econValW = estTextWidth(input.econText, 27, 900);
    text(ctx, CONTENT_X + CONTENT_W - econLabelW - econValW, ctx.y + 8, econLabel, `700 23px ${FONT}`, C.muted);
    text(ctx, CONTENT_X + CONTENT_W, ctx.y + 8, input.econText, `900 27px ${FONT}`, input.econColor, 'right');
    ctx.y += 8;

    // Measure total panel height first. Geometry is per-row: the
    // divider and the circles start AFTER the label chip (and the
    // LIVE pill on the ongoing row) — a fixed divider used to
    // strike through the pill (audit 2026-11-10).
    const CIRCLE_R = 22;
    const CIRCLE_STEP = 54;
    const TOTAL_RESERVE = 190;
    const rowGeom = input.overs.map((ov) => {
      const chipW = estTextWidth(ov.label, 22, 800) + 26;
      let blockEnd = CONTENT_X + chipW;
      if (ov.isOngoing) blockEnd += 10 + estTextWidth('LIVE', 20, 800) + 44;
      const dividerX = Math.max(CONTENT_X + 218, blockEnd + 10);
      const circlesX = dividerX + 22;
      const perRow = Math.max(3, Math.floor((CONTENT_X + CONTENT_W - TOTAL_RESERVE - circlesX) / CIRCLE_STEP) + 1);
      return { dividerX, circlesX, perRow };
    });
    const rowHeights = input.overs.map((ov, oi) => {
      const circleRows = Math.max(1, Math.ceil(ov.log.length / rowGeom[oi]!.perRow));
      return 18 + circleRows * 56 + ov.wickets.length * 36 + 14;
    });
    const totalH = rowHeights.reduce((a, b) => a + b, 0) + 12;
    const oTop = ctx.y + 14;
    panel(ctx, PANEL_X, oTop, PANEL_W, totalH, '#182236', 24, C.border);

    let ry = oTop + 6;
    input.overs.forEach((ov, oi) => {
      const geom = rowGeom[oi]!;
      const CIRCLES_X = geom.circlesX;
      const perRowMax = geom.perRow;
      const rowH = rowHeights[oi];
      const firstLineCy = ry + 18 + 28;
      // Label chip
      const chipText = ov.label;
      const chipW = estTextWidth(chipText, 22, 800) + 26;
      panel(ctx, CONTENT_X, firstLineCy - 19, chipW, 38, ov.isOngoing ? 'rgba(37,99,235,0.25)' : C.panelSoft, 9, ov.isOngoing ? '#2563eb' : C.hairline);
      text(ctx, CONTENT_X + chipW / 2, firstLineCy, chipText, `800 22px ${FONT}`, ov.isOngoing ? '#93c5fd' : '#e2e8f0', 'center', undefined, 'middle');
      let afterChip = CONTENT_X + chipW + 10;
      if (ov.isOngoing) {
        const liveW = estTextWidth('LIVE', 20, 800) + 44;
        panel(ctx, afterChip, firstLineCy - 17, liveW, 34, '#dc2626', 999);
        ctx.ops.push({ kind: 'circle', cx: afterChip + 15, cy: firstLineCy, r: 5, fill: '#ffffff', border: '#ffffff', text: '', textColor: '#fff', font: `900 1px ${FONT}` });
        text(ctx, afterChip + 26, firstLineCy, 'LIVE', `800 20px ${FONT}`, '#ffffff', 'left', undefined, 'middle');
      }
      // Divider
      ctx.ops.push({ kind: 'line', x1: geom.dividerX, y1: firstLineCy - 14, x2: geom.dividerX, y2: firstLineCy + 14, color: '#475569' });
      // Circles (wrap if needed)
      ov.log.forEach((token, i) => {
        const row = Math.floor(i / perRowMax);
        const col = i % perRowMax;
        const cx = CIRCLES_X + CIRCLE_R + col * CIRCLE_STEP;
        const cy = firstLineCy + row * 56;
        const colors = ballTokenColors(token);
        ctx.ops.push({
          kind: 'circle',
          cx,
          cy,
          r: CIRCLE_R,
          fill: colors.fill,
          border: colors.border,
          text: token,
          textColor: colors.text,
          font: `${token.length > 2 ? '700 15px' : '700 19px'} ${FONT}`,
        });
      });
      // Total
      const totalText = ov.runs === 0 && !ov.isOngoing ? 'MAIDEN' : `${ov.runs} runs`;
      text(ctx, CONTENT_X + CONTENT_W - estTextWidth('= ', 27, 700) - estTextWidth(totalText, 27, 900) - 6, firstLineCy, '=', `700 27px ${FONT}`, C.muted, 'left', undefined, 'middle');
      text(ctx, CONTENT_X + CONTENT_W, firstLineCy, totalText, `900 27px ${FONT}`, ov.runs === 0 && !ov.isOngoing ? '#34d399' : C.foreground, 'right', undefined, 'middle');
      // Wicket rows
      let wy = ry + 18 + Math.max(1, Math.ceil(ov.log.length / perRowMax)) * 56 + 4;
      for (const w of ov.wickets) {
        ctx.ops.push({ kind: 'circle', cx: CIRCLES_X + 12, cy: wy + 12, r: 11, fill: '#dc2626', border: '#f87171', text: 'W', textColor: '#ffffff', font: `900 13px ${FONT}` });
        text(ctx, CIRCLES_X + 32, wy + 21, truncateToWidth(w.player, 23, 700, 380), `700 23px ${FONT}`, C.foreground);
        text(ctx, CIRCLES_X + 32 + estTextWidth(truncateToWidth(w.player, 23, 700, 380), 23, 700) + 24, wy + 21, `(${w.detail})`, `500 22px ${FONT}`, C.muted);
        wy += 36;
      }
      ry += rowH;
      if (oi < input.overs.length - 1) {
        hline(ctx, PANEL_X + 24, PANEL_X + PANEL_W - 24, ry, 'rgba(51,65,85,0.55)');
      }
    });
    ctx.y = oTop + totalH;
  }

  // Wickets taken
  if (input.wicketsTaken.length > 0) {
    sectionTitle(ctx, `WICKETS TAKEN IN MATCH (${input.wicketsTaken.length})`);
    const wTop = ctx.y + 14;
    const rowH = 58;
    const h = rowH * input.wicketsTaken.length + 12;
    panel(ctx, PANEL_X, wTop, PANEL_W, h, '#182236', 24, C.border);
    input.wicketsTaken.forEach((w, i) => {
      const cy = wTop + 6 + rowH * i + rowH / 2;
      const tag = `W${i + 1}`;
      const tagW = estTextWidth(tag, 21, 800) + 24;
      panel(ctx, CONTENT_X, cy - 17, tagW, 34, 'rgba(220,38,38,0.18)', 8, 'rgba(248,113,113,0.4)');
      text(ctx, CONTENT_X + tagW / 2, cy, tag, `800 21px ${FONT}`, '#fca5a5', 'center', undefined, 'middle');
      text(ctx, CONTENT_X + tagW + 18, cy, truncateToWidth(w.player, 26, 700, 480), `700 26px ${FONT}`, C.foreground, 'left', undefined, 'middle');
      text(ctx, CONTENT_X + CONTENT_W, cy, w.detail, `600 25px ${FONT}`, '#cbd5e1', 'right', undefined, 'middle');
      if (i < input.wicketsTaken.length - 1) {
        hline(ctx, PANEL_X + 24, PANEL_X + PANEL_W - 24, wTop + 6 + rowH * (i + 1), 'rgba(51,65,85,0.55)');
      }
    });
    ctx.y = wTop + h;
  }

  return finishLayout(ctx);
}

/** Thin canvas painter over a ProfileCardLayout. */
export async function generateProfileCardImage(layout: ProfileCardLayout): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D is not available in this browser.');
  }
  ctx.fillStyle = layout.background;
  ctx.fillRect(0, 0, layout.width, layout.height);

  const rounded = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  };

  for (const op of layout.ops) {
    if (op.kind === 'panel') {
      rounded(op.x, op.y, op.w, op.h, op.radius);
      if (op.gradient) {
        const g = ctx.createLinearGradient(op.x, op.y, op.x + op.w, op.y);
        g.addColorStop(0, op.gradient[0]);
        g.addColorStop(1, op.gradient[1]);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = op.fill;
      }
      ctx.fill();
      if (op.border) {
        ctx.strokeStyle = op.border;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else if (op.kind === 'text') {
      ctx.font = op.font;
      ctx.fillStyle = op.color;
      ctx.textAlign = op.align;
      ctx.textBaseline = op.baseline ?? 'alphabetic';
      const anyCtx = ctx as unknown as { letterSpacing?: string };
      if (typeof anyCtx.letterSpacing === 'string' || 'letterSpacing' in ctx) {
        try {
          anyCtx.letterSpacing = op.tracking ? `${op.tracking}px` : '0px';
        } catch {
          /* older engines: ignore */
        }
      }
      ctx.fillText(op.text, op.x, op.y);
    } else if (op.kind === 'circle') {
      ctx.beginPath();
      ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
      ctx.fillStyle = op.fill;
      ctx.fill();
      ctx.strokeStyle = op.border;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (op.text) {
        const anyCtx2 = ctx as unknown as { letterSpacing?: string };
        try {
          anyCtx2.letterSpacing = '0px';
        } catch {
          /* older engines: ignore */
        }
        ctx.font = op.font;
        ctx.fillStyle = op.textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(op.text, op.cx, op.cy + 1);
      }
    } else if (op.kind === 'bar') {
      ctx.save();
      rounded(op.x, op.y, op.w, op.h, op.h / 2);
      ctx.clip();
      let bx = op.x;
      for (const seg of op.segments) {
        ctx.fillStyle = seg.color;
        ctx.fillRect(bx, op.y, seg.w, op.h);
        bx += seg.w;
      }
      ctx.restore();
    } else if (op.kind === 'line') {
      ctx.beginPath();
      ctx.moveTo(op.x1, op.y1);
      ctx.lineTo(op.x2, op.y2);
      ctx.strokeStyle = op.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not render the profile image.'));
    }, 'image/png');
  });
}

export function profileCardFilename(kind: 'batsman' | 'bowler', name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'player';
  return `${slug}-${kind}-profile.png`;
}

export function downloadProfileCardImage(blob: Blob, kind: 'batsman' | 'bowler', name: string): void {
  void downloadBlob(blob, profileCardFilename(kind, name));
}

/**
 * Share the profile card through the Web Share API with a file
 * payload where supported; otherwise fall back to a PNG download.
 * Never throws (mirrors shareScoreCardImage).
 */
export async function shareProfileCardImage(
  kind: 'batsman' | 'bowler',
  input: BatsmanCardInput | BowlerCardInput
): Promise<'shared' | 'downloaded' | 'failed'> {
  let blob: Blob;
  try {
    const layout = kind === 'batsman' ? buildBatsmanCardLayout(input as BatsmanCardInput) : buildBowlerCardLayout(input as BowlerCardInput);
    blob = await generateProfileCardImage(layout);
  } catch {
    return 'failed';
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([blob], profileCardFilename(kind, input.name), { type: 'image/png' });
      const shareData: ShareData = { files: [file], title: `${input.name} — ${kind === 'batsman' ? 'Batting' : 'Bowling'} Profile` };
      if (typeof navigator.canShare !== 'function' || navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return 'shared';
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return 'shared';
    }
  }

  try {
    downloadProfileCardImage(blob, kind, input.name);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
