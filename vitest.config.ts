import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src/renderer/src') } },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node'
  }
})
