/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#eef2fb', soft: '#a3adc7', mute: '#6f7a96' },
        night: { 950: '#05080f', 900: '#0a0f1c', 850: '#0e1526', 800: '#131c32', 700: '#1b2643', 600: '#26345a' },
        ball: { DEFAULT: '#d8f54a', soft: '#e7fa86', deep: '#a9c62a', ink: '#1b2400' },
        court: { DEFAULT: '#1f6fae', deep: '#164f80', line: '#e8f0ff' },
        teal: { DEFAULT: '#37d3b4' },
        amber: { DEFAULT: '#ffb547' },
        rose: { DEFAULT: '#ff6b6b' },
        gold: { DEFAULT: '#ffd166' },
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: {
        glow: '0 10px 40px -8px rgba(216,245,74,.45)',
        card: '0 1px 0 rgba(255,255,255,.04) inset, 0 12px 32px -12px rgba(0,0,0,.6)',
      },
      borderRadius: { '4xl': '2rem' },
    },
  },
  plugins: [],
};
