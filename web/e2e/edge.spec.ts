import { expect, test } from '@playwright/test'
import { openContext } from './context.ts'
import { pinTabBar } from './shot.ts'

const routes = [
  { path: '/?month=2026-10', heading: 'Outubro de 2026' },
  { path: '/contas?month=2026-10', heading: 'Outubro de 2026' },
  { path: '/lancamentos?month=2026-10', heading: 'Outubro de 2026' },
  { path: '/patrimonio', heading: 'Dívidas e reservas' },
  { path: '/decisoes', heading: 'Decisões' },
  { path: '/atividade', heading: 'Atividade' },
  { path: '/importar', heading: 'Importar' },
]

const gutter = 16

for (const width of [320, 390, 1440])
  test(`no horizontal overflow and a ${gutter} px gutter at ${width}`, async ({ browser }) => {
    const context = await openContext(browser, { viewport: { width, height: 844 } })
    await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
    const page = await context.newPage()
    for (const route of routes) {
      await page.goto(route.path)
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
      await page.evaluate(() => document.fonts.ready)
      const scroll = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, view: window.innerWidth }))
      expect(scroll.page, route.path).toBeLessThanOrEqual(scroll.view)
      if (width >= 768) continue
      const bar = await page.getByRole('banner').boundingBox()
      const more = await page.getByRole('button', { name: 'Mais', exact: true }).boundingBox()
      expect(bar && more, route.path).toBeTruthy()
      if (!bar || !more) continue
      expect(bar.width, route.path).toBeLessThanOrEqual(width)
      expect(more.x + more.width, route.path).toBeLessThanOrEqual(width - gutter)
      expect(more.width, route.path).toBeGreaterThanOrEqual(44)
    }
    if (width < 768) {
      await page.getByRole('button', { name: 'Mais', exact: true }).click()
      const menu = await page.getByRole('navigation', { name: 'Mais telas' }).locator('..').boundingBox()
      expect(menu).toBeTruthy()
      if (menu) {
        expect(menu.x).toBeGreaterThanOrEqual(gutter)
        expect(menu.x + menu.width).toBeLessThanOrEqual(width - gutter)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    }
    await context.close()
  })

test('full-page phone shots pin the tab bar to the end of the page', async ({ browser }) => {
  const context = await openContext(browser, { viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
  const page = await context.newPage()
  await page.goto('/lancamentos?month=2026-10')
  await expect(page.getByRole('heading', { level: 1, name: 'Outubro de 2026' })).toBeVisible()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await page.addStyleTag({ content: pinTabBar })
  const layout = await page.evaluate(() => {
    const tabs = document.querySelector('nav.fixed')?.getBoundingClientRect().toJSON()
    const content = document.querySelector('main')?.lastElementChild?.getBoundingClientRect().toJSON()
    return { tabs, content, page: document.documentElement.scrollHeight, view: window.innerHeight }
  })
  expect(layout.page).toBeGreaterThan(layout.view)
  expect(layout.tabs && layout.content).toBeTruthy()
  if (!layout.tabs || !layout.content) return
  expect(Math.round(layout.tabs.bottom)).toBe(layout.page)
  expect(layout.tabs.top).toBeGreaterThanOrEqual(layout.content.bottom)
  await context.close()
})
