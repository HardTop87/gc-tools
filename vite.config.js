import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Deploy-Ziel ist Vercel (Root-Domain) → Standard-Base '/'.
export default defineConfig({
  plugins: [react()],
})
