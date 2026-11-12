/**
 * Deploy version-skew recovery (2026-11-12).
 *
 * A returning PWA client can be running the PREVIOUS build's
 * JavaScript while the server already serves a new build: the
 * service worker hands the cached shell out instantly
 * (stale-while-revalidate) and only refreshes it in the
 * background. Route chunks and lazy imports requested by the
 * stale runtime then resolve against the new build's chunk
 * graph and fail — webpack module misses such as "Cannot read
 * properties of undefined (reading 'call')", ChunkLoadError on
 * dynamic imports (the Bengali dictionary, modals, Lottie). To
 * the owner this looked like dead navigation: taps did nothing,
 * the app stayed on the homepage (reproduced locally by serving
 * the previous build, warming the SW, then swapping in the new
 * build — 31 failed RSC/chunk loads in one session).
 *
 * Two layers fix the class:
 * 1. sw.js now serves the freshest revalidated document first
 *    and refreshes the precached shell copy on every successful
 *    navigation fetch, so a full reload always converges to the
 *    current build.
 * 2. This guard: when a chunk-skew error escapes to the window
 *    (error / unhandledrejection), reload the page ONCE so the
 *    fresh shell boots. Reloads are capped per session and
 *    spaced out, and the counter resets after a stable period,
 *    so a genuine bug can never cause a reload loop.
 */

const STORAGE_KEY = 'csp_chunk_recovery_v1';
const MAX_RELOADS = 3;
const MIN_GAP_MS = 8000;
const STABLE_RESET_MS = 30000;

const CHUNK_MESSAGE_PATTERNS: readonly RegExp[] = [
  /chunkloaderror/i,
  /loading chunk [\d]+ failed/i,
  /failed to fetch dynamically resolved module/i,
  /importing a module script failed/i,
  /error loading dynamically imported module/i,
  /failed to fetch dynamically imported module/i,
];

/**
 * True when an error is a build-chunk skew failure rather than
 * an application bug. The webpack module-miss TypeError is only
 * accepted when its stack runs through /_next/static/, so an
 * unrelated TypeError in app code never triggers a reload.
 */
export function isChunkSkewError(error: unknown): boolean {
  if (typeof error === 'string') {
    return CHUNK_MESSAGE_PATTERNS.some((pattern) => pattern.test(error));
  }
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error as { name?: unknown; message?: unknown; stack?: unknown };
  const name = typeof err.name === 'string' ? err.name : '';
  const message = typeof err.message === 'string' ? err.message : '';
  const stack = typeof err.stack === 'string' ? err.stack : '';

  if (/chunkloaderror/i.test(name)) return true;
  if (CHUNK_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) return true;

  const moduleMiss =
    /cannot read properties of undefined \(reading '(call|default)'\)/i.test(message) ||
    /undefined is not an object \(evaluating '[^']*\.(call|default)'\)/i.test(message);
  if (moduleMiss && stack.includes('/_next/static/')) return true;

  return false;
}

interface RecoveryState {
  count: number;
  lastAt: number;
}

function readState(): RecoveryState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RecoveryState>;
      return {
        count: typeof parsed.count === 'number' ? parsed.count : 0,
        lastAt: typeof parsed.lastAt === 'number' ? parsed.lastAt : 0,
      };
    }
  } catch {
    // sessionStorage can throw (private mode, storage disabled);
    // recovery then simply behaves as a first attempt.
  }
  return { count: 0, lastAt: 0 };
}

function writeState(state: RecoveryState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort bookkeeping only.
  }
}

export interface ChunkRecoveryOptions {
  /** Injectable for tests; defaults to a real page reload. */
  reload?: () => void;
  /** Injectable clock for tests. */
  now?: () => number;
}

/**
 * Decides and performs a recovery for one candidate error.
 * Returns true when a reload was triggered. Exported for tests:
 * jsdom does not deliver synthetic 'unhandledrejection' events
 * to window listeners, so the rejection path is exercised here.
 */
export function attemptChunkRecovery(error: unknown, options: ChunkRecoveryOptions = {}): boolean {
  if (!isChunkSkewError(error)) return false;
  const reload = options.reload ?? (() => window.location.reload());
  const now = options.now ?? (() => Date.now());
  const state = readState();
  const at = now();
  if (state.count >= MAX_RELOADS) return false;
  if (state.count > 0 && at - state.lastAt < MIN_GAP_MS) return false;
  writeState({ count: state.count + 1, lastAt: at });
  reload();
  return true;
}

/**
 * Installs the window listeners. Returns an uninstaller.
 * SSR-safe: outside a browser it returns a no-op uninstaller.
 */
export function installChunkRecovery(options: ChunkRecoveryOptions = {}): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const stableTimer = window.setTimeout(() => {
    writeState({ count: 0, lastAt: 0 });
  }, STABLE_RESET_MS);

  const onError = (event: ErrorEvent): void => {
    attemptChunkRecovery(event.error ?? event.message, options);
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    attemptChunkRecovery(event.reason, options);
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.clearTimeout(stableTimer);
  };
}
