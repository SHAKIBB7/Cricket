/**
 * Cricket Scorer Pro — Enterprise Service Worker
 * Version: 2.2.0
 * 
 * Provides offline-first application shell caching, resilient runtime caching,
 * atomic cache migrations, safe update lifecycle, and background sync triggers.
 */

const CACHE_VERSION = 'v2.2.0';
const SHELL_CACHE = `cric-scorer-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `cric-scorer-runtime-${CACHE_VERSION}`;
const STATIC_ASSET_CACHE = `cric-scorer-static-${CACHE_VERSION}`;

// Essential App Shell resources cached at install time
const PRECACHE_RESOURCES = [
  '/',
  '/offline',
  '/matches/new',
  '/matches/history',
  '/tournaments',
  '/teams',
  '/analytics',
  '/profile',
  '/manifest.json',
  '/icon.svg',
  '/assets/icon/cricket.png',
  '/assets/icon/cricket_background.png',
  '/assets/icon/cricket_foreground.png',
  '/assets/animations/cricket.json',
  '/assets/animations/stadium.json',
  '/assets/animations/plane.json',
  '/assets/animations/wickets.json',
  '/assets/illustrations/batting_intent.png',
  '/assets/illustrations/boundary_percentage.png',
  '/assets/illustrations/chase_batsman.png',
  '/assets/illustrations/man_of_match.png',
  '/assets/illustrations/non_strike_batsman.png',
  '/assets/illustrations/opening_bowler.png',
  '/assets/illustrations/running.png',
  '/assets/illustrations/strike_batsman.png',
  '/assets/illustrations/st_bat.png'
];

// Sensitive or external endpoints that must NEVER be cached by the Service Worker
const CACHE_EXCLUSION_PATTERNS = [
  /supabase\.co/i,
  /firebaseapp\.com/i,
  /googleapis\.com/i,
  /identitytoolkit/i,
  /firestore\.googleapis/i,
  /\/auth\//i,
  /\/api\/auth/i,
  /token/i,
  /oauth/i,
  /chrome-extension/i
];

/**
 * Helper to determine whether a request should be excluded from caching
 */
function isExcluded(url) {
  return CACHE_EXCLUSION_PATTERNS.some((pattern) => pattern.test(url));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. INSTALL LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(SHELL_CACHE);
      // Atomic precache with failure tolerance per resource to avoid failing install
      // if optional media is missing
      await Promise.allSettled(
        PRECACHE_RESOURCES.map(async (resource) => {
          try {
            const response = await fetch(resource, { credentials: 'same-origin' });
            if (response.ok) {
              await shellCache.put(resource, response);
            }
          } catch {
            // Non-blocking for secondary assets
          }
        })
      );
    })()
  );
  // Do NOT automatically call skipWaiting() here so active cricket matches
  // are never abruptly interrupted. Client triggers SKIP_WAITING when safe.
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ACTIVATE LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Atomic cleanup of obsolete caches
      const activeCacheKeys = [SHELL_CACHE, RUNTIME_CACHE, STATIC_ASSET_CACHE];
      const allCacheNames = await caches.keys();

      await Promise.all(
        allCacheNames.map(async (cacheName) => {
          if (!activeCacheKeys.includes(cacheName)) {
            await caches.delete(cacheName);
          }
        })
      );

      // Claim clients immediately on successful activation
      await self.clients.claim();

      // Notify clients that offline cache is ready and active
      const clients = await self.clients.matchAll();
      for (const client of clients) {
        client.postMessage({ type: 'CRIC_SW_ACTIVATED', version: CACHE_VERSION });
      }
    })()
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. FETCH INTERCEPTION & STRATEGIES
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // 1. Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }


  // 2. Enforce strict security exclusion for auth, tokens, and Supabase calls
  if (isExcluded(url)) {
    return;
  }

  // 3. Navigation Requests (HTML Pages / App Shell)
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  // 4. Static Next.js Bundles (_next/static/*) -> Cache-First
  if (url.includes('/_next/static/')) {
    event.respondWith(handleCacheFirst(request, STATIC_ASSET_CACHE));
    return;
  }

  // 5. Local Assets, Icons, Animations, Illustrations -> Stale-While-Revalidate
  if (
    url.includes('/assets/') ||
    url.includes('/icon.svg') ||
    url.includes('/manifest.json')
  ) {
    event.respondWith(handleStaleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  // 6. Generic same-origin requests -> Network-First with fallback
  if (url.startsWith(self.location.origin)) {
    event.respondWith(handleNetworkFirst(request, RUNTIME_CACHE));
  }
});

/**
 * Strategy: Navigation Requests (Network-First -> Shell Cache -> Offline Page)
 */
async function handleNavigationRequest(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch {
    // Network unavailable or offline
  }

  // Fallback 1: Try exact URL from runtime or shell cache
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // Fallback 2: Try Root App Shell (for client-side routing)
  const rootResponse = await caches.match('/');
  if (rootResponse) {
    return rootResponse;
  }

  // Fallback 3: Dedicated Offline Fallback Page
  const offlineResponse = await caches.match('/offline');
  if (offlineResponse) {
    return offlineResponse;
  }

  return new Response('Offline — Please check your network connection.', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * Strategy: Cache-First (for immutable Next.js static files)
 */
async function handleCacheFirst(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    return new Response('', { status: 408, statusText: 'Request Timeout' });
  }
}

/**
 * Strategy: Stale-While-Revalidate (for assets and media)
 */
async function handleStaleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  return cachedResponse || (await fetchPromise);
}

/**
 * Strategy: Network-First with Cache fallback
 */
async function handleNetworkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response(JSON.stringify({ error: 'Network unavailable', offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CLIENT MESSAGES & SAFE UPDATE CONTROL
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    // Only skip waiting when explicitly requested by client (e.g. idle or user clicked update)
    self.skipWaiting();
  } else if (event.data.type === 'GET_VERSION') {
    event.ports?.[0]?.postMessage({ version: CACHE_VERSION });
  } else if (event.data.type === 'PING') {
    event.ports?.[0]?.postMessage({ pong: true, time: Date.now() });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. BACKGROUND SYNC (Where supported by browser)
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'cric-sync-queue') {
    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll();
        for (const client of clients) {
          client.postMessage({ type: 'TRIGGER_BACKGROUND_SYNC' });
        }
      })()
    );
  }
});
