import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { entraPreview, openContext } from './context.ts'
import { fullShot } from './shot.ts'

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
      await fullShot(page, `screenshots/sign-in-${viewport.width}-${theme}.png`)
      await context.close()
    })

test('Entrar com Google redirects to the authority with the client and the API scope', async ({ browser }) => {
  const context = await openContext(browser)
  const authority = new URL(entraPreview.authority)
  const authorize = `${authority.origin}/oauth2/v2.0/authorize`
  await context.route(`${authority.origin}/**`, (route) => {
    const requested = new URL(route.request().url())
    if (requested.pathname.endsWith('/openid-configuration'))
      return route.fulfill({ json: { issuer: `${authority.origin}/tenant/v2.0`, authorization_endpoint: authorize, token_endpoint: `${authority.origin}/oauth2/v2.0/token`, end_session_endpoint: `${authority.origin}/oauth2/v2.0/logout`, jwks_uri: `${authority.origin}/discovery/v2.0/keys` } })
    return route.fulfill({ contentType: 'text/html', body: '<title>authority</title>' })
  })
  const page = await context.newPage()
  await page.goto(url)
  await page.getByRole('button', { name: 'Entrar com Google' }).click()
  await page.waitForURL((current) => current.href.startsWith(authorize))
  const redirected = new URL(page.url())
  expect(redirected.searchParams.get('client_id')).toBe(entraPreview.clientId)
  expect(redirected.searchParams.get('scope')?.split(' ')).toContain(entraPreview.scope)
  expect(redirected.searchParams.get('redirect_uri')).toBe(`http://127.0.0.1:${entraPreview.port}`)
  expect(redirected.searchParams.get('code_challenge_method')).toBe('S256')
  await context.close()
})
