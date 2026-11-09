/**
 * In-house error monitoring (no external dependency).
 *
 * Captures unhandled window errors and promise rejections into a
 * bounded ring buffer persisted in localStorage, so a user (or a
 * support session) can surface what actually happened on a device
 * — the F12 lesson was that production errors were invisible
 * until the user manually opened a console. The profile page's
 * ErrorLogSection renders the buffer; nothing leaves the device.
 */

export interface ErrorLogEntry {
  /** ISO 8601 timestamp. */
  ts: string;
  message: string;
  stack?: string;
  /** Where the error was caught: 'window.onerror', 'unhandledrejection', or a caller-supplied tag. */
  source: string;
}

export const ERROR_LOG_STORAGE_KEY = 'csp_error_log';
export const MAX_ERROR_LOG_ENTRIES = 50;

let buffer: ErrorLogEntry[] | null = null;
let handlersInstalled = false;

function readStorage(): ErrorLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ERROR_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is ErrorLogEntry =>
          !!e && typeof e.ts === 'string' && typeof e.message === 'string'
      )
      .slice(0, MAX_ERROR_LOG_ENTRIES);
  } catch {
    return [];
  }
}

function persist(): void {
  if (typeof window === 'undefined' || buffer === null) return;
  try {
    window.localStorage.setItem(ERROR_LOG_STORAGE_KEY, JSON.stringify(buffer));
  } catch {
    // Storage full or unavailable — the in-memory buffer still works
    // for this session; monitoring must never throw into the app.
  }
}

function ensureLoaded(): ErrorLogEntry[] {
  if (buffer === null) buffer = readStorage();
  return buffer;
}

function describeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack };
  }
  if (typeof error === 'string') return { message: error };
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === 'string' && msg) return { message: msg };
  }
  try {
    return { message: String(error) };
  } catch {
    return { message: 'Unknown error' };
  }
}

/** Record an error in the ring buffer (newest first, max 50). */
export function reportError(error: unknown, source = 'manual'): void {
  try {
    const { message, stack } = describeError(error);
    const entries = ensureLoaded();
    entries.unshift({
      ts: new Date().toISOString(),
      message,
      ...(stack ? { stack } : {}),
      source,
    });
    buffer = entries.slice(0, MAX_ERROR_LOG_ENTRIES);
    persist();
  } catch {
    // Monitoring must never break the app it observes.
  }
}

/** Newest-first copy of the buffered errors. */
export function getErrorLog(): ErrorLogEntry[] {
  return [...ensureLoaded()];
}

export function clearErrorLog(): void {
  buffer = [];
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(ERROR_LOG_STORAGE_KEY);
    } catch {
      // Ignore — buffer is already cleared in memory.
    }
  }
}

function onWindowError(event: ErrorEvent): void {
  reportError(event.error ?? event.message ?? 'Unknown error', 'window.onerror');
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  reportError(event.reason ?? 'Unhandled promise rejection', 'unhandledrejection');
}

/**
 * Install the global handlers (idempotent). Returns an uninstall
 * function, mainly for tests.
 */
export function installErrorHandlers(): () => void {
  if (typeof window === 'undefined' || handlersInstalled) return () => {};
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  handlersInstalled = true;
  return () => {
    window.removeEventListener('error', onWindowError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    handlersInstalled = false;
  };
}
