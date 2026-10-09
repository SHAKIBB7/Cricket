import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Navigation } from '@/components/layout/Navigation';
import { ScoringViewProvider } from '@/context/ScoringViewContext';
import { SyncProvider } from '@/context/SyncContext';

import { AuthProvider } from '@/context/AuthContext';

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
  maximumScale: 1,
  userScalable: false,
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
      <body className="antialiased">
        <AuthProvider>
          <SyncProvider>
            <ScoringViewProvider>
              <Navigation>{children}</Navigation>
            </ScoringViewProvider>
          </SyncProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
