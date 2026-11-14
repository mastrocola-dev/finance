import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { brandingDir, css, cssLimit, images, tokens, tokensOf, tone } from './branding.ts'

const runbook = () => readFile(join(brandingDir, '..', 'deploy-azure.md'), 'utf8')

test('reads the tokens from the design table', async () => {
  const all = await tokens()
  expect(all.bg).toEqual({ light: '#F6F6F3', dark: '#0E1014' })
  expect(all.accent).toEqual({ light: '#2B54D9', dark: '#8BA6FF' })
  expect(() => tone(all, 'brand')).toThrow('docs/design.md has no token brand')
  expect(tokensOf('| `surface` | `#FFFFFF` | `#161920` | Cards |')).toEqual({ surface: { light: '#FFFFFF', dark: '#161920' } })
})

test('renders every branding image at the size and weight Entra accepts', async () => {
  for (const image of images) {
    const png = await readFile(join(brandingDir, image.file))
    expect([png.readUInt32BE(16), png.readUInt32BE(20)], image.file).toEqual([image.width, image.height])
    expect(png.length, image.file).toBeLessThanOrEqual(image.maxBytes)
  }
})

test('keeps the committed custom CSS in sync with the tokens', async () => {
  const all = await tokens()
  const committed = await readFile(join(brandingDir, 'custom.css'), 'utf8')
  expect(committed).toBe(css(all))
  expect(committed.length).toBeLessThanOrEqual(cssLimit)
  for (const name of ['bg', 'surface', 'accent']) expect(committed).toContain(tone(all, name).toLowerCase())
})

test('the runbook lists every branding file in the field it goes to', async () => {
  const text = await runbook()
  for (const image of images) expect(text).toContain(`**${image.field}**: \`docs/branding/${image.file}\``)
  expect(text).toContain('`docs/branding/custom.css`')
  expect(text).toContain('`ENTRA_DOMAIN_HINT`')
  expect(text).toContain(`**Page background color** \`${tone(await tokens(), 'bg')}\` (\`bg\`)`)
})
