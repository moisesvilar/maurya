import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Config de Vitest para los tests unitarios del pipeline (SPEC-NNN).
 * Independiente de electron.vite.config.ts: aquí solo se testea código de
 * renderer (jsdom) y módulos Node puros de main (con `@vitest-environment node`).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/renderer/src/**', 'src/main/wavFileService.ts']
    }
  }
})
