import AxeBuilder from '@axe-core/playwright'
import { type Browser, expect, type Page, test } from '@playwright/test'
import { emptyLedger, memberContext, reseed } from './context.ts'
import { fullShot } from './shot.ts'

const open = async (browser: Browser, viewport = { width: 1440, height: 1000 }, colorScheme: 'light' | 'dark' = 'light') => {
  const context = await memberContext(browser, { viewport, colorScheme })
  const page = await context.newPage()
  await page.goto('/cadastros')
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  return { context, page }
}

const views = ['light', 'dark'].flatMap((theme) => [390, 1440].map((width) => ({ theme: theme as 'light' | 'dark', viewport: { width, height: width === 390 ? 844 : 1000 } })))

const capture = (state: string) =>
  views.map(({ theme, viewport }) =>
    test(`setup ${state} is captured ${viewport.width} ${theme}`, async ({ browser }) => {
      const { context, page } = await open(browser, viewport, theme)
      await expect(page.getByRole('region', { name: /Categorias/ })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await fullShot(page, `screenshots/setup-${state}-${viewport.width}-${theme}.png`)
      await context.close()
    }),
  )

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target.join(' ')) }))).toEqual([])
}

test.describe.configure({ mode: 'serial' })
test.beforeAll(emptyLedger)
test.afterAll(reseed)

test('an empty ledger shows every section empty and offers the suggested categories', async ({ browser }) => {
  const { context, page } = await open(browser)
  for (const name of ['Contas', 'Receitas fixas', 'Despesas fixas', 'Dívidas', 'Reservas', 'Metas']) await expect(page.getByRole('region', { name: new RegExp(`^${name}`) })).toContainText('Nada cadastrado.')
  await expect(page.getByRole('region', { name: /Categorias/ }).getByRole('button', { name: 'Criar categorias sugeridas' })).toBeVisible()
  await axe(page)
  await context.close()
})

capture('empty')

test('flow creates the suggested categories, then an account and a recurring expense from their sections', async ({ browser }) => {
  const { context, page } = await open(browser)
  const categories = page.getByRole('region', { name: /Categorias/ })
  await categories.getByRole('button', { name: 'Criar categorias sugeridas' }).click()
  await expect(page.getByRole('status')).toContainText('Criadas 12 categorias')
  await expect(categories.getByRole('heading')).toContainText('12')
  await expect(categories.getByRole('button', { name: 'Criar categorias sugeridas' })).toHaveCount(0)
  const accounts = page.getByRole('region', { name: /^Contas/ })
  await accounts.getByRole('button', { name: 'Novo cadastro em Contas' }).click()
  const account = accounts.getByRole('form', { name: 'Cadastrar conta' })
  await account.getByLabel('Apelido').fill('Conta da casa')
  await account.getByLabel('Instituição').fill('Banco Fictício')
  await account.getByLabel('Últimos 4 dígitos').fill('0042')
  await account.getByRole('button', { name: 'Cadastrar' }).click()
  await expect(page.getByRole('status')).toContainText('Cadastrado: Conta da casa')
  await account.getByRole('button', { name: 'Cancelar' }).click()
  await expect(accounts.getByRole('form')).toHaveCount(0)
  const fixed = page.getByRole('region', { name: /Despesas fixas/ })
  await fixed.getByRole('button', { name: 'Novo cadastro em Despesas fixas' }).click()
  const expense = fixed.getByRole('form', { name: 'Cadastrar despesa fixa' })
  await expense.getByLabel('Descrição').fill('Aluguel')
  await expense.getByLabel('Valor mensal').fill('2.400,00')
  await expense.getByLabel('Dia do mês').fill('5')
  await expense.getByLabel('Início').fill('2026-11-01')
  await expense.getByLabel('Categoria').fill('Moradia')
  await expense.getByLabel('Conta').fill('Conta da casa')
  await expense.getByRole('button', { name: 'Cadastrar' }).click()
  await expect(page.getByRole('status')).toContainText('Cadastrado: Aluguel')
  await expense.getByRole('button', { name: 'Cancelar' }).click()
  await expect(fixed).toContainText('R$ 2.400,00 por mês · dia 5 · Moradia · Conjunto')
  await page.goto('/atividade')
  await expect(page.getByRole('main')).toContainText('Moradia')
  await context.close()
})

capture('filled')
