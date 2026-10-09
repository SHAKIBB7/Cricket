import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Navigation } from '@/components/layout/Navigation';
import { ScoringViewProvider } from '@/context/ScoringViewContext';
import { SyncProvider } from '@/context/SyncContext';

export const metadata: Metadata = {
  title: 'Cric Scorer Pro — Professional Live Cricket Scoring & Tournaments',
  description:
    'Advanced cross-platform cricket scoring platform for mobile, tablet, and desktop with real-time analytics, event-sourced undo, tournament management, and offline support.',
  manifest: '/manifest.json',
  icons: {
    icon: '/assets/icon/cricket.png',
    apple: '/assets/icon/cricket.png',
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
        <SyncProvider>
          <ScoringViewProvider>
            <Navigation>{children}</Navigation>
          </ScoringViewProvider>
        </SyncProvider>
      </body>
    </html>
  );
}
