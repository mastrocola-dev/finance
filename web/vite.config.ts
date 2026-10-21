import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA, type VitePWAOptions } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export const apiTarget = `http://127.0.0.1:${process.env.API_PORT ?? 3200}`

export const isApiRead = ({ url, request }: { url: URL; request: Request }) => request.method === 'GET' && url.pathname.startsWith('/api/')

export const pwa: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  includeAssets: ['icon.svg', 'apple-touch-icon.png'],
  manifest: {
    name: 'Caixa',
    short_name: 'Caixa',
    description: 'Finanças da casa',
    lang: 'pt-BR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#f6f6f3',
    background_color: '#f6f6f3',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [
      {
        urlPattern: isApiRead,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api',
          networkTimeoutSeconds: 4,
          cacheableResponse: { statuses: [200] },
          expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
        },
      },
    ],
  },
}

export default defineConfig({
  plugins: [tailwindcss(), VitePWA(pwa)],
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
