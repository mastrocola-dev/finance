import { readdirSync, readFileSync } from 'node:fs'

export type Sources = { runbook: string; variables: string; main: string; workflows: string }

const names = (text: string, pattern: RegExp) => new Set([...text.matchAll(pattern)].map(([, name]) => name ?? ''))

const missing = (from: Set<string>, to: Set<string>, message: string) => [...from].filter((name) => !to.has(name)).map((name) => `${message}: ${name}`)

const vaultSecrets = (main: string) => {
  const maps = [...main.matchAll(/secrets = \{([^}]*)\}/g)].map(([, body]) => body ?? '').join('\n')
  const referenced = new Set([...names(maps, /= "([a-z0-9-]+)"/g), ...names(main, /secrets\/([a-z0-9-]+)/g), ...names(main, /secret_name = "([a-z0-9-]+)"/g)])
  const created = names(main, /resource "azurerm_key_vault_secret" "\w+" \{\s*name\s+= "([a-z0-9-]+)"/g)
  return new Set([...referenced].filter((name) => !created.has(name)))
}

const requiredVariables = (variables: string) =>
  new Set(
    variables
      .split(/^(?=variable ")/m)
      .filter((block) => !/^\s+default\s+=/m.test(block))
      .flatMap((block) => [...block.matchAll(/^variable "(\w+)"/g)].map(([, name]) => name ?? '')),
  )

export const drift = ({ runbook, variables, main, workflows }: Sources) => {
  const declared = names(variables, /^variable "(\w+)"/gm)
  const listed = names(runbook, /^\| `([a-z0-9_]+)` \|/gm)
  const required = requiredVariables(variables)
  const listedRequired = names(runbook, /^\| `([a-z0-9_]+)` \| yes \|/gm)
  const passed = names(workflows, /TF_VAR_(\w+)/g)
  const repository = names(workflows, /vars\.([A-Z0-9_]+)/g)
  const listedRepository = names(runbook, /^\| `([A-Z0-9_]+)` \|/gm)
  const needed = vaultSecrets(main)
  const set = names(runbook, /az keyvault secret set --vault-name \S+ --name ([a-z0-9-]+)/g)
  return [
    ...missing(declared, listed, 'variable missing from the runbook'),
    ...missing(listed, declared, 'runbook variable not in infra/variables.tf'),
    ...missing(required, listedRequired, 'required variable the runbook marks optional'),
    ...missing(listedRequired, required, 'runbook marks required a variable with a default'),
    ...missing(required, passed, 'required variable the deploy workflow does not set'),
    ...missing(passed, declared, 'workflow sets a variable not in infra/variables.tf'),
    ...missing(repository, listedRepository, 'repository variable missing from the runbook'),
    ...missing(listedRepository, repository, 'runbook repository variable no workflow reads'),
    ...missing(needed, set, 'Key Vault secret the runbook does not set'),
    ...missing(set, needed, 'runbook secret not read by infra/main.tf'),
  ]
}

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

export const workflowsText = () =>
  readdirSync(new URL('../.github/workflows/', import.meta.url))
    .filter((name) => name.endsWith('.yml'))
    .sort()
    .map((name) => read(`.github/workflows/${name}`))
    .join('\n')

if (import.meta.main) {
  const problems = drift({ runbook: read('docs/deploy-azure.md'), variables: read('infra/variables.tf'), main: read('infra/main.tf'), workflows: workflowsText() })
  for (const problem of problems) console.error(problem)
  if (problems.length > 0) process.exit(1)
  console.log('runbook matches infra')
}
