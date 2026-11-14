import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'

const scripts = readdirSync('scripts')
  .filter((name) => name.endsWith('.sh'))
  .map((name) => `scripts/${name}`)

const run = (command: string, args: string[]) => spawnSync(command, args, { stdio: 'inherit' })

const parsed = scripts.every((script) => run('bash', ['-n', script]).status === 0)
const linter = spawnSync('shellcheck', ['--version']).status === 0

if (!parsed) process.exitCode = 1
else if (linter) process.exitCode = run('shellcheck', scripts).status ?? 1
else if (process.env.CI) {
  console.error('shellcheck not found: CI must run it')
  process.exitCode = 1
} else console.log(`shellcheck not found: ${scripts.join(', ')} only parsed with bash -n`)
