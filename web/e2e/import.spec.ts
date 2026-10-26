import { execSync } from 'node:child_process'
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { openContext } from './context.ts'
import { fullShot } from './shot.ts'

const reseed = () => execSync('npm run db:reset && npm run db:seed', { cwd: '..', stdio: 'ignore' })

const statement = { name: 'extrato-outubro.csv', mimeType: 'text/csv', buffer: Buffer.from('data,descricao,valor\n2026-10-03,Padaria do bairro,-18.50\n2026-10-05,Salario,4200.00\n') }

const viewports = [
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]

const history = (page: Page) => page.getByRole('region', { name: 'Histórico' }).getByRole('listitem').filter({ hasText: statement.name })

const pharmacy = (page: Page) => page.locator('[id^="candidate-title-"]').filter({ hasText: /^Farmácia$/ })

test.describe.configure({ mode: 'serial' })
test.beforeAll(reseed)
test.afterAll(reseed)

test('import uploads a file with consent, waits until it can be reviewed', async ({ browser }) => {
  const context = await openContext(browser, { viewport: viewports[1] })
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
      const context = await openContext(browser, { viewport, colorScheme: theme })
      await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
      const page = await context.newPage()
      await page.goto('/importar')
      await expect(history(page).getByText('Para revisar')).toBeVisible()
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
      await page.evaluate(() => document.fonts.ready)
      await fullShot(page, `screenshots/imports-${viewport.width}-${theme}.png`)
      await context.close()
    })

for (const theme of ['light', 'dark'] as const)
  for (const viewport of viewports)
    test(`import review screenshot ${viewport.width} ${theme}`, async ({ browser }) => {
      const context = await openContext(browser, { viewport, colorScheme: theme })
      await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
      const page = await context.newPage()
      await page.goto('/importar')
      await history(page)
        .getByRole('link', { name: `Revisar ${statement.name}` })
        .click()
      await expect(page.getByRole('region', { name: 'Precisa de vocês' })).toBeVisible()
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
      await page.evaluate(() => document.fonts.ready)
      await fullShot(page, `screenshots/imports-review-${viewport.width}-${theme}.png`)
      await page.getByRole('button', { name: 'Editar Farmácia' }).click()
      const form = page.getByRole('form', { name: 'Editar Farmácia' })
      await form.getByLabel('Valor', { exact: true }).fill('')
      await form.getByRole('button', { name: 'Salvar' }).click()
      await expect(form.getByText('Preencha este campo.')).toBeVisible()
      await form.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `screenshots/imports-review-edit-${viewport.width}-${theme}.png` })
      await context.close()
    })

test('import review reads the low-confidence chunk again before anything is reviewed', async ({ browser }) => {
  const context = await openContext(browser, { viewport: viewports[1] })
  await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
  const page = await context.newPage()
  await page.goto('/importar')
  await expect(history(page).getByText('1 trecho pode ser lido de novo: falhou ou tem baixa confiança.')).toBeVisible()
  await history(page)
    .getByRole('link', { name: `Revisar ${statement.name}` })
    .click()
  const retry = page.getByRole('region', { name: 'Ler de novo' })
  await expect(retry.getByText('1 trecho pode ser lido de novo: falhou ou tem baixa confiança.')).toBeVisible()
  const before = await pharmacy(page).getAttribute('id')
  await retry.getByRole('button', { name: 'Ler de novo' }).click()
  await expect(page.getByRole('status')).toContainText(`Lendo de novo: ${statement.name}`)
  await expect(page.getByRole('region', { name: 'Precisa de vocês' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await expect.poll(() => pharmacy(page).getAttribute('id')).not.toBe(before)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await context.close()
})

test('import review answers, accepts and rejects candidates', async ({ browser }) => {
  const context = await openContext(browser, { viewport: viewports[1] })
  await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
  const page = await context.newPage()
  await page.goto('/importar')
  await history(page)
    .getByRole('link', { name: `Revisar ${statement.name}` })
    .click()
  await expect(page.getByRole('heading', { name: statement.name })).toBeVisible()
  const attention = page.getByRole('region', { name: 'Precisa de vocês' })
  await expect(attention.getByText('GMA é a Gabriela?', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Aceitar Farmácia' })).toBeDisabled()
  await attention.getByLabel('Outra resposta para GMA é a Gabriela?').fill('Gabriela')
  await attention.getByLabel('Outra resposta para GMA é a Gabriela?').press('Enter')
  await expect(page.getByRole('status')).toContainText('Resposta registrada: Gabriela')
  await expect(page.getByRole('button', { name: 'Aceitar Farmácia' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Aceitar Reserva de emergência' })).toBeDisabled()
  await page.getByRole('button', { name: 'Editar Reserva de emergência' }).click()
  const form = page.getByRole('form', { name: 'Editar Reserva de emergência' })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await form.getByLabel('Nome').fill('Reserva da casa')
  await form.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('status')).toContainText('Editado: Reserva da casa')
  await expect(page.getByText('Reserva da casa').locator('xpath=ancestor::li[1]').getByText('Editado', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Rejeitar Viagem' }).click()
  await expect(page.getByRole('status')).toContainText('Rejeitado: Viagem')
  await page.getByRole('button', { name: 'Aceitar Aluguel' }).click()
  await expect(page.getByRole('status')).toContainText('Aceito: Aluguel')
  await page.getByRole('button', { name: 'Editar Farmácia' }).click()
  await page.getByRole('form', { name: 'Editar Farmácia' }).getByLabel('Categoria', { exact: true }).fill('Pets')
  await page.getByRole('form', { name: 'Editar Farmácia' }).getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('status')).toContainText('Editado: Farmácia')
  const commit = page.getByRole('region', { name: 'Gravar no livro' })
  await expect(commit.getByRole('list', { name: 'Nomes não aceitos' }).getByRole('listitem')).toHaveText(['Farmácia · Categoria Pets está num item pendente'])
  await expect(commit.getByRole('button', { name: 'Gravar 3 itens' })).toBeDisabled()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await context.close()
})

const shoot = (name: string, prepare: (page: Page) => Promise<void>) => {
  for (const theme of ['light', 'dark'] as const)
    for (const viewport of viewports)
      test(`${name} screenshot ${viewport.width} ${theme}`, async ({ browser }) => {
        const context = await openContext(browser, { viewport, colorScheme: theme })
        await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
        const page = await context.newPage()
        await prepare(page)
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: `screenshots/${name}-${viewport.width}-${theme}.png` })
        await context.close()
      })
}

const unavailable = async (page: Page) => {
  await page.route('**/api/imports/runtime', (route) => route.fulfill({ json: { ready: false, cause: 'failed', warming: false } }))
  await page.goto('/importar')
  await expect(page.getByRole('form', { name: 'Enviar arquivo' }).getByRole('status')).toContainText('Leitura indisponível')
}

shoot('imports-unavailable', unavailable)

test('import form says why it cannot read files and stays accessible', async ({ browser }) => {
  const context = await openContext(browser, { viewport: viewports[0] })
  await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
  const page = await context.newPage()
  await unavailable(page)
  await expect(page.getByRole('button', { name: 'Enviar para leitura' })).toBeDisabled()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await context.close()
})

const batchId = async (page: Page) => {
  const batches: { id: string; fileName: string }[] = await (await page.request.get('/api/imports', { headers: { 'x-member': 'Marcio' } })).json()
  return batches.find((batch) => batch.fileName === statement.name)?.id
}

const review = async (page: Page) => {
  await page.goto('/importar')
  await history(page)
    .getByRole('link', { name: `Revisar ${statement.name}` })
    .click()
  await expect(page.getByRole('heading', { name: statement.name })).toBeVisible()
}

shoot('imports-unstaged', async (page) => {
  await review(page)
  const commit = page.getByRole('region', { name: 'Gravar no livro' })
  await expect(commit.getByRole('list', { name: 'Nomes não aceitos' })).toBeVisible()
  await commit.scrollIntoViewIfNeeded()
})

test('import commit waits until the item that creates the name is accepted', async ({ browser }) => {
  const context = await openContext(browser, { viewport: viewports[1] })
  await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
  const page = await context.newPage()
  await review(page)
  const accept = page.getByRole('button', { name: 'Aceitar Pets' })
  await expect(accept).not.toBeInViewport()
  await page.getByRole('region', { name: 'Gravar no livro' }).getByRole('link', { name: 'Categoria Pets está num item pendente' }).click()
  await expect(page).toHaveURL(/#candidate-\d+$/)
  await expect(accept).toBeInViewport()
  await expect(accept.locator('xpath=ancestor::li[1]')).toHaveAttribute('aria-current', 'true')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await accept.click()
  await expect(page.getByRole('status')).toContainText('Aceito: Pets')
  const commit = page.getByRole('region', { name: 'Gravar no livro' })
  await expect(commit.getByRole('list', { name: 'Nomes não aceitos' })).toHaveCount(0)
  await expect(commit.getByRole('button', { name: 'Gravar 4 itens' })).toBeEnabled()
  await context.close()
})

shoot('imports-commit', async (page) => {
  await review(page)
  const commit = page.getByRole('region', { name: 'Gravar no livro' })
  await expect(commit.getByRole('button', { name: 'Gravar 4 itens' })).toBeEnabled()
  await commit.scrollIntoViewIfNeeded()
})

test('import commit writes the accepted items, which reach the entries and the activity', async ({ browser }) => {
  const context = await openContext(browser, { viewport: viewports[1] })
  await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
  const page = await context.newPage()
  await review(page)
  const commit = page.getByRole('region', { name: 'Gravar no livro' })
  await expect(commit.getByText('4 itens aceitos vão para o livro.', { exact: false })).toBeVisible()
  await commit.getByRole('button', { name: 'Gravar 4 itens' }).click()
  await commit.getByRole('button', { name: 'Confirmar gravação' }).click()
  await expect(page.getByRole('status')).toContainText('Gravado no livro: 4 itens')
  const done = page.getByRole('region', { name: 'Gravada no livro' })
  await expect(done.getByText(/^4 itens gravados\./)).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await done.getByRole('link', { name: 'Ver lançamentos' }).click()
  await expect(page.getByRole('table').getByRole('row').filter({ hasText: 'Aluguel' }).filter({ hasText: 'Importado' })).toHaveCount(1)
  await page.goto('/atividade')
  await expect(page.getByText('Reserva da casa').first()).toBeVisible()
  await expect(page.getByText('Pets').first()).toBeVisible()
  await context.close()
})

shoot('imports-committed', async (page) => {
  await page.goto(`/importar/${await batchId(page)}`)
  await expect(page.getByRole('region', { name: 'Gravada no livro' })).toBeVisible()
})

test('import closes the committed batch from the review', async ({ browser }) => {
  const context = await openContext(browser, { viewport: viewports[0] })
  await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
  const page = await context.newPage()
  await page.goto('/importar')
  await expect(history(page).getByText('Gravado', { exact: true })).toBeVisible()
  await page.goto(`/importar/${await batchId(page)}`)
  const done = page.getByRole('region', { name: 'Gravada no livro' })
  await done.getByRole('button', { name: 'Encerrar' }).click()
  await done.getByRole('button', { name: 'Confirmar encerramento' }).click()
  await expect(page.getByRole('status')).toContainText(`Importação encerrada: ${statement.name}`)
  await expect(page.getByText('Esta importação foi encerrada.')).toBeVisible()
  await page.goto('/importar')
  await expect(history(page).getByText('Encerrado')).toBeVisible()
  await expect(history(page).getByText('4 itens gravados')).toBeVisible()
  await context.close()
})

const second = { name: 'extrato-novembro.csv', mimeType: 'text/csv', buffer: Buffer.from('data,descricao,valor\n2026-11-03,Padaria do bairro,-21.00\n') }

test('import discards a batch that was never reviewed', async ({ browser }) => {
  const context = await openContext(browser, { viewport: viewports[0] })
  await context.addInitScript(() => localStorage.setItem('finance.member', 'Marcio'))
  const page = await context.newPage()
  await page.goto('/importar')
  const form = page.getByRole('form', { name: 'Enviar arquivo' })
  await form.getByLabel('Arquivo', { exact: true }).setInputFiles(second)
  await form.getByRole('checkbox').check()
  await form.getByRole('button', { name: 'Enviar para leitura' }).click()
  const item = page.getByRole('region', { name: 'Histórico' }).getByRole('listitem').filter({ hasText: second.name })
  await expect(item.getByText('Para revisar')).toBeVisible({ timeout: 30_000 })
  await item.getByRole('button', { name: `Descartar ${second.name}` }).click()
  await item.getByRole('button', { name: `Confirmar descarte de ${second.name}` }).click()
  await expect(item.getByText('Descartado')).toBeVisible()
  await expect(item.getByText('Nada foi gravado')).toBeVisible()
  await context.close()
})
