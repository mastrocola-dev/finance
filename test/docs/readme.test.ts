import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')
const root = new URL('../../', import.meta.url)
const screenshots = readdirSync(new URL('web/screenshots/', root)).filter((name) => name.endsWith('.png'))
const linked = [...readme.matchAll(/(?:src="|\]\()([^")#\s]+)/g)].flatMap(([, path]) => (path && !/^[a-z]+:/.test(path) ? [path] : []))

test('every local link and image in the readme exists', () => {
  assert.ok(linked.length > 0)
  for (const path of linked) assert.ok(existsSync(new URL(path, root)), path)
})

test('the readme shows every screenshot', () => {
  assert.ok(screenshots.length > 0)
  for (const name of screenshots) assert.ok(readme.includes(`web/screenshots/${name}`), name)
})

test('every image has alternative text', () => {
  for (const tag of readme.match(/<img [^>]*>/g) ?? []) assert.match(tag, /alt="[^"]+"/)
})
