import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { type Browser, type BrowserContext, type BrowserContextOptions, expect, type Page, test } from '@playwright/test'

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

export const entraApiEnv = { ...e2eEnv, SERVICE_AGENT_CLI: 'test/import/fake-agent.ts', API_PORT: e2eIssuer.apiPort, FINANCE_CLOCK: frozenAt, AUTH_MODE: 'entra', ENTRA_ISSUER: e2eIssuer.issuer, ENTRA_AUDIENCE: e2eIssuer.audience }

export const entraBuildEnv = { VITE_AUTH_MODE: 'entra', VITE_ENTRA_CLIENT_ID: entraPreview.clientId, VITE_ENTRA_AUTHORITY: entraPreview.authority, VITE_ENTRA_SCOPE: entraPreview.scope }

const run = (command: string, env = {}) => execSync(command, { cwd: '..', stdio: 'ignore', env: { ...process.env, ...e2eEnv, ...env } })

export const entraMode = () => test.info().project.name === 'entra'

let linked = false

export const linkMembers = () => {
  for (const [name, oid] of Object.entries(e2eIssuer.members)) run(`npm run member:link -- ${name} ${oid}`, { PGOPTIONS: `-c finance.clock=${frozenAt}` })
  linked = true
}

export const reseed = () => {
  run('npm run db:reset && npm run db:seed')
  linked = false
}

export const openContext = async (browser: Browser, options: BrowserContextOptions = {}, frozen = true) => {
  const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', ...options })
  if (frozen) await context.clock.setFixedTime(new Date(frozenAt))
  return context
}

type Member = keyof typeof e2eIssuer.members

const routeAuthority = (context: BrowserContext, member: Member) => {
  const authority = new URL(entraPreview.authority).origin
  return context.route(`${authority}/**`, async (route) => {
    const request = route.request()
    const target = new URL(request.url())
    const forwarded = new URL(`${target.pathname}${target.search}`, e2eIssuer.origin)
    if (target.pathname.endsWith('/authorize')) forwarded.searchParams.set('login_hint', member)
    const response = await route.fetch({ url: forwarded.href, headers: { ...request.headers(), 'x-public-origin': authority }, maxRedirects: 0 })
    await route.fulfill({ response })
  })
}

export const signIn = async (context: BrowserContext, member: Member) => {
  await routeAuthority(context, member)
  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:${entraPreview.port}/`)
  await page.getByRole('button', { name: 'Entrar com Google' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Outubro de 2026' })).toBeVisible({ timeout: 15_000 })
  return page
}

type State = Awaited<ReturnType<BrowserContext['storageState']>>

const sessions = new Map<string, State>()
const authorizations = new WeakMap<BrowserContext, string>()

export const memberState = async (browser: Browser, member: Member = 'Marcio', frozen = true): Promise<BrowserContextOptions> => {
  if (!entraMode()) return {}
  if (!linked) linkMembers()
  const key = `${member} ${frozen}`
  if (!sessions.has(key)) {
    const context = await openContext(browser, {}, frozen)
    await signIn(context, member)
    sessions.set(key, await context.storageState())
    await context.close()
  }
  return { storageState: sessions.get(key) }
}

export const actAs = async (context: BrowserContext, member: Member = 'Marcio') => {
  if (!entraMode()) return context.addInitScript((name) => localStorage.setItem('finance.member', name), member)
  await routeAuthority(context, member)
  context.on('request', (request) => {
    const authorization = request.headers().authorization
    if (authorization) authorizations.set(context, authorization)
  })
}

export const memberContext = async (browser: Browser, options: BrowserContextOptions = {}, member: Member = 'Marcio') => {
  const context = await openContext(browser, { ...options, ...(await memberState(browser, member)) })
  await actAs(context, member)
  return context
}

export const memberHeaders = async (page: Page, member: Member = 'Marcio'): Promise<Record<string, string>> => {
  if (!entraMode()) return { 'x-member': member }
  const context = page.context()
  if (!authorizations.has(context)) await Promise.all([context.waitForEvent('request', (request) => Boolean(request.headers().authorization)), page.goto('/')])
  return { authorization: authorizations.get(context) ?? '' }
}
