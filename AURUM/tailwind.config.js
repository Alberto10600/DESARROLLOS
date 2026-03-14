/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        aurum: {
          bg:       '#040810',
          surface:  '#070d1a',
          border:   '#0f1f3a',
          accent:   '#f59e0b',
          gold:     '#d97706',
          blue:     '#3b82f6',
          green:    '#10b981',
          red:      '#ef4444',
          muted:    '#4b5563',
          text:     '#e2e8f0',
          subtext:  '#94a3b8',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    }
  },
  plugins: []
}
