import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { brandDir, contrast, files, pairs, shots, themes } from './brand.ts'
import { avoided, directions } from './brand-directions.ts'

test('measures contrast like WCAG', () => {
  expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21)
  expect(contrast('#5B606B', '#FFFFFF')).toBeGreaterThan(4.5)
  expect(contrast('#FFFFFF', '#FFFFFF')).toBe(1)
})

test('every direction keeps text, figures and accent at 4.5:1 in both themes', () => {
  for (const direction of directions)
    for (const theme of themes)
      for (const [fg, bg] of pairs) {
        const palette = direction[theme]
        expect(contrast(palette[fg], palette[bg]), `${direction.id} ${theme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
})

test('income and expense never share a color and income follows the accent', () => {
  for (const direction of directions)
    for (const theme of themes) {
      const palette = direction[theme]
      expect(palette.income, `${direction.id} ${theme}`).not.toBe(palette.expense)
      expect(palette.income, `${direction.id} ${theme}`).toBe(palette.accent)
    }
})

test('three directions with three distinct names each, none a known bank or fintech', () => {
  expect(directions).toHaveLength(3)
  const names = directions.flatMap((direction) => direction.names.map((candidate) => candidate.name.toLowerCase()))
  expect(names).toHaveLength(9)
  expect(new Set(names).size).toBe(9)
  for (const name of names) expect(avoided.map((known) => known.toLowerCase())).not.toContain(name)
  for (const direction of directions) for (const candidate of direction.names) expect(candidate.risk.length, candidate.name).toBeGreaterThan(0)
})

test('the committed files match the generator', async () => {
  for (const [path, content] of Object.entries(files())) expect(await readFile(join(brandDir, path), 'utf8'), path).toBe(content)
})

test('icons, fonts and every screenshot are committed', async () => {
  for (const direction of directions)
    for (const file of ['icon-512.png', 'icon-maskable-512.png']) {
      const png = await readFile(join(brandDir, direction.id, file))
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], `${direction.id}/${file}`).toEqual([512, 512])
    }
  for (const shot of shots) expect(existsSync(join(brandDir, 'screenshots', shot)), shot).toBe(true)
  for (const font of ['geist-latin-wght-normal.woff2', 'geist-mono-latin-wght-normal.woff2']) expect(existsSync(join(brandDir, 'fonts', font)), font).toBe(true)
})

test('the board links every direction page and the brief', async () => {
  const board = await readFile(join(brandDir, 'index.html'), 'utf8')
  expect(board).toContain('href="brief.md"')
  for (const direction of directions) expect(board).toContain(`href="${direction.id}/overview.html"`)
  for (const tag of board.match(/<img [^>]*>/g) ?? []) expect(tag).toMatch(/alt="[^"]+"/)
})
