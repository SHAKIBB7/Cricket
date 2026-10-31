import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Navigation } from '@/components/layout/Navigation';
import { ScoringViewProvider } from '@/context/ScoringViewContext';
import { SyncProvider } from '@/context/SyncContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { AuthProvider } from '@/context/AuthContext';
import { PdfGenerationProvider } from '@/context/PdfGenerationContext';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://cricket-proo.firebaseapp.com'),
  title: {
    default: 'Cric Scorer Pro — Professional Live Cricket Scoring & Tournaments',
    template: '%s | Cric Scorer Pro',
  },
  description:
    'Advanced cross-platform cricket scoring platform for mobile, tablet, and desktop with real-time analytics, event-sourced undo, tournament management, and offline support.',
  manifest: '/manifest.json',
  icons: {
    icon: '/assets/icon/cricket.png',
    apple: '/assets/icon/cricket.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'Cricket Scorer Pro',
    title: 'Cric Scorer Pro — Professional Live Cricket Scoring & Tournaments',
    description:
      'Advanced cross-platform cricket scoring platform for mobile, tablet, and desktop with real-time analytics, event-sourced undo, tournament management, and offline support.',
    images: [
      {
        url: '/assets/icon/cricket.png',
        width: 512,
        height: 512,
        alt: 'Cricket Scorer Pro',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Cric Scorer Pro — Professional Live Cricket Scoring & Tournaments',
    description:
      'Advanced cross-platform cricket scoring platform with real-time analytics, event-sourced undo, and offline support.',
    images: ['/assets/icon/cricket.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#090d16' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* High-priority asset & font preloads to eliminate discovery waterfall */}
        <link
          rel="preload"
          as="image"
          href="/assets/icon/cricket.png"
          fetchPriority="high"
        />
        <link
          rel="preload"
          href="/fonts/NotoSansBengali-Bold.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/NotoSansBengali-Regular.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        {/* Anti-FOUC & Zero-Restyle Theme Script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='sunlight'){document.documentElement.classList.add('sunlight');}else if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
        {/* Inlined Critical CSS for instant LCP rendering */}
        <style
          id="critical-lcp-css"
          dangerouslySetInnerHTML={{
            __html: `
              @font-face {
                font-family: 'Noto Sans Bengali';
                src: url('/fonts/NotoSansBengali-Regular.ttf') format('truetype');
                font-weight: 400;
                font-style: normal;
                font-display: swap;
              }
              @font-face {
                font-family: 'Noto Sans Bengali';
                src: url('/fonts/NotoSansBengali-Bold.ttf') format('truetype');
                font-weight: 700;
                font-style: normal;
                font-display: swap;
              }
              :root {
                --background: #f8fafc;
                --foreground: #0f172a;
                --card: #ffffff;
                --border: #e2e8f0;
                --muted: #f1f5f9;
                --primary: #1b7a4e;
              }
              .dark {
                --background: #090d16;
                --foreground: #f8fafc;
                --card: #111827;
                --border: #1f293d;
                --muted: #1e293b;
                --primary: #10b981;
              }
              .sunlight {
                --background: #ffffff;
                --foreground: #09090b;
                --card: #ffffff;
                --border: #27272a;
                --muted: #f4f4f5;
                --primary: #047857;
              }
              body {
                background-color: var(--background);
                color: var(--foreground);
                font-family: 'Inter', 'Noto Sans Bengali', system-ui, -apple-system, sans-serif;
                margin: 0;
                padding: 0;
                overflow-x: hidden;
                text-rendering: optimizeLegibility;
                -webkit-font-smoothing: antialiased;
              }
              /* Critical LCP element typography & colors */
              .text-white\/85 { color: rgba(255, 255, 255, 0.85); }
              .text-white\/60 { color: rgba(255, 255, 255, 0.6); }
              .text-white { color: #ffffff; }
              .text-emerald-300 { color: #6ee7b7; }
              .uppercase { text-transform: uppercase; }
              .tracking-wider { letter-spacing: 0.05em; }
              .tracking-tight { letter-spacing: -0.025em; }
              .font-extrabold { font-weight: 800; }
              .font-bold { font-weight: 700; }
              .font-black { font-weight: 900; }
              .font-semibold { font-weight: 600; }
              .text-\[11px\] { font-size: 11px; line-height: 1rem; }
              .text-xs { font-size: 0.75rem; line-height: 1rem; }
              .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
              .num-font { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
              /* Critical layout & skeleton primitives */
              .w-full { width: 100%; }
              .flex { display: flex; }
              .items-center { align-items: center; }
              .justify-between { justify-content: space-between; }
              .select-none { user-select: none; }
              @keyframes shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
              }
              .animate-shimmer {
                position: relative;
                overflow: hidden;
              }
              .animate-shimmer::after {
                position: absolute;
                inset: 0;
                transform: translateX(-100%);
                background-image: linear-gradient(90deg, rgba(255, 255, 255, 0) 0, rgba(255, 255, 255, 0.06) 50%, rgba(255, 255, 255, 0) 100%);
                animation: shimmer 1.6s infinite ease-in-out;
                content: "";
              }
            `,
          }}
        />
      </head>
      <body className="antialiased">
        <LanguageProvider>
          <AuthProvider>
            <SyncProvider>
              <ScoringViewProvider>
                <PdfGenerationProvider>
                  <Navigation>{children}</Navigation>
                </PdfGenerationProvider>
              </ScoringViewProvider>
            </SyncProvider>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
