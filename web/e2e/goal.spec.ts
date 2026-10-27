import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { type Browser, expect, test } from '@playwright/test'
import { openContext, reseed } from './context.ts'

const open = async (browser: Browser, viewport = { width: 1440, height: 1000 }, colorScheme: 'light' | 'dark' = 'light') => {
  const context = await openContext(browser, { viewport, colorScheme })
  await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
  const page = await context.newPage()
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
    test(`goal form passes axe and is captured ${viewport.width} ${theme}`, async ({ browser }) => {
      const { context, page } = await open(browser, viewport, theme)
      await page.goto('/patrimonio')
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
      await page.getByRole('button', { name: '+ Nova meta' }).click()
      const form = page.getByRole('form', { name: 'Nova meta' })
      await expect(form.getByLabel('Nome')).toBeFocused()
      await form.getByRole('button', { name: 'Criar meta' }).click()
      await expect(form.getByRole('alert')).toContainText('Informe o nome da meta.')
      const { violations } = await new AxeBuilder({ page }).include('form[aria-labelledby="goal-title"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target.join(' ')) }))).toEqual([])
      await form.scrollIntoViewIfNeeded()
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: `screenshots/net-worth-goal-${viewport.width}-${theme}.png`, style: 'nav.fixed { position: absolute !important }' })
      await context.close()
    })

test('goal flow creates a goal kept in a reserve and lists it', async ({ browser }) => {
  const { context, page } = await open(browser)
  await page.goto('/patrimonio')
  await page.getByRole('button', { name: '+ Nova meta' }).click()
  const form = page.getByRole('form', { name: 'Nova meta' })
  await form.getByLabel('Nome').fill('Notebook novo')
  await form.getByLabel('Alvo').fill('6.500,00')
  await form.getByLabel('Prazo (mês)').fill('2027-03')
  await form.getByRole('button', { name: 'Criar meta' }).click()
  await expect(page.getByRole('status')).toContainText('Meta criada: Notebook novo')
  await expect(page.getByRole('heading', { name: 'Notebook novo' })).toBeVisible()
  await page.getByRole('button', { name: '+ Nova meta' }).click()
  await form.getByLabel('Nome').fill('notebook novo')
  await form.getByLabel('Alvo').fill('100')
  await form.getByLabel('Prazo (mês)').fill('2027-03')
  await form.getByRole('button', { name: 'Criar meta' }).click()
  await expect(form.getByRole('alert')).toHaveText('Já existe uma meta chamada notebook novo.')
  await context.close()
})

test('entries export downloads the filtered month as CSV for Excel', async ({ browser }) => {
  const { context, page } = await open(browser)
  await page.goto('/lancamentos?month=2026-10')
  await page.getByRole('button', { name: 'Receitas' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar CSV' }).click()])
  expect(download.suggestedFilename()).toBe('lancamentos-2026-10.csv')
  const text = await readFile(await download.path(), 'utf8')
  const [header, ...rows] = text.slice(1).trimEnd().split('\r\n')
  expect(text.charCodeAt(0)).toBe(0xfeff)
  expect(header).toBe('Vencimento;Competência;Descrição;Categoria;Conta;Pessoa;Tipo;Valor;Situação;Pago em;Parcela;Origem')
  expect(rows.length).toBeGreaterThan(0)
  expect(rows.every((row) => row.split(';')[6] === 'Receita')).toBe(true)
  await context.close()
})
