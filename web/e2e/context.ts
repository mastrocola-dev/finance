import type { Browser, BrowserContextOptions } from '@playwright/test'

export const frozenAt = '2026-10-18T12:00:00-03:00'

export const openContext = async (browser: Browser, options: BrowserContextOptions = {}) => {
  const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', ...options })
  await context.clock.setFixedTime(new Date(frozenAt))
  return context
}
