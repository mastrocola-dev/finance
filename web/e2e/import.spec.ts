import { execSync } from 'node:child_process'
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

const reseed = () => execSync('npm run db:reset && npm run db:seed', { cwd: '..', stdio: 'ignore' })

const statement = { name: 'extrato-outubro.csv', mimeType: 'text/csv', buffer: Buffer.from('data,descricao,valor\n2026-10-03,Padaria do bairro,-18.50\n2026-10-05,Salario,4200.00\n') }

const viewports = [
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]

const history = (page: Page) => page.getByRole('region', { name: 'Histórico' }).getByRole('listitem').filter({ hasText: statement.name })

test.describe.configure({ mode: 'serial' })
test.beforeAll(reseed)
test.afterAll(reseed)

test('import uploads a file with consent, waits until it can be reviewed', async ({ browser }) => {
  const context = await browser.newContext({ viewport: viewports[1], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
  const page = await context.newPage()
  await page.goto('/importar')
  await expect(page.getByText('Nenhuma importação ainda')).toBeVisible()
  const form = page.getByRole('form', { name: 'Enviar arquivo' })
  await form.getByLabel('Arquivo', { exact: true }).setInputFiles(statement)
  await form.getByRole('checkbox').check()
  await form.getByRole('button', { name: 'Enviar para leitura' }).click()
  await expect(page.getByRole('status')).toContainText(`Arquivo enviado: ${statement.name}`)
  await expect(history(page).getByText('Para revisar')).toBeVisible({ timeout: 30_000 })
  await expect(history(page).getByText('US$ 0,0081')).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await context.close()
})

for (const theme of ['light', 'dark'] as const)
  for (const viewport of viewports)
    test(`import screenshot ${viewport.width} ${theme}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, colorScheme: theme, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
      await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
      const page = await context.newPage()
      await page.goto('/importar')
      await expect(history(page).getByText('Para revisar')).toBeVisible()
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: `screenshots/imports-${viewport.width}-${theme}.png`, fullPage: true })
      await context.close()
    })

test('import discards the reviewed batch', async ({ browser }) => {
  const context = await browser.newContext({ viewport: viewports[0], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
  const page = await context.newPage()
  await page.goto('/importar')
  await history(page)
    .getByRole('button', { name: `Descartar ${statement.name}` })
    .click()
  await history(page)
    .getByRole('button', { name: `Confirmar descarte de ${statement.name}` })
    .click()
  await expect(history(page).getByText('Descartado')).toBeVisible()
  await expect(history(page).getByText('Nada foi gravado')).toBeVisible()
  await context.close()
})
