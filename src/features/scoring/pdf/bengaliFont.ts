/**
 * bengaliFont.ts
 * Unicode Bengali Font Manager for PDF and HTML rendering.
 * Provides font registration, embedding, base64 data URIs, and detection.
 */

import {
  NOTO_SANS_BENGALI_REGULAR_BASE64,
  NOTO_SANS_BENGALI_BOLD_BASE64,
} from './bengaliFontData';

export const BENGALI_FONT_NAME = 'NotoSansBengali';

/**
 * Checks whether a given string contains Bengali Unicode characters.
 * Bengali Unicode Block: U+0980 - U+09FF
 */
export function hasBengaliText(str?: string | null): boolean {
  if (!str || typeof str !== 'string') return false;
  return /[\u0980-\u09FF]/.test(str);
}

/**
 * Retrieves the base64-encoded TrueType font data.
 */
export function getBengaliFontBase64(weight: 'normal' | 'bold' = 'normal'): string {
  return weight === 'bold'
    ? NOTO_SANS_BENGALI_BOLD_BASE64
    : NOTO_SANS_BENGALI_REGULAR_BASE64;
}

/**
 * Generates data URI for CSS @font-face rules.
 */
export function getBengaliFontDataUri(weight: 'normal' | 'bold' = 'normal'): string {
  const base64 = getBengaliFontBase64(weight);
  return `data:font/truetype;charset=utf-8;base64,${base64}`;
}

/**
 * Registers Noto Sans Bengali TrueType fonts directly into a jsPDF instance.
 * Embeds both Regular (400) and Bold (700) weights into the virtual file system (VFS).
 */
export function registerBengaliFontsInJsPdf(doc: any): void {
  try {
    if (!doc || typeof doc.addFileToVFS !== 'function') return;

    // Register regular font if not already added
    doc.addFileToVFS('NotoSansBengali-Regular.ttf', NOTO_SANS_BENGALI_REGULAR_BASE64);
    doc.addFont('NotoSansBengali-Regular.ttf', BENGALI_FONT_NAME, 'normal');

    // Register bold font if not already added
    doc.addFileToVFS('NotoSansBengali-Bold.ttf', NOTO_SANS_BENGALI_BOLD_BASE64);
    doc.addFont('NotoSansBengali-Bold.ttf', BENGALI_FONT_NAME, 'bold');
  } catch (err) {
    console.warn('[bengaliFont] Warning registering Bengali font in jsPDF:', err);
  }
}
