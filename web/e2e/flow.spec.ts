import { execSync } from 'node:child_process'
import { type Browser, expect, test } from '@playwright/test'

const reseed = () => execSync('npm run db:reset && npm run db:seed', { cwd: '..', stdio: 'ignore' })

const open = async (browser: Browser, viewport = { width: 1440, height: 1000 }, colorScheme: 'light' | 'dark' = 'light') => {
  const context = await browser.newContext({ viewport, colorScheme, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
  const page = await context.newPage()
  await page.clock.setFixedTime(new Date('2026-10-18T12:00:00-03:00'))
  return { context, page }
}

test.describe.configure({ mode: 'serial' })
test.beforeAll(reseed)
test.afterAll(reseed)

for (const theme of ['light', 'dark'] as const)
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ])
    test(`flow marks a bill paid and undoes it ${viewport.width} ${theme}`, async ({ browser }) => {
      const { context, page } = await open(browser, viewport, theme)
      await page.goto('/contas?month=2026-10')
      const bill = page.getByRole('button', { name: /^Internet/ })
      await expect(bill).toHaveAttribute('aria-pressed', 'false')
      await bill.click()
      await expect(bill).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('status')).toContainText('Internet marcada como paga')
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: `screenshots/bills-toast-${viewport.width}-${theme}.png` })
      await page.getByRole('button', { name: 'Desfazer' }).click()
      await expect(bill).toHaveAttribute('aria-pressed', 'false')
      await expect(page.getByRole('status')).toContainText('Internet voltou para em aberto')
      await context.close()
    })

test('flow adds an entry to the month', async ({ browser }) => {
  const { context, page } = await open(browser)
  await page.goto('/lancamentos?month=2026-10')
  const form = page.getByRole('form', { name: 'Lançamento rápido' })
  await form.getByLabel('Descrição').fill('Bookstore')
  await form.getByLabel('Valor').fill('89,90')
  await form.getByLabel('Categoria').selectOption('Leisure')
  await form.getByRole('button', { name: 'Lançar' }).click()
  await expect(page.getByRole('status')).toContainText('Lançado: Bookstore')
  await expect(page.getByRole('table').getByRole('row', { name: /Bookstore/ })).toContainText('R$ 89,90')
  await context.close()
})

test('flow confirms a decision with both members', async ({ browser }) => {
  const { context, page } = await open(browser)
  await page.goto('/decisoes')
  const card = page.getByRole('article', { name: 'Upgrade home internet to 1 Gb' })
  await card.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByRole('status')).toContainText('Upgrade home internet to 1 Gb confirmada pelos dois')
  await expect(card).toHaveCount(0)
  await page.goto('/atividade')
  await expect(page.getByRole('main')).toContainText('Upgrade home internet to 1 Gb')
  await context.close()
})
