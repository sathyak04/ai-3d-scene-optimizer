import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0a0c',
          panel: '#13131a',
          panelHover: '#1a1a23',
          border: '#26262f',
        },
        accent: {
          DEFAULT: '#7c5cff',
          glow: '#9a82ff',
        },
        good: '#3ddc84',
        warn: '#ffb547',
        bad: '#ff5470',
        text: {
          DEFAULT: '#e8e8ee',
          muted: '#9a9aab',
          dim: '#5e5e6e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
