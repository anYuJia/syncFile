/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['selector', ':root[data-theme="dark"]'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        desktop: 'var(--radius-desktop)',
        control: 'var(--radius-control)',
        chip: 'var(--radius-chip)'
      },
      colors: {
        background: 'var(--bg-primary)',
        foreground: 'var(--text-primary)',
        surface: 'var(--bg-elevated)',
        panel: 'var(--bg-panel-strong)',
        muted: 'var(--bg-secondary)',
        border: 'var(--line-soft)',
        accent: 'var(--accent)'
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'ui-monospace', 'monospace']
      },
      transitionTimingFunction: {
        desktop: 'cubic-bezier(0.2, 0, 0, 1)'
      },
      transitionDuration: {
        120: '120ms',
        170: '170ms',
        230: '230ms'
      },
      boxShadow: {
        desktop: 'var(--shadow-sm)',
        'desktop-lg': 'var(--shadow-md)'
      }
    }
  },
  plugins: []
};
