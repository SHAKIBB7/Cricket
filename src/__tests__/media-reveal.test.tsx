// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RevealImg, MediaReveal } from '../components/motion/MediaReveal';

/**
 * Image-entrance programme (2026-11-11): media enters in the ONE
 * motion system — a shimmer skeleton holds the image's exact box
 * while it loads; the image itself scale/fades in on load (the
 * Reveal curve); the Home stadium crossfades from a static
 * poster once the Lottie reports ready.
 */
describe('media entrance (RevealImg / MediaReveal)', () => {
  it('renders a real img (src in initial HTML) with a shimmer skeleton behind it', () => {
    const html = renderToStaticMarkup(
      React.createElement(RevealImg, {
        src: '/assets/illustrations/strike_batsman.png',
        alt: '',
        'aria-hidden': true,
        className: 'object-contain w-full h-full',
        index: 1,
      }),
    );
    expect(html).toContain('src="/assets/illustrations/strike_batsman.png"');
    expect(html).toContain('animate-shimmer');
  });

  it('watermark mode renders no skeleton and no wrapper', () => {
    const html = renderToStaticMarkup(
      React.createElement(RevealImg, {
        src: '/assets/illustrations/man_of_match.png',
        alt: '',
        watermark: true,
        className: 'absolute opacity-20',
      }),
    );
    expect(html).toContain('src="/assets/illustrations/man_of_match.png"');
    expect(html).not.toContain('animate-shimmer');
    expect(html).not.toContain('<span');
  });

  it('MediaReveal renders the poster and the media child', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MediaReveal,
        { ready: false, poster: '/assets/illustrations/stadium_poster.png' },
        React.createElement('div', { id: 'lottie-child' }, 'anim'),
      ),
    );
    expect(html).toContain('src="/assets/illustrations/stadium_poster.png"');
    expect(html).toContain('id="lottie-child"');
  });

  it('the stadium poster asset exists and the warm list carries the illustrations', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    expect(
      fs.existsSync(
        join(process.cwd(), 'public/assets/illustrations/stadium_poster.png'),
      ),
    ).toBe(true);
    const warm = readFileSync(
      join(process.cwd(), 'src/infrastructure/offline/OfflineSetupService.ts'),
      'utf8',
    );
    expect(warm).toContain("'/assets/illustrations/stadium_poster.png'");
    expect(warm).toContain("'/assets/illustrations/strike_batsman.png'");
  });

  it('Home crossfades the stadium from the poster via onReady', () => {
    const home = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8');
    expect(home).toContain('<MediaReveal');
    expect(home).toContain('poster="/assets/illustrations/stadium_poster.png"');
    expect(home).toContain('onReady={() => setStadiumReady(true)}');
    const stadium = readFileSync(
      join(process.cwd(), 'src/components/common/StadiumLottieAnimation.tsx'),
      'utf8',
    );
    expect(stadium).toContain('onReadyRef.current?.()');
  });
});
