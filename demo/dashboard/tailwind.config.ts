import type { Config } from 'tailwindcss';

// Mirrors the todea.co.kr design system: Sora display face, a pure-black brand,
// and the same "rise" entrance + marquee keyframes.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#000000',
        ink: '#0a0f10', // the dark surface used for footer / terminal cards
      },
      fontFamily: {
        sora: ['var(--font-sora)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(48px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        rise: 'rise 0.85s cubic-bezier(0.25, 1, 0.5, 1) forwards',
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
