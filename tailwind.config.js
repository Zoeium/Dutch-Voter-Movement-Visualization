/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'app-bg': 'var(--c-bg)',
        'app-card': 'var(--c-bg-card)',
        'app-header': 'var(--c-bg-header)',
        'app-border': 'var(--c-border)',
        'app-border-strong': 'var(--c-border-strong)',
        'app-text': 'var(--c-text)',
        'app-heading': 'var(--c-text-heading)',
        'app-muted': 'var(--c-text-muted)',
        'app-subtle': 'var(--c-text-subtle)',
        'app-btn': 'var(--c-btn-inactive)',
        'app-btn-text': 'var(--c-btn-inactive-text)',
        'app-btn-hover': 'var(--c-btn-inactive-hover)',
        'app-link': 'var(--c-link)',
        'app-link-hover': 'var(--c-link-hover)',
        'app-grid': 'var(--c-grid-line)',
        'app-axis': 'var(--c-axis-text)',
        'app-tooltip-bg': 'var(--c-tooltip-bg)',
        'app-tooltip-border': 'var(--c-tooltip-border)',
        'app-tooltip-text': 'var(--c-tooltip-text)',
        'app-divider': 'var(--c-divider-line)',
      },
    },
  },
  plugins: [],
};
