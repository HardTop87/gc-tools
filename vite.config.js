import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages liefert die App unter /gc-tools/ aus; lokal (dev) unter /
  base: command === 'build' ? '/gc-tools/' : '/',
  plugins: [react()],
}))
