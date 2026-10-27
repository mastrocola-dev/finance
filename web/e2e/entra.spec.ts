import { expect, test } from '@playwright/test'
import { screens } from '../src/shell/nav.ts'
import { entraPreview, linkMembers, openContext, reseed, signIn } from './context.ts'

const base = `http://127.0.0.1:${entraPreview.port}`

test.describe.configure({ mode: 'serial' })
test.beforeAll(() => {
  reseed()
  linkMembers()
})
test.afterAll(reseed)

test('entra API refuses calls without a bearer token', async ({ request }) => {
  const answer = await request.get(`${base}/api/members`)
  expect(answer.status()).toBe(401)
  expect((await request.get(`${base}/api/health`)).status()).toBe(200)
})

test('entra signs in through the authority and opens every screen with a bearer token', async ({ browser }) => {
  const context = await openContext(browser, { viewport: { width: 1440, height: 1000 } })
  const page = await signIn(context, 'Marcio')
  await expect(page.getByRole('complementary').getByText('Marcio', { exact: true })).toBeVisible()
  const refused: string[] = []
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 400) refused.push(`${response.status()} ${response.url()}`)
  })
  for (const { path, title, month } of screens) {
    await page.goto(`${base}${path}`)
    await expect(page.getByRole('heading', { level: 1, name: month ? 'Outubro de 2026' : title })).toBeVisible()
    await page.waitForLoadState('networkidle')
  }
  expect(refused).toEqual([])
  await context.close()
})

test('entra writes carry the signed-in member', async ({ browser }) => {
  const context = await openContext(browser, { viewport: { width: 1440, height: 1000 } })
  const page = await signIn(context, 'Marcio')
  await page.goto(`${base}/contas?month=2026-10`)
  const bill = page.getByRole('button', { name: /^Internet/ })
  await bill.click()
  await expect(page.getByRole('status')).toContainText('Internet marcada como paga')
  await page.getByRole('button', { name: 'Desfazer' }).click()
  await expect(page.getByRole('status')).toContainText('Internet voltou para em aberto')
  await page.goto(`${base}/atividade`)
  await expect.poll(() => page.getByRole('main').innerText()).toMatch(/Marcio\n[^\n]*\nMarcou Internet como paga\n/)
  await context.close()
})

test('entra names the second member and confirms a decision as the first', async ({ browser }) => {
  const second = await openContext(browser, { viewport: { width: 1440, height: 1000 } })
  await expect((await signIn(second, 'Gabriela')).getByRole('complementary').getByText('Gabriela', { exact: true })).toBeVisible()
  await second.close()
  const context = await openContext(browser, { viewport: { width: 390, height: 844 } })
  const page = await signIn(context, 'Marcio')
  await page.goto(`${base}/decisoes`)
  const card = page.getByRole('article', { name: 'Trocar a internet de casa para 1 Gb' })
  await card.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByRole('status')).toContainText('Trocar a internet de casa para 1 Gb confirmada pelos dois')
  await context.close()
})

test('entra signs out back to the sign-in screen', async ({ browser }) => {
  const context = await openContext(browser, { viewport: { width: 1440, height: 1000 } })
  const page = await signIn(context, 'Marcio')
  await page.getByRole('complementary').getByRole('button', { name: 'Sair' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible()
  await context.close()
})
