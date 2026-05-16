/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Legacy token names repointed to the Bunker palette so every page
        // that still uses them (Admin, dashboard tabs, etc.) renders in the
        // Bunker direction without per-file rewrites.
        bg: {
          DEFAULT: '#0c0a08',
          card: '#161310',
          elevated: '#1f1a16',
        },
        ink: {
          DEFAULT: '#d8c8a8',
          dim: '#8e8270',
          fade: '#5c5346',
        },
        accent: {
          DEFAULT: '#e2683c',
          hover: '#a83f1a',
          soft: 'rgba(226, 104, 60, 0.15)',
        },
        success: '#6fb068',
        danger: '#c44a32',
        warning: '#f4c14b',
        // Bunker Command redesign palette (rust accent variant — default).
        bunk: {
          bg: '#0c0a08',
          surface: '#161310',
          surfaceHi: '#1f1a16',
          surfaceLo: '#0a0807',
          ink: '#06040a',
          line: '#2e251e',
          lineHi: '#4a3a2d',
          rust: '#e2683c',
          rustDeep: '#a83f1a',
          oxblood: '#7a1f12',
          bone: '#d8c8a8',
          boneDim: '#8e8270',
          boneMute: '#5c5346',
          green: '#6fb068',
          red: '#c44a32',
          warning: '#f4c14b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Oswald', 'sans-serif'],
        narrative: ['"Cormorant Garamond"', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        'mono-lg': '0.25em',
        'mono-md': '0.15em',
        'mono-sm': '0.08em',
      },
      spacing: {
        'pad-sect': '28px',
        'pad-card': '18px',
        'pad-card-sm': '14px',
      },
    },
  },
  plugins: [],
};
