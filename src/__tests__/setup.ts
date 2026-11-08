// Global test setup for Vitest
// Polyfills WebSocket if running on Node.js versions without native WebSocket (Node.js < 22)
// Polyfills IndexedDB for Dexie testing in Node.js environment

import 'fake-indexeddb/auto';

// jsdom lacks matchMedia; framer-motion's reduced-motion probe needs it.
// Guarded so the node environment is untouched.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

if (typeof globalThis.WebSocket === 'undefined') {
  class MockWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readyState = MockWebSocket.OPEN;
    url: string;
    onopen: ((event: any) => void) | null = null;
    onclose: ((event: any) => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    onmessage: ((event: any) => void) | null = null;

    constructor(url: string) {
      this.url = url;
      setTimeout(() => {
        if (this.onopen) this.onopen({ type: 'open' });
      }, 0);
    }

    addEventListener(event: string, callback: any) {
      if (event === 'open') setTimeout(() => callback({ type: 'open' }), 0);
    }

    removeEventListener() {}

    send() {}

    close() {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) this.onclose({ type: 'close' });
    }
  }

  (globalThis as any).WebSocket = MockWebSocket;
}
