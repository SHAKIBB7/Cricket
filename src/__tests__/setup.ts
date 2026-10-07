// Global test setup for Vitest
// Polyfills WebSocket if running on Node.js versions without native WebSocket (Node.js < 22)

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
