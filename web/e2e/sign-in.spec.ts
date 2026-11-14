import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { authorizeUrl, entraPreview, openContext } from './context.ts'
import { pinTabBar } from './shot.ts'

const url = `http://127.0.0.1:${entraPreview.port}/decisoes`

const viewports = [
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]

const member = { id: '1', name: 'Marcio', sharePercent: 50 }

const states: Record<string, (page: Page) => Promise<void>> = {
  'sign-in': async () => {},
  'sign-in-busy': async (page) => {
    await page.route(
      (address) => address.pathname === '/auth/login',
      (route) => route.abort('aborted'),
    )
    await page.getByRole('button', { name: 'Entrar com Google' }).click({ noWaitAfter: true })
    await expect(page.getByRole('button', { name: 'Abrindo o Google…' })).toBeDisabled()
  },
  'sign-in-unknown': async (page) => {
    await expect(page.getByRole('status')).toContainText('Esta conta Google não está cadastrada na casa.')
    await expect(page.getByRole('button', { name: 'Entrar com outra conta' })).toBeVisible()
  },
  'sign-in-expired': async (page) => {
    await expect(page.getByRole('status')).toContainText('Sua sessão terminou.')
  },
}

const answers: Record<string, (page: Page) => Promise<unknown>> = {
  'sign-in-unknown': (page) => page.route('**/api/me', (route) => route.fulfill({ status: 403, json: { error: 'unknown member' } })),
  'sign-in-expired': (page) => page.route('**/api/me', (route) => route.fulfill({ json: member })),
}

for (const [name, reach] of Object.entries(states))
  for (const theme of ['light', 'dark'] as const)
    for (const viewport of viewports)
      test(`${name} ${viewport.width} ${theme}`, async ({ browser }) => {
        const context = await openContext(browser, { viewport, colorScheme: theme, serviceWorkers: 'block' })
        const page = await context.newPage()
        await answers[name]?.(page)
        await page.goto(url)
        await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible()
        await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0)
        await reach(page)
        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
        expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target.join(' ')) }))).toEqual([])
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: `screenshots/${name}-${viewport.width}-${theme}.png`, fullPage: true, style: pinTabBar, animations: 'disabled' })
        await context.close()
      })

test('Entrar com Google goes through the API to Google with the client, PKCE, the domain hint and the return path', async ({ browser }) => {
  const context = await openContext(browser)
  const page = await context.newPage()
  await page.goto(`${url}?month=2026-10`)
  const [authorize] = await Promise.all([page.waitForRequest((request) => request.url().startsWith(`${authorizeUrl}?`)), page.getByRole('button', { name: 'Entrar com Google' }).click()])
  const redirected = new URL(authorize.url())
  expect(redirected.searchParams.get('client_id')).toBe(entraPreview.clientId)
  expect(redirected.searchParams.get('redirect_uri')).toBe(`http://127.0.0.1:${entraPreview.port}/auth/callback`)
  expect(redirected.searchParams.get('code_challenge_method')).toBe('S256')
  expect(redirected.searchParams.get('domain_hint')).toBe('google')
  expect(redirected.searchParams.get('prompt')).toBeNull()
  const login = (await (await authorize.redirectedFrom()?.response())?.headerValue('set-cookie')) ?? ''
  expect(login).toMatch(/^finance\.login=[^;]+; Path=\/auth; Max-Age=600; HttpOnly; SameSite=Lax$/)
  expect(new URL(authorize.redirectedFrom()?.url() ?? '').searchParams.get('to')).toBe('/decisoes?month=2026-10')
  await context.close()
})

test('Entrar com outra conta on an unknown account asks the provider to choose an account', async ({ browser }) => {
  const context = await openContext(browser)
  const page = await context.newPage()
  await page.route('**/api/me', (route) => route.fulfill({ status: 403, json: { error: 'unknown member' } }))
  await page.goto(url)
  const [authorize] = await Promise.all([page.waitForRequest((request) => request.url().startsWith(`${authorizeUrl}?`)), page.getByRole('button', { name: 'Entrar com outra conta' }).click()])
  expect(new URL(authorize.url()).searchParams.get('prompt')).toBe('select_account')
  await context.close()
})

test('a failed callback comes back to the sign-in screen with a Portuguese message', async ({ browser }) => {
  const context = await openContext(browser)
  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:${entraPreview.port}/auth/callback?code=forged&state=forged`)
  await expect(page.getByRole('alert')).toContainText('Não foi possível concluir a entrada.')
  expect(new URL(page.url()).search).toBe('')
  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible()
  await context.close()
})
