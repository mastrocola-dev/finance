import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { actAs, entraMode, memberState } from './context.ts'

const kB = 1000

const budgets = [
  { width: 390, height: 844, script: 150 * kB, chart: false },
  { width: 1440, height: 1000, script: 240 * kB, chart: true },
]

const timing = { fcp: 1800, lcp: 2500 }
const fonts = 60 * kB
const precache = 1100 * 1024
const msal = { script: 60 * kB, precache: 300 * 1024 }

type Load = { fcp: number; lcp: number; resources: { name: string; type: string; bytes: number }[] }

const sum = (items: { bytes: number }[]) => items.reduce((total, { bytes }) => total + bytes, 0)

for (const budget of budgets)
  test(`budget overview first load at ${budget.width}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: budget, serviceWorkers: 'block', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', ...(await memberState(browser, 'Marcio', false)) })
    await actAs(context)
    const page = await context.newPage()
    await page.goto('/?month=2026-10')
    await expect(page.getByRole('heading', { level: 1, name: 'Outubro de 2026' })).toBeVisible()
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
    await page.evaluate(() => document.fonts.ready)
    if (budget.chart) await page.waitForFunction(() => performance.getEntriesByType('resource').some(({ name }) => name.includes('/flow-bars-')))
    const load: Load = await page.evaluate(
      () =>
        new Promise((resolve) =>
          new PerformanceObserver((list) => {
            const lcp = list.getEntries().at(-1)?.startTime ?? 0
            const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0
            const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map(({ name, encodedBodySize }) => ({
              name: new URL(name).pathname,
              type: name.split('.').at(-1) ?? '',
              bytes: encodedBodySize,
            }))
            resolve({ fcp, lcp, resources })
          }).observe({ type: 'largest-contentful-paint', buffered: true }),
        ),
    )
    const assets = load.resources.filter(({ name }) => name.startsWith('/assets/'))
    const script = sum(assets.filter(({ type }) => type === 'js'))
    const font = sum(assets.filter(({ type }) => type === 'woff2'))
    test.info().annotations.push({ type: 'budget', description: JSON.stringify({ width: budget.width, fcp: Math.round(load.fcp), lcp: Math.round(load.lcp), script, font }) })
    expect(load.fcp).toBeLessThan(timing.fcp)
    expect(load.lcp).toBeLessThan(timing.lcp)
    expect(script).toBeLessThan(entraMode() ? budget.script + msal.script : budget.script)
    expect(font).toBeLessThan(fonts)
    expect(assets.some(({ name }) => name.includes('/flow-bars-'))).toBe(budget.chart)
    await context.close()
  })

test('budget service worker precache', async () => {
  const dist = entraMode() ? 'dist-entra' : 'dist'
  const worker = await readFile(join(dist, 'sw.js'), 'utf8')
  const urls = [...worker.matchAll(/url:"([^"]+)"/g)].map(([, url]) => url ?? '')
  const sizes = await Promise.all(urls.map(async (url) => (await stat(join(dist, url))).size))
  const total = sizes.reduce((sum, size) => sum + size, 0)
  test.info().annotations.push({ type: 'budget', description: JSON.stringify({ entries: urls.length, total }) })
  expect(urls.filter((url) => url.endsWith('.woff2')).every((url) => url.includes('-latin-wght-normal-'))).toBe(true)
  expect(total).toBeLessThan(entraMode() ? precache + msal.precache : precache)
})
