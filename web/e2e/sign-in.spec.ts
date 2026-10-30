import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { authorizeUrl, entraPreview, openContext } from './context.ts'
import { pinTabBar } from './shot.ts'

const url = `http://127.0.0.1:${entraPreview.port}/decisoes`

const viewports = [
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]

for (const theme of ['light', 'dark'] as const)
  for (const viewport of viewports)
    test(`sign-in ${viewport.width} ${theme}`, async ({ browser }) => {
      const context = await openContext(browser, { viewport, colorScheme: theme })
      const page = await context.newPage()
      await page.goto(url)
      await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0)
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target.join(' ')) }))).toEqual([])
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: `screenshots/sign-in-${viewport.width}-${theme}.png`, fullPage: true, style: pinTabBar })
      await context.close()
    })

test('Entrar com Google goes through the API to the provider with the client, PKCE and the return path', async ({ browser }) => {
  const context = await openContext(browser)
  const page = await context.newPage()
  await page.goto(`${url}?month=2026-10`)
  const [authorize] = await Promise.all([page.waitForRequest((request) => request.url().startsWith(`${authorizeUrl}?`)), page.getByRole('button', { name: 'Entrar com Google' }).click()])
  const redirected = new URL(authorize.url())
  expect(redirected.searchParams.get('client_id')).toBe(entraPreview.clientId)
  expect(redirected.searchParams.get('redirect_uri')).toBe(`http://127.0.0.1:${entraPreview.port}/auth/callback`)
  expect(redirected.searchParams.get('code_challenge_method')).toBe('S256')
  expect(redirected.searchParams.get('prompt')).toBe('select_account')
  const login = (await (await authorize.redirectedFrom()?.response())?.headerValue('set-cookie')) ?? ''
  expect(login).toMatch(/^finance\.login=[^;]+; Path=\/auth; Max-Age=600; HttpOnly; SameSite=Lax$/)
  expect(new URL(authorize.redirectedFrom()?.url() ?? '').searchParams.get('to')).toBe('/decisoes?month=2026-10')
  await context.close()
})

test('a failed callback comes back to the sign-in screen with a Portuguese message', async ({ browser }) => {
  const context = await openContext(browser)
  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:${entraPreview.port}/auth/callback?code=forged&state=forged`)
  await expect(page.getByRole('alert')).toHaveText('Não foi possível concluir a entrada. Tente de novo.')
  expect(new URL(page.url()).search).toBe('')
  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible()
  await context.close()
})
