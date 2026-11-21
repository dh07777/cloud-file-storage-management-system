const v = (n) => `rgb(var(--${n}) / <alpha-value>)`
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: v('bg'), panel: v('panel'), sunk: v('sunk'), line: v('line'),
        ink: v('ink'), muted: v('muted'), brand: v('brand'), 'brand-fg': v('brand-fg'),
        danger: v('danger'), warn: v('warn'), ok: v('ok'),
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Hanken Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / .04), 0 4px 16px -8px rgb(0 0 0 / .12)' },
    },
  },
  plugins: [],
}
