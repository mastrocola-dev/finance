import type { Page } from '@playwright/test'

export const pinTabBar = 'nav.fixed { position: absolute !important }'

export const fullShot = (page: Page, path: string) => page.screenshot({ path, fullPage: true, style: pinTabBar })
