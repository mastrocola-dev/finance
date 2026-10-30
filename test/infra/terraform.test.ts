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

test('both apps verify Entra tokens and the MCP app advertises its public URL and scopes', () => {
  assert.doesNotMatch(all, /AUTH_MODE\s+= "local"/)
  assert.match(all, /AUTH_MODE\s+= "entra"\n\s+ENTRA_ISSUER\s+= var\.entra_issuer\n\s+ENTRA_AUDIENCE = var\.entra_audience/)
  assert.match(all, /for_each = merge\(local\.entra, each\.value\.env\)/)
  assert.match(all, /MCP_PUBLIC_URL\s+= "https:\/\/\$\{local\.mcp_host\}"/)
  assert.match(all, /MCP_SCOPES\s+= join\(",", var\.mcp_scopes\)/)
})

test('the api app accepts its own Container Apps host', () => {
  assert.match(all, /api_host = "\$\{var\.name\}-api\.\$\{azurerm_container_app_environment\.main\.default_domain\}"/)
  assert.match(all, /API_ALLOWED_HOSTS\s+= local\.api_host/)
})

test('the api app signs people in on its own origin with secrets from Key Vault', () => {
  const api = /\n {4}api = \{([\s\S]*?)\n {4}\}\n/.exec(all)?.[1] ?? ''
  assert.match(api, /API_ALLOWED_ORIGINS\s+= "https:\/\/\$\{local\.api_host\}"/)
  assert.match(api, /API_PUBLIC_URL\s+= "https:\/\/\$\{local\.api_host\}"/)
  assert.match(api, /ENTRA_CLIENT_ID\s+= var\.entra_web_client_id/)
  assert.match(api, /SESSION_KEY\s+= "session-key"/)
  assert.match(api, /ENTRA_CLIENT_SECRET = "finance-web-secret"/)
  assert.match(api, /ANTHROPIC_API_KEY\s+= "anthropic-api-key"/)
  assert.match(api, /IMPORT_DAILY_USD_CAP = tostring\(var\.import_daily_usd_cap\)/)
  assert.doesNotMatch(all, /(SESSION_KEY|ENTRA_CLIENT_SECRET|ANTHROPIC_API_KEY)\s+= var\./)
  assert.doesNotMatch(all, /sk-ant-/)
  const mcp = /\n {4}mcp = \{([\s\S]*?)\n {4}\}\n/.exec(all)?.[1] ?? ''
  assert.match(mcp, /secrets = \{\}/)
  assert.doesNotMatch(mcp, /API_|ENTRA_CLIENT|SESSION_KEY|IMPORT_/)
  assert.match(all, /key_vault_secret_id = "\$\{azurerm_key_vault\.main\.vault_uri\}secrets\/\$\{secret\.value\}"/)
  assert.match(all, /for_each = each\.value\.secrets\n\n\s+content \{\n\s+name\s+= env\.key\n\s+secret_name = env\.value/)
})

test('a manual job runs the migrations with the api image and the database secret reference', () => {
  const job = /resource "azurerm_container_app_job" "migrate" \{([\s\S]*?)\n\}/.exec(all)?.[1] ?? ''
  assert.match(job, /manual_trigger_config \{/)
  assert.match(job, /image\s+= var\.api_image/)
  assert.match(job, /command = \["npm", "run", "db:migrate"\]/)
  assert.match(job, /key_vault_secret_id = azurerm_key_vault_secret\.database_url\.versionless_id/)
  assert.match(job, /secret_name = "database-url"/)
  assert.doesNotMatch(job, /value\s+=/)
})

test('the runbook names every variable terraform reads and the README links to it', () => {
  const runbook = readFileSync(new URL('../../docs/deploy-azure.md', import.meta.url), 'utf8')
  const names = [...all.matchAll(/variable "(\w+)"/g)].map(([, name]) => name)
  assert.ok(names.length > 10)
  for (const name of names) assert.match(runbook, new RegExp(`\`${name}\``), name)
  assert.match(readFileSync(new URL('README.md', folder), 'utf8'), /\[docs\/deploy-azure\.md\]\(\.\.\/docs\/deploy-azure\.md\)/)
})
