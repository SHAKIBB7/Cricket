import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cricket-proo.firebaseapp.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/tournaments', '/teams', '/analytics'],
        disallow: [
          '/matches/score/',
          '/matches/new',
          '/matches/opening-players',
          '/profile',
          '/offline',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
