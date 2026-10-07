import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isValidUrl = (url?: string): boolean => {
 if (!url) return false;
 try {
 const parsed = new URL(url);
 return parsed.protocol === 'http:' || parsed.protocol === 'https:';
 } catch {
 return false;
 }
};

const supabaseUrl = isValidUrl(rawUrl) ? (rawUrl as string) : 'https://dummy.supabase.co';
const supabaseAnonKey = rawKey && rawKey !== '[SENSITIVE]' ? rawKey : 'dummy-key';

if (!isValidUrl(rawUrl) || !rawKey || rawKey === '[SENSITIVE]') {
 if (typeof window !== 'undefined') {
 console.warn('Missing or invalid Supabase environment variables. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.');
 }
}

/**
 * Lightweight WebSocket stub for Node.js / SSR / Test environments
 * where native WebSocket is not globally available (e.g. Node.js < 22).
 */
class NodeWebSocketStub {
 static readonly CONNECTING = 0;
 static readonly OPEN = 1;
 static readonly CLOSING = 2;
 static readonly CLOSED = 3;

 readyState = NodeWebSocketStub.CLOSED;
 onopen: ((event: any) => void) | null = null;
 onclose: ((event: any) => void) | null = null;
 onerror: ((event: any) => void) | null = null;
 onmessage: ((event: any) => void) | null = null;

 constructor() {}
 addEventListener() {}
 removeEventListener() {}
 send() {}
 close() {}
}

const getWebSocketTransport = () => {
 if (typeof WebSocket !== 'undefined') return WebSocket;
 if (typeof globalThis !== 'undefined' && typeof globalThis.WebSocket !== 'undefined') {
 return globalThis.WebSocket;
 }
 return NodeWebSocketStub;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
 auth: {
 persistSession: true,
 autoRefreshToken: true,
 },
 realtime: {
 params: {
 eventsPerSecond: 10,
 },
 transport: getWebSocketTransport() as any,
 },
});
