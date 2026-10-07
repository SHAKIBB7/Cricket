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
        'xs': 'clamp(0.65rem, 0.6rem + 0.3vw, 0.75rem)',
        'sm': 'clamp(0.75rem, 0.7rem + 0.4vw, 0.875rem)',
        'base': 'clamp(0.875rem, 0.8rem + 0.5vw, 1rem)',
        'md': 'clamp(0.9375rem, 0.9rem + 0.3vw, 1rem)',
        'lg': 'clamp(1.125rem, 1rem + 0.5vw, 1.375rem)',
        'xl': 'clamp(1.5rem, 1.3rem + 1vw, 1.75rem)',
        '2xl': 'clamp(1.75rem, 1.5rem + 1.5vw, 2.25rem)',
        '3xl': 'clamp(2.25rem, 2rem + 1.5vw, 3rem)',
        '4xl': 'clamp(3rem, 2.5rem + 2vw, 4rem)',
        '5xl': 'clamp(4rem, 3.5rem + 2.5vw, 5rem)',
        '6xl': 'clamp(4.5rem, 4rem + 3vw, 6rem)',
      },
      spacing: {
        'screen-x': 'clamp(1rem, 0.5rem + 2vw, 1.25rem)',
        'section': 'clamp(1.25rem, 1rem + 2vw, 1.5rem)',
        'card': '1rem',
        'card-gap': '0.75rem',
      },
      height: {
        'btn': 'clamp(2.75rem, 2.5rem + 1vw, 3.25rem)',
        'input': 'clamp(2.75rem, 2.5rem + 1vw, 3.25rem)',
      },
      minHeight: {
        'btn': 'clamp(2.75rem, 2.5rem + 1vw, 3.25rem)',
        'input': 'clamp(2.75rem, 2.5rem + 1vw, 3.25rem)',
      },
      borderRadius: {
        'card': 'clamp(0.75rem, 0.5rem + 1vw, 1rem)',
      }
    },
  },
  plugins: [],
};
