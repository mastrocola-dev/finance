import { defineConfig } from '@playwright/test'
import { frozenAt } from './e2e/context.ts'

const api = process.env.API_PORT ?? '3200'

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium', env: { ...process.env, LANG: 'pt_BR.UTF-8' } },
  },
  webServer: [
    { command: 'npm run api:http', cwd: '..', env: { SERVICE_AGENT_CLI: 'test/import/fake-agent.ts', FINANCE_CLOCK: frozenAt }, url: `http://127.0.0.1:${api}/api/members`, reuseExistingServer: true },
    { command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 120_000 },
  ],
})
