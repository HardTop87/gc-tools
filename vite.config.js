import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build-Infos für die Versionsanzeige in der TopBar: Version aus package.json,
// Commit von Vercel (Build-Env) bzw. lokal aus git. So ist im Header immer
// sichtbar, welcher Stand tatsächlich läuft — wichtig, seit ein veralteter
// Live-Stand schon einmal wie ein Datenfehler aussah (B10).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

function resolveCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
// Deploy-Ziel ist Vercel (Root-Domain) → Standard-Base '/'.
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(resolveCommit()),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
