/**
 * DOM render helper for jsdom suites (`// @vitest-environment jsdom`).
 *
 * Drop-in replacement for renderToStaticMarkup that also captures
 * PORTAL content: overlay primitives render into document.body via
 * createPortal, which SSR markup silently drops. Assertions keep
 * operating on a plain HTML string, exactly as before.
 *
 * Two rendering-mode normalizations keep assertions about CONTENT,
 * not about which renderer produced the markup:
 * - The helper's own container contributes only its innerHTML, so an
 *   empty render yields '' just like SSR.
 * - MotionNumber renders an animated per-digit strip in the browser
 *   (SSR falls back to plain text). Each digit-strip wrapper carries
 *   role="text" + aria-label with the full formatted number — its
 *   accessible text equivalent — so we collapse it back to that text.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

export function renderToHtml(element: React.ReactElement): string {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });

  document
    .querySelectorAll('[role="text"][aria-label]')
    .forEach((el) => el.replaceWith(document.createTextNode(el.getAttribute('aria-label') ?? '')));

  const html = Array.from(document.body.childNodes)
    .map((node) => (node === container ? container.innerHTML : ((node as Element).outerHTML ?? '')))
    .join('');

  act(() => {
    root.unmount();
  });
  container.remove();
  document.body.innerHTML = '';
  return html;
}
