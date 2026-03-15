export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { mono: ['JetBrains Mono', 'Fira Code', 'monospace'] },
      colors: {
        gold: { 400: '#f59e0b', 500: '#d97706' },
        bg: { 900: '#040810', 800: '#070d1a', 700: '#0a1020' },
      },
    },
  },
}
