import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const folder = new URL('../../infra/', import.meta.url)
const files = readdirSync(folder)
const sources = files.filter((file) => file.endsWith('.tf')).map((file) => ({ file, text: readFileSync(new URL(file, folder), 'utf8') }))
const all = sources.map((source) => source.text).join('\n')

const attribute = /^( *)([A-Za-z_][\w-]*|"[^"]*") +=(?!=)/

const misaligned = (text: string) => {
  const found: string[] = []
  let group: { line: string; indent: number; key: number }[] = []
  const flush = () => {
    const column = Math.max(...group.map((item) => item.indent + item.key)) + 1
    for (const item of group) if (item.line.indexOf('=') !== column) found.push(item.line)
    group = []
  }
  for (const line of [...text.split('\n'), '']) {
    const match = attribute.exec(line)
    const indent = match?.[1]?.length ?? -1
    if (group.length > 0 && (!match || indent !== group[0]?.indent)) flush()
    if (match) group.push({ line, indent, key: match[2]?.length ?? 0 })
  }
  return found
}

const misindented = (text: string) => {
  const found: string[] = []
  let depth = 0
  for (const line of text.split('\n')) {
    const code = line.replace(/"(?:[^"\\]|\\.)*"/g, '""').trim()
    const closes = /^[}\])]/.test(code) ? 1 : 0
    const expected = code === '' ? 0 : (depth - closes) * 2
    if (line.length - line.trimStart().length !== expected || /\s$/.test(line) || line.includes('\t')) found.push(line)
    depth += (code.match(/[{[(]/g) ?? []).length - (code.match(/[}\])]/g) ?? []).length
  }
  return found
}

test('infra holds only configuration, never values or state', () => {
  const tracked = execFileSync('git', ['ls-files', '--others', '--cached', '--exclude-standard', 'infra'], { cwd: new URL('../..', import.meta.url), encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
  assert.deepEqual(
    tracked.filter((file) => !/\.(tf|md)$|\.terraform\.lock\.hcl$/.test(file)),
    [],
  )
  assert.ok(sources.length >= 4)
})

test('terraform is pinned and the backend takes its settings at init', () => {
  assert.match(all, /required_version = "1\.16\.4"/)
  assert.match(all, /backend "azurerm" \{\}/)
})

test('secrets reach Azure only through write-only attributes and Key Vault references', () => {
  assert.doesNotMatch(all, /password\s*=\s*"/)
  assert.doesNotMatch(all, /^\s*value\s*=\s*.*random_password/m)
  assert.match(all, /administrator_password_wo\s+= ephemeral\.random_password\.db\.result/)
  assert.match(all, /key_vault_secret_id = azurerm_key_vault_secret\.database_url\.versionless_id/)
})

test('every variable has a type and a description', () => {
  const blocks = [...all.matchAll(/variable "(\w+)" \{([\s\S]*?)\n\}/g)]
  assert.ok(blocks.length > 0)
  for (const [, name, body] of blocks) assert.match(body ?? '', /type\s+=[\s\S]*description\s+=/, name)
})

test('files follow the terraform fmt layout', () => {
  for (const { file, text } of sources) {
    assert.deepEqual(misaligned(text), [], file)
    assert.deepEqual(misindented(text), [], file)
    assert.ok(text.endsWith('}\n') && !text.endsWith('\n\n'), file)
  }
})
