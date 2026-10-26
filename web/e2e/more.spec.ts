import AxeBuilder from '@axe-core/playwright'
import { type Browser, expect, test } from '@playwright/test'
import { openContext } from './context.ts'

const openMenu = async (browser: Browser, theme: 'light' | 'dark') => {
  const context = await openContext(browser, { viewport: { width: 390, height: 844 }, colorScheme: theme })
  await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
  const page = await context.newPage()
  await page.goto('/decisoes')
  await expect(page.getByRole('heading', { level: 1, name: 'Decisões' })).toBeVisible()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Mais' }).click()
  await page.evaluate(() => document.fonts.ready)
  return { context, page }
}

for (const theme of ['light', 'dark'] as const)
  test(`more menu reaches every extra screen in two taps 390 ${theme}`, async ({ browser }) => {
    const { context, page } = await openMenu(browser, theme)
    const menu = page.getByRole('navigation', { name: 'Mais telas' })
    await expect(menu.getByRole('link')).toHaveText(['Lançamentos', 'Atividade', 'Importar'])
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target.join(' ')) }))).toEqual([])
    await page.screenshot({ path: `screenshots/more-390-${theme}.png` })
    await menu.getByRole('link', { name: 'Atividade' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Atividade' })).toBeVisible()
    await expect(menu).toHaveCount(0)
    await context.close()
  })

test('open menu renders the same pixels in every fresh context', async ({ browser }) => {
  const shots: string[] = []
  for (let run = 0; run < 4; run++) {
    const { context, page } = await openMenu(browser, 'light')
    shots.push((await page.screenshot()).toString('base64'))
    await context.close()
  }
  expect(new Set(shots).size).toBe(1)
})
