/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Design-Tokens aus src/index.css. Hell/Dunkel steckt in den CSS-Variablen,
      // deshalb brauchen die neuen Oberflächen keine dark:-Varianten mehr.
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        ink: 'var(--text)',
        dim: 'var(--dim)',
        faint: 'var(--faint)',
        line: 'var(--border)',
        line2: 'var(--border2)',
        input: 'var(--input)',
        zebra: 'var(--zebra)',
        brand: {
          DEFAULT: 'var(--brand)',
          dark: 'var(--brand-dark)',
          fg: 'var(--brand-fg)',
          soft: 'var(--brand-soft)',
        },
        good: {
          DEFAULT: 'var(--good)',
          soft: 'var(--good-soft)',
          bd: 'var(--good-bd)',
        },
        warn: {
          DEFAULT: 'var(--warn)',
          soft: 'var(--warn-soft)',
          bd: 'var(--warn-bd)',
        },
        bad: {
          DEFAULT: 'var(--bad)',
          soft: 'var(--bad-soft)',
          bd: 'var(--bad-bd)',
        },
        diffUp: {
          DEFAULT: 'var(--diff-up)',
          fg: 'var(--diff-up-fg)',
        },
        diffDown: {
          DEFAULT: 'var(--diff-down)',
          fg: 'var(--diff-down-fg)',
        },
      },
      boxShadow: {
        card: 'var(--shadow)',
      },
    },
  },
  plugins: [],
}
