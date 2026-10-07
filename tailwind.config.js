/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    screens: {
      'xs': '375px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
      '3xl': '1920px',
      // Viewport-aware height breakpoints for laptops & short displays
      'short': { 'raw': '(max-height: 800px)' },
      'vshort': { 'raw': '(max-height: 680px)' },
      'tall': { 'raw': '(min-height: 900px)' },
    },
    extend: {
      colors: {
        cricket: {
          pitch: '#1b7a4e',
          grass: '#2e7d32',
          clay: '#c25e2e',
          leather: '#8d1d1d',
          crease: '#ffffff',
          gold: '#eab308',
          stadium: '#0f172a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        // Traditional Tailwind Scale — Reduced by ~20-25%
        'xs': 'clamp(0.625rem, 0.58rem + 0.15vw, 0.6875rem)',   // ~10px - 11px
        'sm': 'clamp(0.6875rem, 0.65rem + 0.18vw, 0.75rem)',   // ~11px - 12px
        'base': 'clamp(0.75rem, 0.7rem + 0.22vw, 0.85rem)',     // ~12px - 13.6px
        'md': 'clamp(0.775rem, 0.74rem + 0.2vw, 0.875rem)',     // ~12.4px - 14px
        'lg': 'clamp(0.875rem, 0.8rem + 0.3vw, 1rem)',          // ~14px - 16px
        'xl': 'clamp(0.95rem, 0.85rem + 0.45vw, 1.15rem)',      // ~15.2px - 18.4px
        '2xl': 'clamp(1.15rem, 1rem + 0.6vw, 1.4rem)',          // ~18.4px - 22.4px
        '3xl': 'clamp(1.3rem, 1.15rem + 0.9vw, 1.7rem)',        // ~20.8px - 27.2px
        '4xl': 'clamp(1.65rem, 1.4rem + 1.2vw, 2.1rem)',        // ~26.4px - 33.6px
        '5xl': 'clamp(2rem, 1.7rem + 1.5vw, 2.6rem)',            // ~32px - 41.6px
        '6xl': 'clamp(2.4rem, 2rem + 1.8vw, 3.2rem)',            // ~38.4px - 51.2px
        
        // Dedicated Fluid Team Name Token (~12px on mobile, scaling to 13-14px)
        'team-name': ['clamp(0.75rem, 0.72rem + 0.15vw, 0.8125rem)', { lineHeight: '1.2', fontWeight: '700', letterSpacing: '0.04em' }],

        // Semantic Fluid Typography System — Reduced by ~20-25%
        'display': ['clamp(1.5rem, 1.3rem + 1.5vw, 2.4rem)', { lineHeight: '1.1', fontWeight: '900' }],
        'h1': ['clamp(1.15rem, 1rem + 1vw, 1.7rem)', { lineHeight: '1.2', fontWeight: '800' }],
        'h2': ['clamp(0.95rem, 0.85rem + 0.75vw, 1.35rem)', { lineHeight: '1.25', fontWeight: '800' }],
        'h3': ['clamp(0.85rem, 0.78rem + 0.5vw, 1.1rem)', { lineHeight: '1.3', fontWeight: '700' }],
        'section-title': ['clamp(0.8rem, 0.75rem + 0.35vw, 0.95rem)', { lineHeight: '1.35', fontWeight: '700', letterSpacing: '0.015em' }],
        'card-title': ['clamp(0.75rem, 0.72rem + 0.25vw, 0.875rem)', { lineHeight: '1.4', fontWeight: '700' }],
        'body': ['clamp(0.72rem, 0.68rem + 0.2vw, 0.825rem)', { lineHeight: '1.5' }],
        'body-small': ['clamp(0.6875rem, 0.65rem + 0.15vw, 0.75rem)', { lineHeight: '1.45' }],
        'caption': ['clamp(0.625rem, 0.58rem + 0.12vw, 0.6875rem)', { lineHeight: '1.4', letterSpacing: '0.01em' }],
        'label': ['clamp(0.625rem, 0.58rem + 0.15vw, 0.6875rem)', { lineHeight: '1', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }],
        'btn-text': ['clamp(0.75rem, 0.72rem + 0.2vw, 0.85rem)', { lineHeight: '1', fontWeight: '800' }],
        'score-large': ['clamp(1.75rem, 1.45rem + 1.8vw, 2.75rem)', { lineHeight: '1', fontWeight: '900' }],
        'score': ['clamp(1.05rem, 0.95rem + 0.9vw, 1.65rem)', { lineHeight: '1', fontWeight: '900' }],
        'stat': ['clamp(0.85rem, 0.78rem + 0.4vw, 1.15rem)', { lineHeight: '1.1', fontWeight: '800' }],
        'nav': ['clamp(0.75rem, 0.7rem + 0.2vw, 0.825rem)', { lineHeight: '1.2', fontWeight: '600' }],
      },
      spacing: {
        'screen-x': 'clamp(0.75rem, 0.5rem + 1.2vw, 1.5rem)',
        'section': 'clamp(1rem, 0.75rem + 1.2vw, 1.5rem)',
        'card': 'clamp(0.875rem, 0.75rem + 0.8vw, 1.35rem)',
        'card-gap': 'clamp(0.625rem, 0.5rem + 0.6vw, 1rem)',
        
        // Semantic Responsive Spacing Scale
        'xs': 'clamp(0.2rem, 0.15rem + 0.2vw, 0.35rem)',
        'sm': 'clamp(0.4rem, 0.3rem + 0.3vw, 0.6rem)',
        'md': 'clamp(0.65rem, 0.5rem + 0.4vw, 0.9rem)',
        'lg': 'clamp(0.9rem, 0.75rem + 0.6vw, 1.25rem)',
        'xl': 'clamp(1.25rem, 1rem + 1vw, 1.75rem)',
        '2xl': 'clamp(1.75rem, 1.4rem + 1.5vw, 2.5rem)',
      },
      height: {
        'btn': 'clamp(2.5rem, 2.25rem + 0.6vw, 3.125rem)',
        'btn-sm': 'clamp(2rem, 1.85rem + 0.4vw, 2.5rem)',
        'input': 'clamp(2.5rem, 2.25rem + 0.6vw, 3.125rem)',
      },
      minHeight: {
        'btn': 'clamp(2.5rem, 2.25rem + 0.6vw, 3.125rem)',
        'btn-sm': 'clamp(2rem, 1.85rem + 0.4vw, 2.5rem)',
        'input': 'clamp(2.5rem, 2.25rem + 0.6vw, 3.125rem)',
      },
      borderRadius: {
        'card': 'clamp(0.75rem, 0.5rem + 0.8vw, 1.15rem)',
        'pill': '9999px',
      },
      boxShadow: {
        'floating': '0 4px 20px -2px rgba(0, 0, 0, 0.06), 0 2px 6px -1px rgba(0, 0, 0, 0.03)',
        'floating-md': '0 10px 25px -3px rgba(0, 0, 0, 0.08), 0 4px 10px -2px rgba(0, 0, 0, 0.04)',
        'floating-lg': '0 18px 36px -4px rgba(0, 0, 0, 0.12), 0 6px 14px -3px rgba(0, 0, 0, 0.06)',
      }
    },
  },
  plugins: [],
};
