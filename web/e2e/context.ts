import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { type Browser, type BrowserContext, type BrowserContextOptions, expect } from '@playwright/test'

export const frozenAt = '2026-10-18T12:00:00-03:00'

if (existsSync('../.env')) process.loadEnvFile('../.env')

const e2eDatabase = () => {
  const url = new URL(process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/finance')
  url.pathname = '/finance_e2e'
  return url.href
}

export const e2eEnv = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? e2eDatabase(),
  API_PORT: process.env.E2E_API_PORT ?? '3290',
  IMPORT_UPLOADS: '.imports-e2e',
}

export const entraPreview = { port: '4274', authority: 'https://caixa-e2e.ciamlogin.com/', clientId: '00000000-0000-4000-8000-000000000e2e', scope: 'api://caixa-e2e/access' }

const issuerOrigin = `http://127.0.0.1:${process.env.E2E_ISSUER_PORT ?? '3292'}`

export const e2eIssuer = {
  origin: issuerOrigin,
  issuer: `${issuerOrigin}/tenant/v2.0`,
  tenant: '00000000-0000-4000-8000-0000000e2e00',
  audience: 'api://caixa-e2e',
  apiPort: process.env.E2E_ENTRA_API_PORT ?? '3291',
  members: { Marcio: '00000000-0000-4000-8000-0000000e2e01', Gabriela: '00000000-0000-4000-8000-0000000e2e02' },
}

export const entraApiEnv = { ...e2eEnv, API_PORT: e2eIssuer.apiPort, FINANCE_CLOCK: frozenAt, AUTH_MODE: 'entra', ENTRA_ISSUER: e2eIssuer.issuer, ENTRA_AUDIENCE: e2eIssuer.audience }

export const entraBuildEnv = { VITE_AUTH_MODE: 'entra', VITE_ENTRA_CLIENT_ID: entraPreview.clientId, VITE_ENTRA_AUTHORITY: entraPreview.authority, VITE_ENTRA_SCOPE: entraPreview.scope }

const run = (command: string) => execSync(command, { cwd: '..', stdio: 'ignore', env: { ...process.env, ...e2eEnv } })

export const reseed = () => run('npm run db:reset && npm run db:seed')

export const linkMembers = () => {
  for (const [name, oid] of Object.entries(e2eIssuer.members)) run(`npm run member:link -- ${name} ${oid}`)
}

export const openContext = async (browser: Browser, options: BrowserContextOptions = {}) => {
  const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', ...options })
  await context.clock.setFixedTime(new Date(frozenAt))
  return context
}

export const signIn = async (context: BrowserContext, member: keyof typeof e2eIssuer.members) => {
  const authority = new URL(entraPreview.authority).origin
  await context.route(`${authority}/**`, async (route) => {
    const request = route.request()
    const target = new URL(request.url())
    const forwarded = new URL(`${target.pathname}${target.search}`, e2eIssuer.origin)
    if (target.pathname.endsWith('/authorize')) forwarded.searchParams.set('login_hint', member)
    const response = await route.fetch({ url: forwarded.href, headers: { ...request.headers(), 'x-public-origin': authority }, maxRedirects: 0 })
    await route.fulfill({ response })
  })
  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:${entraPreview.port}/`)
  await page.getByRole('button', { name: 'Entrar com Google' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Outubro de 2026' })).toBeVisible({ timeout: 15_000 })
  return page
}
