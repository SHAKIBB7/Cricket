/**
 * Score share card image (improvement run — sharing & exports).
 *
 * Renders a match result / live-score card to a 1200×630 PNG —
 * the standard social/Open-Graph landscape size, chosen over a
 * portrait card because the primary use is sharing a link or
 * image into chats and feeds, where landscape cards preview
 * uncropped. The card always uses the app's DARK theme palette
 * (globals.css `.dark` tokens, inlined as literals because
 * canvas cannot read CSS variables): background #090d16, card
 * #111827, border #3d4f6a, foreground #f8fafc, muted #94a3b8,
 * primary emerald #10b981, amber #fbbf24, danger #f87171.
 *
 * The layout is a pure function (buildShareCardLayout) so the
 * text content can be unit-tested without a canvas; the canvas
 * wrapper below is a thin painter over that layout.
 */
import type { MatchScorecard } from '@/domain/cricket/types';
import { cleanPlayerName } from '@/domain/cricket/formatters';
import { downloadBlob } from '@/lib/download';

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

export const SHARE_CARD_COLORS = {
  background: '#090d16',
  panel: '#111827',
  border: '#3d4f6a',
  foreground: '#f8fafc',
  muted: '#94a3b8',
  primary: '#10b981',
  amber: '#fbbf24',
  danger: '#f87171',
  info: '#38bdf8',
} as const;

export interface ShareCardTextLine {
  kind:
    | 'brand'
    | 'status'
    | 'title'
    | 'meta'
    | 'inningsTeam'
    | 'inningsScore'
    | 'result'
    | 'superOver'
    | 'section'
    | 'performers'
    | 'mom'
    | 'footer';
  text: string;
  x: number;
  /** Baseline y. */
  y: number;
  font: string;
  color: string;
  align: CanvasTextAlign;
}

export interface ShareCardLayout {
  width: number;
  height: number;
  background: string;
  panel: { x: number; y: number; width: number; height: number; color: string; borderColor: string; radius: number };
  accent: { x: number; y: number; width: number; height: number; color: string };
  lines: ShareCardTextLine[];
}

const FONT = 'Inter, system-ui, -apple-system, sans-serif';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 1))}…` : text;
}

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function titleFontSize(title: string): number {
  if (title.length <= 26) return 66;
  if (title.length <= 36) return 54;
  return 44;
}

interface Performer {
  name: string;
  detail: string;
}

function topScorers(scorecard: MatchScorecard, limit: number): Performer[] {
  const all: { name: string; runs: number; balls: number }[] = [];
  for (const inn of [scorecard.firstInnings, scorecard.secondInnings]) {
    if (!inn) continue;
    for (const p of inn.players) {
      if (p.runs > 0 || p.balls > 0) {
        all.push({ name: cleanPlayerName(p.name), runs: p.runs, balls: p.balls });
      }
    }
  }
  all.sort((a, b) => b.runs - a.runs || a.balls - b.balls);
  return all
    .filter((p) => p.runs > 0)
    .slice(0, limit)
    .map((p) => ({ name: p.name, detail: `${p.runs} (${p.balls}b)` }));
}

function momLine(scorecard: MatchScorecard): string | null {
  const stats = scorecard.momStats;
  const name = stats?.name || scorecard.mom;
  if (!name) return null;
  const parts: string[] = [];
  if (stats) {
    if (stats.balls > 0) parts.push(`${stats.runs} (${stats.balls}b)`);
    if (stats.ballsBowled > 0) parts.push(`${stats.wickets}/${stats.bowlingRuns}`);
  }
  return `Player of the Match: ${cleanPlayerName(name)}${parts.length ? ` — ${parts.join(' • ')}` : ''}`;
}

export function buildShareCardLayout(
  scorecard: MatchScorecard,
  superOver?: MatchScorecard | null
): ShareCardLayout {
  const C = SHARE_CARD_COLORS;
  const completed = scorecard.status === 'COMPLETED';
  const lines: ShareCardTextLine[] = [];
  const left = 92;
  const right = SHARE_CARD_WIDTH - 92;

  // Header: brand left, status label right.
  lines.push({
    kind: 'brand',
    text: 'CRIC SCORER PRO',
    x: left,
    y: 116,
    font: `800 30px ${FONT}`,
    color: C.primary,
    align: 'left',
  });
  lines.push({
    kind: 'status',
    text: completed ? 'MATCH RESULT' : scorecard.status === 'ABANDONED' ? 'MATCH ABANDONED' : 'LIVE SCORE',
    x: right,
    y: 116,
    font: `800 26px ${FONT}`,
    color: completed ? C.primary : C.danger,
    align: 'right',
  });

  // Title + meta.
  const title = truncate(`${scorecard.teamA} vs ${scorecard.teamB}`, 46);
  lines.push({
    kind: 'title',
    text: title,
    x: left,
    y: 192,
    font: `900 ${titleFontSize(title)}px ${FONT}`,
    color: C.foreground,
    align: 'left',
  });
  const metaParts = [
    scorecard.venue || null,
    formatDate(scorecard.createdAt),
    `${scorecard.totalOvers} Overs`,
  ].filter(Boolean) as string[];
  lines.push({
    kind: 'meta',
    text: truncate(metaParts.join('  •  '), 72),
    x: left,
    y: 234,
    font: `500 25px ${FONT}`,
    color: C.muted,
    align: 'left',
  });

  // Innings scores.
  let y = 322;
  const innings: { team: string; score: string | null }[] = [];
  if (scorecard.firstInnings) {
    innings.push({
      team: scorecard.firstInnings.team,
      score: `${scorecard.firstInnings.totalRuns}/${scorecard.firstInnings.totalWickets}  (${scorecard.firstInnings.oversString} ov)`,
    });
  }
  if (scorecard.secondInnings) {
    innings.push({
      team: scorecard.secondInnings.team,
      score: `${scorecard.secondInnings.totalRuns}/${scorecard.secondInnings.totalWickets}  (${scorecard.secondInnings.oversString} ov)`,
    });
  } else if (scorecard.firstInnings) {
    const other =
      scorecard.firstInnings.team === scorecard.teamA ? scorecard.teamB : scorecard.teamA;
    innings.push({ team: other, score: null });
  }
  for (const inn of innings) {
    lines.push({
      kind: 'inningsTeam',
      text: truncate(inn.team, 30),
      x: left,
      y,
      font: `700 38px ${FONT}`,
      color: C.foreground,
      align: 'left',
    });
    lines.push({
      kind: 'inningsScore',
      text: inn.score ?? 'Yet to bat',
      x: right,
      y,
      font: inn.score ? `800 50px ${FONT}` : `600 34px ${FONT}`,
      color: inn.score ? C.foreground : C.muted,
      align: 'right',
    });
    y += 76;
  }

  // Result / live state.
  if (completed) {
    lines.push({
      kind: 'result',
      text: truncate(
        scorecard.result || (scorecard.winner ? `${scorecard.winner} won` : 'Match completed'),
        74
      ),
      x: left,
      y: y + 8,
      font: `800 36px ${FONT}`,
      color: C.primary,
      align: 'left',
    });
  } else if (scorecard.status !== 'ABANDONED') {
    let liveText = 'Match in progress';
    const inn2 = scorecard.secondInnings;
    if (inn2 && scorecard.targetScore > inn2.totalRuns) {
      const runsNeeded = scorecard.targetScore - inn2.totalRuns;
      const ballsLeft = scorecard.totalOvers * 6 - inn2.totalBalls;
      if (ballsLeft > 0) {
        liveText = `${inn2.team} need ${runsNeeded} off ${ballsLeft} balls`;
      }
    }
    lines.push({
      kind: 'result',
      text: liveText,
      x: left,
      y: y + 8,
      font: `700 34px ${FONT}`,
      color: C.info,
      align: 'left',
    });
  }
  y += 58;

  // Super over summary (played as a linked match or recorded on the parent).
  const soLine: string | null = (() => {
    if (superOver?.firstInnings) {
      const a = superOver.firstInnings;
      const b = superOver.secondInnings;
      const winner = scorecard.superOverResult?.winner || superOver.winner;
      const scores = b
        ? `${a.team} ${a.totalRuns}/${a.totalWickets} • ${b.team} ${b.totalRuns}/${b.totalWickets}`
        : `${a.team} ${a.totalRuns}/${a.totalWickets}`;
      return `Super Over: ${scores}${winner ? ` — ${winner} won` : ''}`;
    }
    if (scorecard.superOverResult) {
      const r = scorecard.superOverResult;
      const scores =
        r.teamAScore && r.teamBScore ? ` (${r.teamAScore} vs ${r.teamBScore})` : '';
      return `Super Over: ${r.winner} won${scores}`;
    }
    return null;
  })();
  if (soLine) {
    lines.push({
      kind: 'superOver',
      text: truncate(soLine, 78),
      x: left,
      y,
      font: `600 27px ${FONT}`,
      color: '#c084fc',
      align: 'left',
    });
    y += 42;
  }

  // Top scorers.
  const scorers = topScorers(scorecard, 3);
  if (scorers.length > 0) {
    lines.push({
      kind: 'performers',
      text: truncate(
        `Top scorers: ${scorers.map((s) => `${s.name} ${s.detail}`).join('  •  ')}`,
        84
      ),
      x: left,
      y: y + 6,
      font: `500 27px ${FONT}`,
      color: C.muted,
      align: 'left',
    });
    y += 44;
  }

  // Player of the Match — completed matches only (BV-1 discipline).
  if (completed) {
    const mom = momLine(scorecard);
    if (mom) {
      lines.push({
        kind: 'mom',
        text: truncate(mom, 80),
        x: left,
        y: y + 6,
        font: `700 30px ${FONT}`,
        color: C.amber,
        align: 'left',
      });
    }
  }

  // Footer.
  lines.push({
    kind: 'footer',
    text: 'Cric Scorer Pro — Live Cricket Scoring',
    x: left,
    y: SHARE_CARD_HEIGHT - 52,
    font: `600 22px ${FONT}`,
    color: C.muted,
    align: 'left',
  });

  return {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    background: C.background,
    panel: {
      x: 36,
      y: 36,
      width: SHARE_CARD_WIDTH - 72,
      height: SHARE_CARD_HEIGHT - 72,
      color: C.panel,
      borderColor: C.border,
      radius: 28,
    },
    accent: { x: 36, y: 36, width: SHARE_CARD_WIDTH - 72, height: 8, color: C.primary },
    lines,
  };
}

/** Thin canvas painter over buildShareCardLayout. */
export async function generateScoreCardImage(
  scorecard: MatchScorecard,
  superOver?: MatchScorecard | null
): Promise<Blob> {
  const layout = buildShareCardLayout(scorecard, superOver);
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D is not available in this browser.');
  }

  ctx.fillStyle = layout.background;
  ctx.fillRect(0, 0, layout.width, layout.height);

  const { panel, accent } = layout;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(panel.x, panel.y, panel.width, panel.height, panel.radius);
  } else {
    ctx.rect(panel.x, panel.y, panel.width, panel.height);
  }
  ctx.fillStyle = panel.color;
  ctx.fill();
  ctx.strokeStyle = panel.borderColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = accent.color;
  ctx.fillRect(accent.x, accent.y, accent.width, accent.height);

  for (const line of layout.lines) {
    ctx.font = line.font;
    ctx.fillStyle = line.color;
    ctx.textAlign = line.align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(line.text, line.x, line.y);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not render the share image.'));
    }, 'image/png');
  });
}

export function scoreCardImageFilename(scorecard: MatchScorecard): string {
  const slug =
    `${scorecard.teamA}-vs-${scorecard.teamB}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'match';
  return `${slug}-score-card.png`;
}

export function downloadScoreCardImage(blob: Blob, scorecard: MatchScorecard): void {
  void downloadBlob(blob, scoreCardImageFilename(scorecard));
}

/**
 * Share the card through the Web Share API with a file payload
 * where the platform supports it; otherwise fall back to a PNG
 * download. Never throws.
 */
export async function shareScoreCardImage(
  scorecard: MatchScorecard,
  superOver?: MatchScorecard | null
): Promise<'shared' | 'downloaded' | 'failed'> {
  let blob: Blob;
  try {
    blob = await generateScoreCardImage(scorecard, superOver);
  } catch {
    return 'failed';
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([blob], scoreCardImageFilename(scorecard), {
        type: 'image/png',
      });
      const shareData: ShareData = {
        files: [file],
        title: `${scorecard.teamA} vs ${scorecard.teamB}`,
      };
      if (typeof navigator.canShare !== 'function' || navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return 'shared';
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return 'shared';
      // Non-abort failures fall through to the download.
    }
  }

  try {
    downloadScoreCardImage(blob, scorecard);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
