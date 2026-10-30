import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { drift } from '../../scripts/runbook.ts'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const sources = { runbook: read('docs/deploy-azure.md'), variables: read('infra/variables.tf'), main: read('infra/main.tf') }

const variables = 'variable "name" {\n  type = string\n}\n\nvariable "location" {\n  type = string\n}\n'
const main = 'locals {\n  secrets = {\n    SESSION_KEY = "session-key"\n  }\n}\n\nresource "azurerm_key_vault_secret" "database_url" {\n  name         = "database-url"\n}\n\nsecret_name = "database-url"\nkey_vault_secret_id = "https://kv/secrets/registry-password"\n'
const runbook = '| `name` | no |\n| `location` | no |\n\naz keyvault secret set --vault-name <vault> --name session-key --file a\naz keyvault secret set --vault-name <vault> --name registry-password --file b\n'

test('the runbook and the terraform agree on every variable and secret', () => {
  assert.deepEqual(drift(sources), [])
  for (const secret of ['session-key', 'finance-web-secret', 'anthropic-api-key', 'registry-password']) assert.match(sources.runbook, new RegExp(`--name ${secret} `), secret)
  assert.doesNotMatch(sources.runbook, /--name database-url /)
  assert.match(sources.runbook, /\[docs\/acceptance.md\]\(acceptance.md\) section 8/)
  assert.match(read('docs/acceptance.md'), /^## 8\. On Azure/m)
})

test('drift is empty when both sides list the same names', () => {
  assert.deepEqual(drift({ runbook, variables, main }), [])
})

test('drift names variables missing on either side', () => {
  assert.deepEqual(drift({ runbook: runbook.replace('| `location` | no |\n', '| `region` | no |\n'), variables, main }), ['variable missing from the runbook: location', 'runbook variable not in infra/variables.tf: region'])
})

test('drift names secrets the runbook forgets or invents, but not the ones terraform creates', () => {
  const forgets = runbook.replace(/.*registry-password.*\n/, '')
  assert.deepEqual(drift({ runbook: forgets, variables, main }), ['Key Vault secret the runbook does not set: registry-password'])
  const invents = `${runbook}az keyvault secret set --vault-name <vault> --name old-key --file c\n`
  assert.deepEqual(drift({ runbook: invents, variables, main }), ['runbook secret not read by infra/main.tf: old-key'])
})

test('the script reports that the runbook matches infra', () => {
  assert.equal(execFileSync(process.execPath, ['scripts/runbook.ts'], { cwd: root, encoding: 'utf8' }), 'runbook matches infra\n')
})
