import { preload } from 'react-dom';

const started = new Set<string>();

/**
 * Image-immediacy (owner polish, 2026-11-11): page media used
 * to arrive noticeably AFTER the text, because data-driven
 * cards only mount (and thus only start fetching their
 * illustrations) once Dexie data lands. Pages call this at the
 * top of their first render — the browser then fetches the
 * images in parallel with everything else, so by the time a
 * card mounts, its image is already in the HTTP cache (or
 * device-resident via the SW precache) and RevealImg can enter
 * it immediately. Deduped module-wide; safe to call on every
 * render.
 */
export function preloadImages(...hrefs: string[]): void {
  for (const href of hrefs) {
    if (started.has(href)) continue;
    started.add(href);
    try {
      preload(href, { as: 'image' });
    } catch {
      // No DOM (edge SSR paths) — the SW precache still covers it.
    }
  }
}
