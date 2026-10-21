import { expect, test } from '@playwright/test'

test('pwa serves the month overview offline from the cache', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
  const page = await context.newPage()
  await page.goto('/?month=2026-10')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Outubro de 2026' })).toBeVisible()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  const online = await page.locator('main').innerText()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Outubro de 2026' })).toBeVisible()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  expect(await page.locator('main').innerText()).toBe(online)
  await context.close()
})
