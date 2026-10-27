import { defineConfig } from '@playwright/test'
import { e2eEnv, entraBuildEnv, entraPreview, frozenAt } from './e2e/context.ts'

const chromium = process.env.PLAYWRIGHT_CHROMIUM ?? (process.env.CI ? undefined : '/opt/pw-browsers/chromium')
const reuseExistingServer = !process.env.CI

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4273',
    launchOptions: { executablePath: chromium, args: ['--disable-partial-raster'], env: { ...process.env, LANG: 'pt_BR.UTF-8' } },
  },
  webServer: [
    {
      command: 'npm run db:reset && npm run db:seed && npm run api:http',
      cwd: '..',
      env: { ...e2eEnv, SERVICE_AGENT_CLI: 'test/import/fake-agent.ts', FINANCE_CLOCK: frozenAt },
      url: `http://127.0.0.1:${e2eEnv.API_PORT}/api/members`,
      reuseExistingServer,
      timeout: 360_000,
    },
    { command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4273 --strictPort', env: { API_PORT: e2eEnv.API_PORT }, url: 'http://127.0.0.1:4273', reuseExistingServer, timeout: 120_000 },
    {
      command: `npx vite build --outDir dist-entra && npx vite preview --outDir dist-entra --host 127.0.0.1 --port ${entraPreview.port} --strictPort`,
      env: { ...entraBuildEnv, API_PORT: e2eEnv.API_PORT },
      url: `http://127.0.0.1:${entraPreview.port}`,
      reuseExistingServer,
      timeout: 120_000,
    },
  ],
})
