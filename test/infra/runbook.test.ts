import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { drift, workflowsText } from '../../scripts/runbook.ts'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const sources = { runbook: read('docs/deploy-azure.md'), variables: read('infra/variables.tf'), main: read('infra/main.tf'), workflows: workflowsText() }

const variables = 'variable "name" {\n  type    = string\n  default = "finance"\n}\n\nvariable "location" {\n  type = string\n}\n'
const main = 'locals {\n  secrets = {\n    SESSION_KEY = "session-key"\n  }\n}\n\nresource "azurerm_key_vault_secret" "database_url" {\n  name         = "database-url"\n}\n\nsecret_name = "database-url"\nkey_vault_secret_id = "https://kv/secrets/registry-password"\n'
const workflows = 'env:\n  ARM_CLIENT_ID: vars.AZURE_CLIENT_ID\n  TF_VAR_location: vars.REGION\n'
const runbook = '| `AZURE_CLIENT_ID` | id |\n| `REGION` | region |\n\n| `name` | no |\n| `location` | yes |\n\naz keyvault secret set --vault-name <vault> --name session-key --file a\naz keyvault secret set --vault-name <vault> --name registry-password --file b\n'

test('the runbook and the terraform agree on every variable and secret', () => {
  assert.deepEqual(drift(sources), [])
  for (const secret of ['finance-db-password', 'finance-session-key', 'finance-web-secret', 'anthropic-api-key-finance', 'finance-extract-key']) assert.match(sources.runbook, new RegExp(`--name ${secret} .*--expires `), secret)
  assert.doesNotMatch(sources.runbook, /--name (database-url|registry-password|session-key|anthropic-api-key) /)
  assert.match(sources.runbook, /\[docs\/acceptance.md\]\(acceptance.md\) section 8/)
  assert.match(read('docs/acceptance.md'), /^## 8\. On Azure/m)
})

test('the runbook steps run in order and the other documents point at the right ones', () => {
  const steps = [...sources.runbook.matchAll(/^## (\d+)\. (.+)$/gm)].map(([, number, title]) => `${number}. ${title}`)
  assert.deepEqual(steps, [
    '0. Tools and accounts',
    '1. Entra External ID tenant with Google',
    '2. App registrations',
    '3. Images on GHCR, public',
    '4. Bootstrap',
    '5. Repository variables',
    '6. Terraform variables',
    '7. Merge `poc` into `main`',
    '8. The deploy run',
    '9. Redirect URI',
    '10. First sign-in of each person',
    '11. Members',
    '12. Link members to their sign-in',
    '13. Checks',
    '14. Claude connector',
    '15. Acceptance',
  ])
  for (const text of ['infra PR #22', 'az provider register --namespace Microsoft.App', 'caixafinance', '<api_url>/auth/callback', '--env-vars $DB --command npm --args run member:add Marcio 50 Gabriela 50', '--env-vars $DB --command npm --args run member:link Gabriela', 'secretref:finance-db-password'])
    assert.ok(sources.runbook.includes(text), text)
  const acceptance = read('docs/acceptance.md')
  for (const text of ['After steps 1 to 14 of', '(step 12 of the runbook)', 'connector of runbook step 14']) assert.ok(acceptance.includes(text), text)
  assert.match(read('infra/README.md'), /all five values before the first apply \(runbook step 4\)/)
})

test('drift is empty when both sides list the same names', () => {
  assert.deepEqual(drift({ runbook, variables, main, workflows }), [])
})

test('drift names variables missing on either side', () => {
  assert.deepEqual(drift({ runbook: runbook.replace('| `location` | yes |\n', '| `region` | yes |\n'), variables, main, workflows }), [
    'variable missing from the runbook: location',
    'runbook variable not in infra/variables.tf: region',
    'required variable the runbook marks optional: location',
    'runbook marks required a variable with a default: region',
  ])
})

test('drift names a required column that disagrees with the defaults', () => {
  assert.deepEqual(drift({ runbook: runbook.replace('| `name` | no |', '| `name` | yes |').replace('| `location` | yes |', '| `location` | no |'), variables, main, workflows }), ['required variable the runbook marks optional: location', 'runbook marks required a variable with a default: name'])
})

test('drift names required variables the workflow does not set and variables it sets that terraform lacks', () => {
  const unset = workflows.replace('TF_VAR_location', 'TF_VAR_region')
  assert.deepEqual(drift({ runbook, variables, main, workflows: unset }), ['required variable the deploy workflow does not set: location', 'workflow sets a variable not in infra/variables.tf: region'])
})

test('drift names repository variables missing on either side', () => {
  const read = workflows.replace('vars.REGION', 'vars.AZURE_REGION')
  assert.deepEqual(drift({ runbook, variables, main, workflows: read }), ['repository variable missing from the runbook: AZURE_REGION', 'runbook repository variable no workflow reads: REGION'])
})

test('drift names secrets the runbook forgets or invents, but not the ones terraform creates', () => {
  const forgets = runbook.replace(/.*registry-password.*\n/, '')
  assert.deepEqual(drift({ runbook: forgets, variables, main, workflows }), ['Key Vault secret the runbook does not set: registry-password'])
  const invents = `${runbook}az keyvault secret set --vault-name <vault> --name old-key --file c\n`
  assert.deepEqual(drift({ runbook: invents, variables, main, workflows }), ['runbook secret not read by infra/main.tf: old-key'])
})

test('the script reports that the runbook matches infra', () => {
  assert.equal(execFileSync(process.execPath, ['scripts/runbook.ts'], { cwd: root, encoding: 'utf8' }), 'runbook matches infra\n')
})
