import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

export const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

export const accent = '#2b54d9'

const mark = (radius: number, stroke: number) => {
  const offset = Math.round(radius * Math.SQRT1_2)
  return `<path d="M${256 + offset} ${256 - offset}A${radius} ${radius} 0 1 0 ${256 + offset} ${256 + offset}" fill="none" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round"/>`
}

export const iconSvg = (maskable = false) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>Caixa</title><rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="${accent}"/>${maskable ? mark(96, 46) : mark(132, 60)}</svg>\n`

export const icons = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
]

const render = async () => {
  await mkdir(publicDir, { recursive: true })
  await writeFile(join(publicDir, 'icon.svg'), iconSvg())
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' })
  for (const icon of icons) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } })
    await page.setContent(`<style>*{margin:0}svg{display:block;width:100vw;height:100vh}</style>${iconSvg(icon.maskable)}`)
    await page.screenshot({ path: join(publicDir, icon.file), omitBackground: true })
    await page.close()
  }
  await browser.close()
}

if (import.meta.main) await render()
