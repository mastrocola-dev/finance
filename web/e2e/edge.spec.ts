import { expect, test } from '@playwright/test'

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
    const context = await browser.newContext({ viewport: { width, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
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
