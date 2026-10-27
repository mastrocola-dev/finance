import { expect, test } from '@playwright/test'
import { entraMode, memberContext, openContext } from './context.ts'
import { fullShot } from './shot.ts'

const routes = [
  { name: 'overview', path: '/?month=2026-10', heading: 'Outubro de 2026' },
  { name: 'bills', path: '/contas?month=2026-10', heading: 'Outubro de 2026' },
  { name: 'entries', path: '/lancamentos?month=2026-10', heading: 'Outubro de 2026' },
  { name: 'net-worth', path: '/patrimonio', heading: 'Dívidas e reservas' },
  { name: 'decisions', path: '/decisoes', heading: 'Decisões' },
  { name: 'activity', path: '/atividade', heading: 'Atividade' },
  { name: 'setup', path: '/cadastros', heading: 'Cadastros' },
  { name: 'activity-guest', path: '/atividade', heading: 'Atividade', member: '' },
]

const viewports = [
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]

for (const theme of ['light', 'dark'] as const)
  for (const viewport of viewports)
    for (const route of routes)
      test(`${route.name} ${viewport.width} ${theme}`, { tag: route.member === '' ? '@local' : [] }, async ({ browser }) => {
        const options = { viewport, colorScheme: theme }
        const context = route.member === '' ? await openContext(browser, options) : await memberContext(browser, options)
        const page = await context.newPage()
        await page.goto(route.path)
        await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
        if (!entraMode()) await expect(page.getByLabel('Você é').locator('visible=true')).toHaveValue(route.member ?? 'Marcio')
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
        await page.evaluate(() => document.fonts.ready)
        await fullShot(page, `screenshots/${route.name}-${viewport.width}-${theme}.png`)
        await context.close()
      })
