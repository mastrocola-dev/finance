import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const script = fileURLToPath(new URL('scripts/job.sh', root))

const fakeAz = `#!/usr/bin/env bash
printf '%s\\n' "$(printf '%s|' "$@")" >> "$AZ_LOG"
case "$*" in
  *'job show'*'[name, image]'*) printf 'migrate\\tghcr.io/mastrocola-dev/finance-api:abc\\n' ;;
  *'job show'*) printf 'PGHOST=db.example.test\\nPGPORT=5432\\nPGPASSWORD=secretref:finance-db-password\\n' ;;
  *'job start'*) echo finance-migrate-e1 ;;
  *'execution show'*)
    read -ra statuses <<< "$AZ_STATUSES"
    count=$(wc -l < "$AZ_LOG")
    echo "\${statuses[$((count - 4))]:-\${statuses[-1]}}" ;;
esac
`

const run = (args: string[], statuses = 'Running Succeeded', env: Record<string, string> = {}) => {
  const folder = mkdtempSync(join(tmpdir(), 'job-'))
  writeFileSync(join(folder, 'az'), fakeAz)
  chmodSync(join(folder, 'az'), 0o755)
  const log = join(folder, 'az.log')
  const result = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${folder}:${process.env.PATH}`, AZ_LOG: log, AZ_STATUSES: statuses, JOB_POLL_SECONDS: '0', ...env },
  })
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []
  return { ...result, calls: calls.map((line) => line.split('|').slice(0, -1)) }
}

const startOf = (calls: string[][]) => calls.find((call) => call[2] === 'start') ?? []

test('runs an npm script on the job with its own image, container and database settings and waits for success', () => {
  const { status, stdout, calls } = run(['member:add', 'Marcio', '50', 'Gabriela', '50'])
  assert.equal(status, 0)
  assert.deepEqual(startOf(calls), [
    'containerapp',
    'job',
    'start',
    '-g',
    'rg-finance-dev',
    '-n',
    'finance-migrate',
    '--image',
    'ghcr.io/mastrocola-dev/finance-api:abc',
    '--container-name',
    'migrate',
    '--env-vars',
    'PGHOST=db.example.test',
    'PGPORT=5432',
    'PGPASSWORD=secretref:finance-db-password',
    '--command',
    'npm',
    '--args',
    'run',
    'member:add',
    'Marcio',
    '50',
    'Gabriela',
    '50',
    '--query',
    'name',
    '-o',
    'tsv',
  ])
  assert.equal(calls.filter((call) => call[2] === 'execution').length, 2)
  assert.match(stdout, /^started finance-migrate-e1: npm run member:add Marcio 50 Gabriela 50 on ghcr\.io\/mastrocola-dev\/finance-api:abc$/m)
  assert.match(stdout, /^finance-migrate-e1 Succeeded$/m)
})

test('a failed execution fails the script', () => {
  const { status, stderr } = run(['member:link', 'Gabriela', 'oid'], 'Running Failed')
  assert.equal(status, 1)
  assert.match(stderr, /finance-migrate-e1 Failed/)
})

test('drops a bare -- and honours another group, job and image', () => {
  const { calls } = run(['member:link', '--', 'Marcio', 'oid'], 'Succeeded', { JOB_GROUP: 'rg-x', JOB_NAME: 'x-migrate', JOB_IMAGE: 'ghcr.io/x:old' })
  const start = startOf(calls)
  assert.deepEqual(start.slice(3, 9), ['-g', 'rg-x', '-n', 'x-migrate', '--image', 'ghcr.io/x:old'])
  assert.deepEqual(start.slice(start.indexOf('--args'), start.indexOf('--query')), ['--args', 'run', 'member:link', 'Marcio', 'oid'])
})

test('refuses to run without a script, or to seed or reset the database, before calling az', () => {
  for (const args of [[], ['db:seed'], ['db:reset']]) {
    const { status, calls } = run(args)
    assert.equal(status, 2, args.join(' '))
    assert.deepEqual(calls, [])
  }
})

test('the runbook runs members and links through the script', () => {
  const runbook = readFileSync(new URL('docs/deploy-azure.md', root), 'utf8')
  for (const line of ['scripts/job.sh member:add Marcio 50 Gabriela 50', 'scripts/job.sh member:link Marcio <Marcio object ID>', 'scripts/job.sh member:link Gabriela <Gabriela object ID>']) assert.ok(runbook.includes(line), line)
  assert.match(runbook, /^## First day on Azure$/m)
})

test('npm run check parses every script and runs shellcheck when it is installed', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
  assert.match(scripts.check, /&& node scripts\/shellcheck\.ts$/)
  const folder = mkdtempSync(join(tmpdir(), 'shell-'))
  mkdirSync(join(folder, 'scripts'))
  writeFileSync(join(folder, 'scripts', 'broken.sh'), 'if then\n')
  const broken = spawnSync('node', [fileURLToPath(new URL('scripts/shellcheck.ts', root))], { cwd: folder, encoding: 'utf8' })
  assert.equal(broken.status, 1)
  assert.match(broken.stderr, /broken\.sh/)
})

test('CI fails the check when shellcheck is missing', () => {
  const folder = mkdtempSync(join(tmpdir(), 'shell-'))
  mkdirSync(join(folder, 'scripts'))
  mkdirSync(join(folder, 'bin'))
  writeFileSync(join(folder, 'scripts', 'fine.sh'), 'echo fine\n')
  symlinkSync(execFileSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).trim(), join(folder, 'bin', 'bash'))
  const checker = fileURLToPath(new URL('scripts/shellcheck.ts', root))
  const local = spawnSync(process.execPath, [checker], { cwd: folder, encoding: 'utf8', env: { PATH: join(folder, 'bin') } })
  assert.equal(local.status, 0)
  assert.match(local.stdout, /shellcheck not found: scripts\/fine\.sh only parsed with bash -n/)
  const ci = spawnSync(process.execPath, [checker], { cwd: folder, encoding: 'utf8', env: { PATH: join(folder, 'bin'), CI: 'true' } })
  assert.equal(ci.status, 1)
  assert.match(ci.stderr, /CI must run it/)
})
