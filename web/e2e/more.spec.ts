import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const theme of ['light', 'dark'] as const)
  test(`more menu reaches every extra screen in two taps 390 ${theme}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: theme, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
    await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
    const page = await context.newPage()
    await page.goto('/decisoes')
    await expect(page.getByRole('heading', { level: 1, name: 'Decisões' })).toBeVisible()
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Mais' }).click()
    const menu = page.getByRole('navigation', { name: 'Mais telas' })
    await expect(menu.getByRole('link')).toHaveText(['Lançamentos', 'Atividade'])
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target.join(' ')) }))).toEqual([])
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `screenshots/more-390-${theme}.png` })
    await menu.getByRole('link', { name: 'Atividade' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Atividade' })).toBeVisible()
    await expect(menu).toHaveCount(0)
    await context.close()
  })
