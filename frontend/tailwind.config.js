/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0a0d',
          card: '#161619',
          elevated: '#1f1f24',
        },
        ink: {
          DEFAULT: '#e8e6e3',
          dim: '#a3a09b',
          fade: '#6b6862',
        },
        accent: {
          DEFAULT: '#d97706',
          hover: '#b45309',
          soft: 'rgba(217, 119, 6, 0.15)',
        },
        success: '#16a34a',
        danger: '#dc2626',
        warning: '#eab308',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
