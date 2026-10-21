import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { accent, iconSvg, icons, publicDir } from './icons.ts'

test('keeps the committed icon in sync with the generator', async () => {
  expect(await readFile(join(publicDir, 'icon.svg'), 'utf8')).toBe(iconSvg())
  expect(iconSvg()).toContain(accent)
  expect(iconSvg(true)).toContain('rx="0"')
})

test('renders every PNG icon at its size', async () => {
  for (const icon of icons) {
    const png = await readFile(join(publicDir, icon.file))
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([icon.size, icon.size])
  }
})
