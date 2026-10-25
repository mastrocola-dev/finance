import { expect, test } from '@playwright/test'
import { fullShot } from './shot.ts'

const routes = [
  { name: 'overview', path: '/?month=2026-10', heading: 'Outubro de 2026' },
  { name: 'bills', path: '/contas?month=2026-10', heading: 'Outubro de 2026' },
  { name: 'entries', path: '/lancamentos?month=2026-10', heading: 'Outubro de 2026' },
  { name: 'net-worth', path: '/patrimonio', heading: 'Dívidas e reservas' },
  { name: 'decisions', path: '/decisoes', heading: 'Decisões' },
  { name: 'activity', path: '/atividade', heading: 'Atividade' },
]

const viewports = [
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]

for (const theme of ['light', 'dark'] as const)
  for (const viewport of viewports)
    for (const route of routes)
      test(`${route.name} ${viewport.width} ${theme}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport, colorScheme: theme, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
        await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
        const page = await context.newPage()
        await page.goto(route.path)
        await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
        await expect(page.getByLabel('Você é').locator('visible=true')).toHaveValue('Marcio')
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
        await page.evaluate(() => document.fonts.ready)
        await fullShot(page, `screenshots/${route.name}-${viewport.width}-${theme}.png`)
        await context.close()
      })
