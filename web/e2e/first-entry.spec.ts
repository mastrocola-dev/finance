import AxeBuilder from '@axe-core/playwright'
import { type Browser, expect, test } from '@playwright/test'
import { emptyLedger, memberContext, reseed } from './context.ts'
import { fullShot } from './shot.ts'

const open = async (browser: Browser, viewport = { width: 1440, height: 1000 }, colorScheme: 'light' | 'dark' = 'light') => {
  const context = await memberContext(browser, { viewport, colorScheme })
  const page = await context.newPage()
  await page.goto('/lancamentos')
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  const form = page.getByRole('form', { name: 'Lançamento rápido' })
  await expect(form.getByRole('button', { name: 'Criar categorias sugeridas' })).toBeVisible()
  return { context, page, form }
}

const views = ['light', 'dark'].flatMap((theme) => [390, 1440].map((width) => ({ theme: theme as 'light' | 'dark', viewport: { width, height: width === 390 ? 844 : 1000 } })))

test.describe.configure({ mode: 'serial' })
test.beforeAll(emptyLedger)
test.afterAll(reseed)

for (const { theme, viewport } of views)
  test(`entry form on an empty ledger is captured ${viewport.width} ${theme}`, async ({ browser }) => {
    const { context, page, form } = await open(browser, viewport, theme)
    await form.getByLabel('Categoria').fill('Pets')
    await expect(form.getByRole('button', { name: 'Criar categoria Pets' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await fullShot(page, `screenshots/entries-empty-${viewport.width}-${theme}.png`)
    await context.close()
  })

test('a first entry goes from an empty ledger to the list without leaving the form', async ({ browser }) => {
  const { context, page, form } = await open(browser)
  const { violations } = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(violations.map(({ id }) => id)).toEqual([])
  await form.getByLabel('Descrição').fill('Ração')
  await form.getByLabel('Valor').fill('120,00')
  await form.getByLabel('Categoria').fill('Pets')
  await form.getByRole('button', { name: 'Lançar' }).click()
  await expect(form.getByRole('alert')).toHaveText('Crie a categoria Pets ou escolha uma da lista.')
  await form.getByRole('button', { name: 'Criar categoria Pets' }).click()
  await expect(page.getByRole('status')).toContainText('Categoria criada: Pets')
  await expect(form.getByLabel('Categoria')).toHaveValue('Pets')
  await expect(form.getByRole('button', { name: 'Criar categorias sugeridas' })).toHaveCount(0)
  await form.getByRole('button', { name: 'Lançar' }).click()
  await expect(page.getByRole('status')).toContainText('Lançado: Ração')
  await expect(page.getByRole('region', { name: 'Lista de lançamentos' })).toContainText('Ração')
  await expect(page).toHaveURL(/\/lancamentos/)
  await context.close()
})
