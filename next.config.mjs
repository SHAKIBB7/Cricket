/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Image optimization is ON (the old images config disabled it entirely).
  // No component uses next/image yet, so this changes nothing at runtime
  // today; the actual byte savings came from optimizing the files in
  // public/assets in place (8.4 MB -> 0.73 MB, same paths). The flag removal
  // means any future next/image adoption gets the optimizer automatically.
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      'clsx',
      'tailwind-merge',
    ],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' }
        ]
      },
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }
        ]
      },
      {
        source: '/fonts/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }
        ]
      },
      {
        source: '/assets/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }
        ]
      },
      {
        source: '/(.*)',
        headers: [
          // Content-Security-Policy (bug hunt P-5): a second
          // line of defence behind React's escaping, for an app
          // rendering large amounts of user-generated text.
          // Scoped to the origins the app actually uses:
          // Google APIs/GIS + gstatic (auth, Drive, Maps),
          // Firebase (auth + Firestore websockets), Supabase,
          // and Google Fonts. 'unsafe-inline' for script/style
          // covers Next's inline bootstrap and the layout's
          // static theme-init script / critical CSS blocks.
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://accounts.google.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://accounts.google.com",
              "frame-src https://accounts.google.com https://*.firebaseapp.com",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' }
        ],
      },
    ];
  },
};

export default nextConfig;
