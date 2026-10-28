import { createClient } from '@supabase/supabase-js';
import { isPlaceholderOrEmpty } from './firebase';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isValidUrl = (url?: string): boolean => {
 if (!url) return false;
 try {
 const parsed = new URL(url);
 return parsed.protocol === 'http:' || parsed.protocol === 'https:';
 } catch {
 return false;
 }
};

export function checkSupabaseConfigured(): boolean {
 const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if (!url || !key || isPlaceholderOrEmpty(url) || isPlaceholderOrEmpty(key)) {
 return false;
 }
 return isValidUrl(url) && !url.includes('dummy') && !url.includes('your-project');
}

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
 binaryType = 'blob';
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
 // Prevent browser native WebSocket from connecting to non-existent dummy hostnames when unconfigured
 if (!checkSupabaseConfigured()) {
 return NodeWebSocketStub;
 }
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

/**
 * In-memory bearer token and client cache for Supabase Authorization header.
 * Supports verified Firebase Auth ID Token or custom third-party JWT.
 */
let globalAuthToken: string | null = null;
let cachedClient: any = null;
let cachedClientToken: string | null = null;

export function clearSupabaseClientCache(): void {
  cachedClient = null;
  cachedClientToken = null;
}

export function setSupabaseAuthToken(token: string | null): void {
  globalAuthToken = token;
  if (token !== cachedClientToken) {
    clearSupabaseClientCache();
  }
}

export function getSupabaseAuthToken(): string | null {
  return globalAuthToken;
}

/**
 * Returns an authenticated Supabase client configured with the verified bearer token.
 * If no token is provided, returns the anonymous/default client (restricted to public read operations).
 * Caches the client instance to prevent redundant WebSocket transports when the token is unchanged.
 */
export function getSupabaseClient(token?: string | null) {
  const effectiveToken = token !== undefined ? token : globalAuthToken;
  if (!effectiveToken) {
    return supabase;
  }

  if (cachedClient && cachedClientToken === effectiveToken) {
    return cachedClient;
  }

  cachedClientToken = effectiveToken;
  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${effectiveToken}`,
      },
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
      transport: getWebSocketTransport() as any,
    },
  });

  return cachedClient;
}
