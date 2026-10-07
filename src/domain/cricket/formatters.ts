/**
 * CricketFormatters & Mathematical Functions
 * Directly ported from Flutter's CricketFormatters, REUSABLE_LOGIC_GUIDE_BN.md,
 * and DotBallAnalytics with 100% mathematical fidelity.
 */

export function strikeRate(runs: number, balls: number): number {
 if (balls <= 0) return 0.0;
 return Number(((runs / balls) * 100).toFixed(1));
}

/**
 * Truncated Strike Rate for print-ready PDF scorecards (e.g. 133 instead of 133.3)
 */
export function pdfStrikeRate(runs: number, balls: number): number {
 if (balls <= 0) return 0;
 return Math.trunc((runs / balls) * 100);
}

export function economyRate(runs: number, balls: number): number {
 if (balls <= 0) return 0.0;
 return Number((runs / (balls / 6.0)).toFixed(2));
}

export function oversString(balls: number): string {
 if (balls <= 0) return '0.0';
 const overs = Math.floor(balls / 6);
 const remainder = balls % 6;
 return `${overs}.${remainder}`;
}

export function ballsFromOversString(oversStr: string | null | undefined): number {
 if (!oversStr) return 0;
 const parts = oversStr.toString().trim().split('.');
 const overs = parseInt(parts[0], 10) || 0;
 const balls = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
 return overs * 6 + balls;
}

export function currentRunRate(runs: number, balls: number): number {
 if (balls <= 0) return 0.0;
 return Number((runs / (balls / 6.0)).toFixed(2));
}

export function requiredRunRate(neededRuns: number, remainingBalls: number): number {
 if (neededRuns <= 0) return 0.0;
 if (remainingBalls <= 0) return 99.99;
 return Number((neededRuns / (remainingBalls / 6.0)).toFixed(2));
}

export function dotBallPercentage(dotBalls: number, totalBalls: number): number {
 if (totalBalls <= 0) return 0;
 return Number(((dotBalls / totalBalls) * 100).toFixed(1));
}

export function boundaryRunsPercentage(fours: number, sixes: number, runs: number): number {
 if (runs <= 0) return 0;
 const boundaryRuns = fours * 4 + sixes * 6;
 return Number(((boundaryRuns / runs) * 100).toFixed(1));
}

export function boundaryBallsPercentage(fours: number, sixes: number, balls: number): number {
 if (balls <= 0) return 0;
 return Number((((fours + sixes) / balls) * 100).toFixed(1));
}

export function shotControlPercentage(dotBalls: number, totalBalls: number): number {
 if (totalBalls <= 0) return 0;
 const dotPct = (dotBalls / totalBalls) * 100;
 return Number(Math.max(0, 100 - dotPct).toFixed(1));
}

/**
 * Batting position standard label mapper (0-indexed)
 */
export function getBattingPosition(index: number): string {
 switch (index) {
 case 0:
 return 'Opener No. 1';
 case 1:
 return 'Opener No. 2';
 case 2:
 return 'One Down No. 3';
 case 3:
 return 'Two Down No. 4';
 case 4:
 return 'Middle Order No. 5';
 case 5:
 return 'Middle Order No. 6';
 case 6:
 return 'Finisher No. 7';
 case 7:
 return 'Lower Order No. 8';
 case 8:
 return 'Tailender No. 9';
 case 9:
 return 'Tailender No. 10';
 case 10:
 return 'Tailender No. 11';
 default:
 return `Batsman ${index + 1}`;
 }
}

/**
 * Cleans player name by stripping embedded dismissal notes or not-out '*' marks,
 * while preserving batting-position tags (e.g."(No. 3)").
 */
export function cleanPlayerName(name: string | null | undefined): string {
 if (!name) return '';
 let cleaned = name.trim();

 const parenIdx = cleaned.indexOf('(');
 if (parenIdx !== -1) {
 const endParenIdx = cleaned.indexOf(')', parenIdx);
 if (endParenIdx !== -1) {
 const insideParen = cleaned.substring(parenIdx + 1, endParenIdx).trim();
 const isBattingOrderTag = /^no\.?\s*\d+$/i.test(insideParen);
 if (!isBattingOrderTag) {
 cleaned = cleaned.substring(0, parenIdx).trim();
 }
 }
 }

 if (cleaned.endsWith('*')) {
 cleaned = cleaned.substring(0, cleaned.length - 1).trim();
 }

 return cleaned;
}

export function comparablePlayerName(name: string | null | undefined): string {
 return cleanPlayerName(name).toLowerCase();
}

export function dismissalFromName(name: string | null | undefined): string | null {
 if (!name) return null;
 const trimmed = name.trim();
 const parenIdx = trimmed.indexOf('(');
 if (parenIdx === -1) return null;
 const endParenIdx = trimmed.indexOf(')', parenIdx);
 if (endParenIdx === -1) return null;

 const inside = trimmed.substring(parenIdx + 1, endParenIdx).trim();
 if (!inside || /^no\.?\s*\d+$/i.test(inside)) return null;
 return inside;
}
