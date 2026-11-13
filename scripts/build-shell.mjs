#!/usr/bin/env node
/**
 * Capacitor shell build (Phase 1).
 *
 * Builds the static export (out/) that Capacitor packages:
 *   1. moves src/app/api aside — the PDF export route is
 *      force-dynamic and cannot be statically exported (the client
 *      jsPDF fallback covers PDF inside the shell);
 *   2. runs `next build` with CAPACITOR_BUILD=1 (env-switched
 *      config: output 'export' + trailingSlash, no headers());
 *   3. restores src/app/api — even when the build fails — so the
 *      working tree is left exactly as it was found.
 *
 * Usage: node scripts/build-shell.mjs   (or: npm run build:shell)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'src', 'app', 'api');
// The aside location MUST be outside src/app: anything left under
// src/app is still picked up as an App Router segment (a first
// version of this script parked it at src/app/api.__shell-aside__
// and Next duly tried to export /api.__shell-aside__/pdf/export).
const asideRoot = path.join(root, '.shell-aside');
const asideDir = path.join(asideRoot, 'api');

if (fs.existsSync(asideDir)) {
  console.error('[build-shell] .shell-aside/api already exists — a previous run may have been interrupted. Restore it manually, then re-run.');
  process.exit(1);
}

/**
 * Post-build: inject a tiny synchronous redirector into
 * out/404.html, just after <head> opens.
 *
 * Why: the exported 404 page is a full App Router document. When
 * it is served at a dynamic URL (Capacitor errorPath), React
 * hydration of that throwaway document mismatches against the
 * URL-derived router state (React #418/#423 — observed in Chromium
 * probes for the score route) before the NotFound component's
 * effect can redirect. This inline script runs during document
 * parse — before any app JS — and performs the same mapping the
 * component does (patterns mirror src/lib/shellRoutes.ts; the
 * component's effect remains as the fallback). It exists ONLY in
 * the exported artifact; the web build never sees it. The shell's
 * meta CSP allows inline scripts ('unsafe-inline'), as does the
 * web header policy.
 */
function injectEarlyRedirector() {
  const file = path.join(root, 'out', '404.html');
  if (!fs.existsSync(file)) {
    console.warn('[build-shell] out/404.html not found — early redirector skipped');
    return;
  }
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes('csp-shell-redirector')) return;
  const script = `<!-- csp-shell-redirector --><script>(function(){try{var p=window.location.pathname;var pats=[['/matches/score/','/matches/score/_/'],['/matches/center/','/matches/center/_/'],['/matches/summary/','/matches/summary/_/'],['/players/','/players/_/'],['/tournaments/','/tournaments/_/']];for(var i=0;i<pats.length;i++){var pre=pats[i][0];if(p.indexOf(pre)===0){var seg=p.slice(pre.length).split('/')[0];if(seg&&seg!=='_'){if(window.sessionStorage.getItem('csp:redirect-attempted')===p)return;window.sessionStorage.setItem('csp:redirect-attempted',p);window.sessionStorage.setItem('csp:redirect-path',p);window.location.replace(pats[i][1]);return;}}}}catch(e){}})();</script>`;
  const headOpen = html.indexOf('<head>');
  if (headOpen === -1) {
    console.warn('[build-shell] no <head> in out/404.html — early redirector skipped');
    return;
  }
  const at = headOpen + '<head>'.length;
  fs.writeFileSync(file, html.slice(0, at) + script + html.slice(at));
  console.log('[build-shell] injected early redirector into out/404.html');
}

let moved = false;
try {
  if (fs.existsSync(apiDir)) {
    fs.mkdirSync(asideRoot, { recursive: true });
    fs.renameSync(apiDir, asideDir);
    moved = true;
    console.log('[build-shell] moved src/app/api aside');
  }
  const result = spawnSync('npx', ['next', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, CAPACITOR_BUILD: '1' },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  console.log(process.exitCode === 0 ? '[build-shell] export build OK -> out/' : '[build-shell] export build FAILED');
  if (process.exitCode === 0) injectEarlyRedirector();
} finally {
  if (moved && fs.existsSync(asideDir)) {
    fs.renameSync(asideDir, apiDir);
    fs.rmdirSync(asideRoot);
    console.log('[build-shell] restored src/app/api');
  }
}
