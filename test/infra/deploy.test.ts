import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const workflow = read('.github/workflows/deploy.yml')
const ci = read('.github/workflows/ci.yml')
const readme = read('infra/README.md')

const steps = workflow
  .slice(workflow.indexOf('    steps:\n'))
  .split(/^(?= {6}- )/m)
  .slice(1)

const titleOf = (text: string) => (text.match(/name: (.+)\n/) ?? text.match(/uses: (\S+)/))?.[1] ?? ''
const step = (title: string) => {
  const found = steps.find((text) => titleOf(text) === title)
  assert.ok(found, title)
  return found
}
const applying = (text: string) => /^ {8}if: env\.APPLY == 'true'$/m.test(text)

test('plans on pull requests to main, after ci on main and on demand', () => {
  assert.match(workflow, /^ {2}pull_request:\n {4}branches: \[main\]$/m)
  assert.match(workflow, /^ {2}workflow_run:\n {4}workflows: \[ci\]\n {4}types: \[completed\]\n {4}branches: \[main\]$/m)
  assert.match(workflow, /^ {2}workflow_dispatch:\n {4}inputs:\n {6}apply:\n[\s\S]*?type: boolean\n {8}default: false$/m)
  assert.match(workflow, /^ {4}if: github\.event_name != 'workflow_run' \|\| \(github\.event\.workflow_run\.conclusion == 'success' && github\.event\.workflow_run\.event == 'push'\)$/m)
  assert.match(ci, /^ {2}push:\n {4}branches: \[poc, main\]$/m)
})

test('applies only on main, after ci or when asked', () => {
  assert.match(workflow, /^ {2}APPLY: \$\{\{ github\.ref == 'refs\/heads\/main' && \(github\.event_name == 'workflow_run' \|\| inputs\.apply\) \}\}$/m)
  assert.deepEqual(steps.filter(applying).map(titleOf), ['Images published', 'Terraform apply', 'azure/login@v3', 'Migrate', 'Summary'])
  assert.deepEqual(steps.filter((text) => !applying(text)).map(titleOf), ['actions/checkout@v6', 'hashicorp/setup-terraform@v4', 'Images', 'Terraform init', 'Terraform plan'])
})

test('signs in as id-finance through OIDC with read-only contents', () => {
  assert.match(workflow, /^permissions:\n {2}id-token: write\n {2}contents: read\n\n/m)
  assert.match(workflow, /^ {2}ARM_USE_OIDC: 'true'$/m)
  for (const name of ['CLIENT_ID', 'TENANT_ID', 'SUBSCRIPTION_ID']) assert.match(workflow, new RegExp(`^ {2}ARM_${name}: \\$\\{\\{ vars\\.AZURE_${name} \\}\\}$`, 'm'))
  assert.doesNotMatch(workflow, /secrets\./)
})

test('one run at a time per pull request or for main, never cancelled', () => {
  assert.match(workflow, /^concurrency:\n {2}group: terraform-finance-\$\{\{ github\.event\.pull_request\.number \|\| 'main' \}\}\n {2}cancel-in-progress: false$/m)
})

test('deploys the images and the infra of the commit that was tested', () => {
  assert.match(workflow, /^ {2}COMMIT: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}$/m)
  assert.match(step('actions/checkout@v6'), /ref: \$\{\{ env\.COMMIT \}\}/)
  assert.match(step('Images'), /TF_VAR_api_image=ghcr\.io\/mastrocola-dev\/finance-api:\$COMMIT/)
  assert.match(step('Images'), /TF_VAR_mcp_image=ghcr\.io\/mastrocola-dev\/finance-mcp:\$COMMIT/)
  assert.match(step('Images published'), /docker manifest inspect "\$TF_VAR_api_image"/)
  assert.match(step('Images published'), /docker manifest inspect "\$TF_VAR_mcp_image"/)
})

test('state in tfstate-finance with Entra auth, plan and apply wait for the lock', () => {
  const init = step('Terraform init')
  assert.match(init, /resource_group_name=\$TFSTATE_RESOURCE_GROUP/)
  assert.match(init, /storage_account_name=\$TFSTATE_STORAGE_ACCOUNT/)
  assert.match(init, /container_name=tfstate-finance/)
  assert.match(init, /key=finance\.tfstate/)
  assert.match(init, /use_azuread_auth=true/)
  assert.match(step('Terraform plan'), /-input=false \\\n\s+-lock-timeout=5m \\\n\s+-out=tfplan/)
  assert.match(step('Terraform apply'), /-lock-timeout=5m \\\n\s+-auto-approve \\\n\s+tfplan/)
  assert.match(step('hashicorp/setup-terraform@v4'), /terraform_version: 1\.16\.4/)
})

test('the migration job runs after the apply and the run fails unless it succeeded', () => {
  const migrate = step('Migrate')
  assert.ok(steps.indexOf(step('Terraform apply')) < steps.indexOf(migrate))
  assert.match(migrate, /job=\$\(terraform output -raw migrate_job\)/)
  assert.match(migrate, /az containerapp job start --name "\$job" --resource-group "\$group" --query name --output tsv/)
  assert.match(migrate, /--job-execution-name "\$execution" --query properties\.status/)
  assert.match(migrate, /test "\$status" = Succeeded\n$/)
})

test('run blocks are strict and interpolate no expression', () => {
  const runs = [...workflow.matchAll(/run: \|\n((?: {10}.*\n?)+)/g)].map((match) => match[1] ?? '')
  assert.ok(runs.length >= 7)
  for (const run of runs) {
    assert.match(run, /^ {10}set -euo pipefail\n/)
    assert.doesNotMatch(run, /\$\{\{/)
  }
})

test('actions use the majors of mastrocola-dev/infra', () => {
  const uses = new Set([...`${workflow}${ci}`.matchAll(/uses: ([\w/-]+)@(\S+)/g)].map((match) => `${match[1]}@${match[2]}`))
  for (const action of ['actions/checkout@v6', 'hashicorp/setup-terraform@v4', 'azure/login@v3']) assert.ok(uses.has(action), action)
  assert.doesNotMatch(`${workflow}${ci}`, /setup-terraform@v3/)
  assert.match(ci, /docker run --rm -v "\$PWD:\/repo" --workdir \/repo rhysd\/actionlint:[\d.]+ -color/)
})

test('the infra README lists every repository variable the workflows read', () => {
  const used = new Set([...`${workflow}${ci}`.matchAll(/vars\.([A-Z_]+)/g)].map((match) => match[1]))
  const section = readme.slice(readme.indexOf('## Repository variables'))
  const listed = new Set([...section.matchAll(/^\| `([A-Z_]+)` \|/gm)].map((match) => match[1]))
  assert.deepEqual([...listed].sort(), [...used].sort())
  assert.match(section, /`AZURE_TENANT_ID` \|[^\n]*not the External ID tenant/)
})
