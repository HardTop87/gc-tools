import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Base-Pfad ist ziel-abhängig:
//  - Vercel (Root-Domain) und lokal: '/'  → Default
//  - GitHub Pages (/gc-tools/): der Deploy-Task setzt VITE_BASE=/gc-tools/
// So kann ein Vercel-Build auf main nie den Unterpfad einbacken.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
})
