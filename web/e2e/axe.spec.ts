import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { openContext } from './context.ts'

const routes = [
  { name: 'overview', path: '/?month=2026-10', heading: 'Outubro de 2026' },
  { name: 'bills', path: '/contas?month=2026-10', heading: 'Outubro de 2026' },
  { name: 'entries', path: '/lancamentos?month=2026-10', heading: 'Outubro de 2026' },
  { name: 'net-worth', path: '/patrimonio', heading: 'Dívidas e reservas' },
  { name: 'decisions', path: '/decisoes', heading: 'Decisões' },
  { name: 'activity', path: '/atividade', heading: 'Atividade' },
  { name: 'imports', path: '/importar', heading: 'Importar' },
]

const viewports = [
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]

for (const theme of ['light', 'dark'] as const)
  for (const viewport of viewports)
    for (const route of routes)
      test(`axe ${route.name} ${viewport.width} ${theme}`, async ({ browser }) => {
        const context = await openContext(browser, { viewport, colorScheme: theme })
        await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
        const page = await context.newPage()
        await page.goto(route.path)
        await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
        expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target.join(' ')) }))).toEqual([])
        await context.close()
      })
