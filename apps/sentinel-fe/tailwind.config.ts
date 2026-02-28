import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-base':      '#0a0e1a',
        'bg-surface':   '#0d1224',
        'bg-elevated':  '#111827',
        'bg-overlay':   '#1a2035',
        'us':           '#00b0ff',
        'ir':           '#ef4444',
        'il':           '#22c55e',
      },
      fontFamily: {
        display: ['Orbitron', 'monospace'],
        mono:    ['Share Tech Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '4px',
        sm: '2px',
        md: '4px',
        lg: '4px',   // intentionally same — no large rounding
      },
    },
  },
  plugins: [],
}

export default config
