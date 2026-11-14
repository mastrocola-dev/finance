import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import { accent, iconSvg, publicDir } from './icons.ts'

export const brandingDir = join(publicDir, '..', '..', 'docs', 'branding')

const designPath = join(publicDir, '..', '..', 'docs', 'design.md')
const geist = new URL(import.meta.resolve('@fontsource-variable/geist/files/geist-latin-wght-normal.woff2'))

export type Tokens = Record<string, { light: string; dark: string }>

export const tokensOf = (design: string): Tokens => Object.fromEntries([...design.matchAll(/^\| `([a-z-]+)` \| `(#[0-9A-F]{6})` \| `(#[0-9A-F]{6})` \|/gm)].map(([, name, light, dark]) => [name, { light, dark }]))

export const tone = (tokens: Tokens, name: string, theme: 'light' | 'dark' = 'light') => {
  const token = tokens[name]
  if (!token) throw new Error(`docs/design.md has no token ${name}`)
  return token[theme]
}

export const images = [
  { file: 'favicon.png', field: 'Favicon', width: 32, height: 32, maxBytes: 5_000 },
  { file: 'background.png', field: 'Background image', width: 1920, height: 1080, maxBytes: 300_000 },
  { file: 'banner-logo.png', field: 'Banner logo', width: 245, height: 36, maxBytes: 50_000 },
  { file: 'square-logo.png', field: 'Square logo (light theme)', width: 240, height: 240, maxBytes: 50_000 },
  { file: 'square-logo-dark.png', field: 'Square logo (dark theme)', width: 240, height: 240, maxBytes: 50_000 },
]

export const cssLimit = 25_000

const darkIcon = (tokens: Tokens) =>
  iconSvg()
    .replace(`fill="${accent}"`, `fill="${tone(tokens, 'accent', 'dark')}"`)
    .replace('stroke="#fff"', `stroke="${tone(tokens, 'accent-text', 'dark')}"`)

const arc = (color: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><path d="M1772 328A300 300 0 1 0 1772 752" fill="none" stroke="${color}" stroke-width="110" stroke-linecap="round"/></svg>`

export const pages = (tokens: Tokens, font: string) => {
  const filled = (svg: string) => `<style>*{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`
  return {
    'favicon.png': filled(iconSvg()),
    'square-logo.png': filled(iconSvg()),
    'square-logo-dark.png': filled(darkIcon(tokens)),
    'background.png': `<style>*{margin:0}body{background:${tone(tokens, 'bg')}}</style>${filled(arc(tone(tokens, 'accent-soft')))}`,
    'banner-logo.png': `<style>@font-face{font-family:Geist;src:url(data:font/woff2;base64,${font})}*{margin:0}body{display:flex;align-items:center;gap:10px;height:100vh;font:600 24px/1 Geist;letter-spacing:-0.01em;color:${tone(tokens, 'text')}}svg{width:36px;height:36px}</style>${iconSvg()}<span>Caixa</span>`,
  }
}

const rule = (selectors: string[], declarations: Record<string, string>) =>
  `${selectors.join(',\n')} {\n${Object.entries(declarations)
    .map(([name, value]) => `  ${name}: ${value.toLowerCase()};`)
    .join('\n')}\n}\n`

export const css = (tokens: Tokens) => {
  const color = (name: string) => tone(tokens, name)
  return [
    rule(['.ext-background-image', '.ext-background'], { 'background-color': color('bg') }),
    rule(['.ext-sign-in-box'], { 'background-color': color('surface'), border: `1px solid ${color('border')}`, 'border-radius': '14px', 'box-shadow': 'none', color: color('text') }),
    rule(['.ext-title'], { color: color('text') }),
    rule(['.ext-subtitle', '.ext-boilerplate-text'], { color: color('muted') }),
    rule(['.ext-button.ext-primary'], { 'background-color': color('accent'), color: color('accent-text'), 'border-radius': '10px' }),
    rule(['.ext-button.ext-primary:hover', '.ext-button.ext-primary:focus'], { 'background-color': color('accent'), outline: `2px solid ${color('accent')}`, 'outline-offset': '2px' }),
    rule(['.ext-button.ext-secondary'], { 'background-color': color('surface'), color: color('text'), border: `1px solid ${color('border')}`, 'border-radius': '10px' }),
  ].join('\n')
}

export const tokens = async () => tokensOf(await readFile(designPath, 'utf8'))

const render = async () => {
  const all = await tokens()
  const font = (await readFile(geist)).toString('base64')
  await mkdir(brandingDir, { recursive: true })
  await writeFile(join(brandingDir, 'custom.css'), css(all))
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' })
  const content = pages(all, font)
  for (const image of images) {
    const page = await browser.newPage({ viewport: { width: image.width, height: image.height } })
    await page.setContent(content[image.file as keyof typeof content])
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: join(brandingDir, image.file), omitBackground: image.file !== 'background.png' })
    await page.close()
  }
  await browser.close()
}

if (import.meta.main) await render()
