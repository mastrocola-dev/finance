import { readFileSync } from 'node:fs'

export type Sources = { runbook: string; variables: string; main: string }

const names = (text: string, pattern: RegExp) => new Set([...text.matchAll(pattern)].map(([, name]) => name ?? ''))

const missing = (from: Set<string>, to: Set<string>, message: string) => [...from].filter((name) => !to.has(name)).map((name) => `${message}: ${name}`)

const vaultSecrets = (main: string) => {
  const maps = [...main.matchAll(/secrets = \{([^}]*)\}/g)].map(([, body]) => body ?? '').join('\n')
  const referenced = new Set([...names(maps, /= "([a-z0-9-]+)"/g), ...names(main, /secrets\/([a-z0-9-]+)/g), ...names(main, /secret_name = "([a-z0-9-]+)"/g)])
  const created = names(main, /resource "azurerm_key_vault_secret" "\w+" \{\s*name\s+= "([a-z0-9-]+)"/g)
  return new Set([...referenced].filter((name) => !created.has(name)))
}

export const drift = ({ runbook, variables, main }: Sources) => {
  const declared = names(variables, /^variable "(\w+)"/gm)
  const listed = names(runbook, /^\| `(\w+)` \|/gm)
  const needed = vaultSecrets(main)
  const set = names(runbook, /az keyvault secret set --vault-name \S+ --name ([a-z0-9-]+)/g)
  return [...missing(declared, listed, 'variable missing from the runbook'), ...missing(listed, declared, 'runbook variable not in infra/variables.tf'), ...missing(needed, set, 'Key Vault secret the runbook does not set'), ...missing(set, needed, 'runbook secret not read by infra/main.tf')]
}

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

if (import.meta.main) {
  const problems = drift({ runbook: read('docs/deploy-azure.md'), variables: read('infra/variables.tf'), main: read('infra/main.tf') })
  for (const problem of problems) console.error(problem)
  if (problems.length > 0) process.exit(1)
  console.log('runbook matches infra')
}
