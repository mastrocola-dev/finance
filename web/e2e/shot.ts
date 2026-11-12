import { basename } from 'node:path'
import { type Page, test } from '@playwright/test'

export const pinTabBar = 'nav.fixed { position: absolute !important }'

export const shotPath = (path: string) => (test.info().project.name === 'entra' ? test.info().outputPath(basename(path)) : path)

export const fullShot = (page: Page, path: string) => page.screenshot({ path: shotPath(path), fullPage: true, style: pinTabBar })
