import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const checklist = readFileSync(new URL('docs/acceptance.md', root), 'utf8')
const nav = readFileSync(new URL('web/src/shell/nav.ts', root), 'utf8')
const screens = [...nav.matchAll(/\{ path: '([^']+)', title: '([^']+)'/g)].map(([, path, title]) => ({ path, title }))
const mockups = readdirSync(new URL('docs/mockups/', root)).filter((name) => name.endsWith('.html'))

test('the checklist walks through every screen of the app', () => {
  assert.ok(screens.length >= 8)
  for (const { path, title } of screens) assert.ok(checklist.includes(`**${title}** (\`${path}\`)`), title)
  assert.ok(checklist.includes('(`/importar/<id>`)'))
})

test('the checklist names every mockup', () => {
  assert.ok(mockups.length > 0)
  for (const name of mockups) assert.ok(checklist.includes(`\`${name}\``), name)
})

test('the checklist covers both members, a fictional import and the reversal of a payment', () => {
  for (const text of ['Marcio', 'Gabriela', 'Desfazer', 'evals/cases/bank-csv/extrato-conjunta.csv', 'docker build --target api']) assert.ok(checklist.includes(text), text)
  assert.doesNotMatch(checklist, /- \[x\]/)
})
