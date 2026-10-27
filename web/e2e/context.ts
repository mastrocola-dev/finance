import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { Browser, BrowserContextOptions } from '@playwright/test'

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

export const entraBuildEnv = { VITE_AUTH_MODE: 'entra', VITE_ENTRA_CLIENT_ID: entraPreview.clientId, VITE_ENTRA_AUTHORITY: entraPreview.authority, VITE_ENTRA_SCOPE: entraPreview.scope }

export const reseed = () => execSync('npm run db:reset && npm run db:seed', { cwd: '..', stdio: 'ignore', env: { ...process.env, ...e2eEnv } })

export const openContext = async (browser: Browser, options: BrowserContextOptions = {}) => {
  const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', ...options })
  await context.clock.setFixedTime(new Date(frozenAt))
  return context
}
