import { expect, test } from '@playwright/test'
import { openContext } from './context.ts'

const screens = [
  { path: '/lancamentos', heading: /de 20\d\d$/ },
  { path: '/decisoes', heading: 'Decisões' },
  { path: '/patrimonio', heading: 'Dívidas e reservas' },
]

for (const theme of ['light', 'dark'] as const)
  for (const screen of screens)
    test(`record link lands on the record in ${screen.path} 1440 ${theme}`, async ({ browser }) => {
      const context = await openContext(browser, { viewport: { width: 1440, height: 700 }, colorScheme: theme })
      await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
      const page = await context.newPage()
      await page.goto('/atividade')
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
      const links = page.getByRole('link', { name: 'Ver registro' }).and(page.locator(`[href^="${screen.path}"]`))
      while ((await links.count()) === 0) await page.getByRole('button', { name: 'Carregar mais' }).click()
      const href = (await links.first().getAttribute('href')) ?? ''
      await links.first().click()
      await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible()
      const record = page.locator(`[data-record="${href.split('#')[1]}"]`).locator('visible=true')
      await expect(record).toHaveAttribute('aria-current', 'true')
      await expect(record).toBeInViewport()
      if (screen.path === '/lancamentos') {
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: `screenshots/record-1440-${theme}.png` })
      }
      await context.close()
    })
