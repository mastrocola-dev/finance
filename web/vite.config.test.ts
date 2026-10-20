import { expect, test } from 'vitest'
import config, { apiTarget } from './vite.config.ts'

test('proxies /api to the local API on 3200', () => {
  expect(apiTarget).toBe(`http://127.0.0.1:${process.env.API_PORT ?? 3200}`)
  expect(config.server?.proxy).toEqual({ '/api': { target: apiTarget } })
  expect(config.preview?.proxy).toEqual({ '/api': { target: apiTarget } })
})
