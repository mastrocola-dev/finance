import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export const apiTarget = `http://127.0.0.1:${process.env.API_PORT ?? 3200}`

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: { '@': join(dirname(fileURLToPath(import.meta.url)), 'src') },
  },
  server: {
    proxy: {
      '/api': { target: apiTarget },
    },
  },
  preview: {
    proxy: {
      '/api': { target: apiTarget },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'vite.config.test.ts'],
  },
})
