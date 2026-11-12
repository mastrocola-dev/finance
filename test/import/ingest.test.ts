import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, test } from 'node:test'
import { ingestRuntime, ingestServer, runtimeEnvironment, warmIngest } from '../../src/import/ingest.ts'

const hasUv = (() => {
  try {
    execFileSync('uv', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

const probe = `import importlib.util as u, json; print(json.dumps({n: u.find_spec(n) is not None for n in ['openpyxl', 'pdfplumber', 'mcp', 'lxml', 'fpdf', 'pytest', 'ruff']}))`

describe('ingest runtime', () => {
  test('runs the server in its own environment without the dev group', () => {
    const server = ingestServer('ingest/tests/fixtures')
    assert.equal(server.command, 'uv')
    assert.deepEqual(server.args?.slice(2, 7), ['run', '--no-dev', '--exact', '--locked', '--quiet'])
    assert.deepEqual(server.args?.slice(-4, -1), ['-m', 'ingest', 'serve'])
    assert.equal(server.env?.UV_PROJECT_ENVIRONMENT, runtimeEnvironment)
    assert.match(runtimeEnvironment, /ingest\/\.venv-runtime$/)
  })

  test('gives the import agent the python of the same ingest runtime', async () => {
    const agent = JSON.parse(await readFile('agents/import/agent.json', 'utf8'))
    assert.equal(resolve(agent.mcpServers.ingest.command), join(runtimeEnvironment, 'bin', 'python'))
    assert.deepEqual(agent.mcpServers.ingest.args, ['ingest/serve.py', '{IMPORT_FOLDER}'])
  })

  test('serves one folder through the launcher the agent starts', { skip: !hasUv && 'uv is not installed' }, () => {
    const failed = (() => {
      try {
        execFileSync(join(runtimeEnvironment, 'bin', 'python'), ['ingest/serve.py', 'ingest/missing'], { encoding: 'utf8', stdio: 'pipe' })
      } catch (error) {
        return (error as { stderr: string }).stderr
      }
    })()
    assert.equal(failed, 'ingest: ingest/missing is not a folder\n')
  })

  test('has the runtime dependencies and none of the dev tools', { skip: !hasUv && 'uv is not installed' }, () => {
    const { command, args, env } = ingestRuntime(['python', '-c', probe])
    const found = JSON.parse(execFileSync(command, args, { env, encoding: 'utf8', timeout: 120000 }))
    assert.deepEqual(found, { openpyxl: true, pdfplumber: true, mcp: true, lxml: false, fpdf: false, pytest: false, ruff: false })
  })

  test('warms the runtime environment before the first upload', { skip: !hasUv && 'uv is not installed' }, async () => {
    assert.deepEqual(await warmIngest(), { ready: true })
    await access(join(runtimeEnvironment, 'pyvenv.cfg'))
  })

  test('reports a runtime that cannot start instead of throwing', async () => {
    assert.deepEqual(await warmIngest({ command: 'finance-missing-uv', args: [], env: {} }), { ready: false, cause: 'missing', reason: 'uv is not installed' })
  })

  test('says why with the first line uv wrote to stderr', async () => {
    const script = "process.stderr.write('\\n  error: The lockfile needs to be updated\\nhint: run uv lock\\n'); process.exit(2)"
    assert.deepEqual(await warmIngest({ command: process.execPath, args: ['-e', script], env: {} }), { ready: false, cause: 'failed', reason: 'error: The lockfile needs to be updated' })
  })

  test('falls back to the exit message when stderr is empty', async () => {
    const readiness = await warmIngest({ command: process.execPath, args: ['-e', 'process.exit(3)'], env: {} })
    assert.ok(!readiness.ready)
    assert.equal(readiness.cause, 'failed')
    assert.match(readiness.reason, /^Command failed: /)
  })
})
