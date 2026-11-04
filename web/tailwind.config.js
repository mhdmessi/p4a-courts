/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#eef2fb', soft: '#a3adc7', mute: '#6f7a96' },
        night: { 950: '#07060e', 900: '#0b0a16', 850: '#110f20', 800: '#181530', 700: '#221e40', 600: '#2f2a55' },
        ball: { DEFAULT: '#b49cff', soft: '#d4c6ff', deep: '#7c3aed', ink: '#ffffff' },
        mint: { DEFAULT: '#5eead4' },
        court: { DEFAULT: '#3155c9', deep: '#1f3a8f', line: '#e8f0ff' },
        teal: { DEFAULT: '#37d3b4' },
        amber: { DEFAULT: '#ffb547' },
        rose: { DEFAULT: '#ff6b6b' },
        gold: { DEFAULT: '#ffd166' },
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: {
        glow: '0 12px 40px -10px rgba(168,85,247,.65)',
        card: '0 1px 0 rgba(255,255,255,.04) inset, 0 12px 32px -12px rgba(0,0,0,.6)',
      },
      borderRadius: { '4xl': '2rem' },
    },
  },
  plugins: [],
};
