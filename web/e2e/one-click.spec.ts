import AxeBuilder from '@axe-core/playwright'
import { type Browser, expect, type Page, test } from '@playwright/test'
import { emptyLedger, memberContext, memberHeaders, reseed } from './context.ts'
import { fullShot } from './shot.ts'

const workbook = { name: 'planilha-mensal.csv', mimeType: 'text/csv', buffer: Buffer.from('data,descricao,valor\n2026-10-10,Aluguel,-1500.00\n2026-10-20,Internet,-120.00\n') }

const views = ['light', 'dark'].flatMap((theme) => [390, 1440].map((width) => ({ theme: theme as 'light' | 'dark', viewport: { width, height: width === 390 ? 844 : 1000 } })))

const open = (browser: Browser, viewport = { width: 1440, height: 1000 }, colorScheme: 'light' | 'dark' = 'light') => memberContext(browser, { viewport, colorScheme })

const batchPath = async (page: Page) => {
  const batches: { id: string; fileName: string }[] = await (await page.request.get('/api/imports', { headers: memberHeaders() })).json()
  return `/importar/${batches.find((batch) => batch.fileName === workbook.name)?.id}`
}

const merged = (page: Page) => page.getByRole('region', { name: 'Resumo' }).getByRole('list', { name: 'Categorias juntadas' }).getByRole('listitem')

const capture = (state: string, ready: (page: Page) => Promise<void>) =>
  views.map(({ theme, viewport }) =>
    test(`one-click ${state} is captured ${viewport.width} ${theme}`, async ({ browser }) => {
      const context = await open(browser, viewport, theme)
      const page = await context.newPage()
      await page.goto(await batchPath(page))
      await ready(page)
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
      await page.evaluate(() => document.fonts.ready)
      await fullShot(page, `screenshots/imports-one-click-${state}-${viewport.width}-${theme}.png`)
      await context.close()
    }),
  )

test.describe.configure({ mode: 'serial' })
test.beforeAll(emptyLedger)
test.afterAll(reseed)

test('one-click import reads a file on an empty ledger and merges similar categories', async ({ browser }) => {
  const context = await open(browser)
  const page = await context.newPage()
  await page.goto('/importar')
  await expect(page.getByText('Nenhuma importação ainda')).toBeVisible()
  const form = page.getByRole('form', { name: 'Enviar arquivo' })
  await form.getByLabel('Arquivo', { exact: true }).setInputFiles(workbook)
  await form.getByRole('checkbox').check()
  await form.getByRole('button', { name: 'Enviar para leitura' }).click()
  const item = page.getByRole('region', { name: 'Histórico' }).getByRole('listitem').filter({ hasText: workbook.name })
  await expect(item.getByText('Para revisar')).toBeVisible({ timeout: 30_000 })
  await item.getByRole('link', { name: `Revisar ${workbook.name}` }).click()
  await expect(page.getByRole('heading', { name: workbook.name })).toBeVisible()
  await expect(merged(page)).toHaveText([/^Contas da casaparaMoradia1 item$/])
  await expect(page.getByRole('region', { name: 'Precisa de vocês' })).toHaveCount(0)
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await context.close()
})

capture('review', async (page) => {
  await expect(merged(page)).toHaveCount(1)
})

test('one-click import writes the batch in one click with the merged category', async ({ browser }) => {
  const context = await open(browser)
  const page = await context.newPage()
  await page.goto(await batchPath(page))
  const commit = page.getByRole('region', { name: 'Gravar no livro' })
  await expect(commit.getByText('8 itens aceitos vão para o livro.', { exact: false })).toBeVisible()
  await commit.getByRole('button', { name: 'Importar 8 itens' }).click()
  await expect(page.getByRole('status')).toContainText('Gravado no livro: 8 itens')
  await expect(page.getByRole('region', { name: 'Gravada no livro' }).getByText(/^8 itens gravados\./)).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.goto('/cadastros')
  await expect(page.getByRole('region', { name: /Despesas fixas/ })).toContainText('Internet')
  await expect(page.getByRole('region', { name: /Despesas fixas/ })).toContainText('Moradia')
  await expect(page.getByRole('region', { name: /Categorias/ })).not.toContainText('Contas da casa')
  await context.close()
})

capture('committed', async (page) => {
  await expect(page.getByRole('region', { name: 'Gravada no livro' })).toBeVisible()
})
