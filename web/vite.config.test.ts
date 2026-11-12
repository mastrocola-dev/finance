import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { publicDir } from './scripts/icons.ts'
import config, { apiTarget, isApiRead, pwa } from './vite.config.ts'

test('proxies /api and /auth to the local API on 3200 and never answers them from the app shell', () => {
  expect(apiTarget).toBe(`http://127.0.0.1:${process.env.API_PORT ?? 3200}`)
  expect(config.server?.proxy).toEqual({ '/api': { target: apiTarget }, '/auth': { target: apiTarget } })
  expect(config.preview?.proxy).toEqual({ '/api': { target: apiTarget }, '/auth': { target: apiTarget } })
  const denied = pwa.workbox?.navigateFallbackDenylist ?? []
  expect(['/api/me', '/auth/login', '/auth/callback'].every((path) => denied.some((pattern) => pattern.test(path)))).toBe(true)
  expect(denied.some((pattern) => pattern.test('/decisoes'))).toBe(false)
})

test('caches API reads only', () => {
  const read = (path: string, method = 'GET') => isApiRead({ url: new URL(path, 'http://127.0.0.1:4173'), request: new Request(`http://127.0.0.1:4173${path}`, { method }) })
  expect(read('/api/months/2026-10/entries')).toBe(true)
  expect(read('/api/entries', 'POST')).toBe(false)
  expect(read('/assets/index.js')).toBe(false)
  expect(read('/apis')).toBe(false)
})

test('declares an installable manifest whose icons exist at their sizes', async () => {
  const manifest = pwa.manifest
  expect(manifest).toMatchObject({ name: 'Caixa', lang: 'pt-BR', start_url: '/', display: 'standalone' })
  const icons = manifest ? (manifest.icons ?? []) : []
  expect(icons.map((icon) => icon.purpose ?? 'any')).toEqual(['any', 'any', 'maskable'])
  for (const icon of icons) {
    const png = await readFile(join(publicDir, icon.src))
    const size = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`
    expect(size).toBe(icon.sizes)
  }
})
