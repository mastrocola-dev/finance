import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, test } from 'node:test'
import { ExtractionError, extract, type Segment, type Task } from '../../src/import/agent.ts'
import { childEnvironment, defaultCli, renderAgent, run, serviceAgentExtractor, usageOf } from '../../src/import/service-agent.ts'
import { sample } from './sample.ts'

const cli = 'test/import/fake-agent.ts'
const spent = { inputTokens: 1200, outputTokens: 300, costUsdMicros: 8100 }
const segment = (source: string): Segment => ({ id: 'table-1', kind: 'table', source, shape: { rows: 3, columns: 4 } })
const task = (source: string): Task => ({ file: 'extrato.csv', segment: segment(source), strategy: 'records', offset: 0, limit: 3, maxTokens: 5000 })

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    assert.ok(error instanceof ExtractionError)
    return error
  }
  assert.fail('expected the run to fail')
}

describe('service-agent adapter', () => {
  test('runs a copy of the agent with the folder in its ingest server, the task on stdin and no database', async () => {
    const result = await run({ folder: 'ingest/tests/fixtures', cli }, task('echo'))
    assert.deepEqual(result.usage, spent)
    const echo = (result.output as { echo: { dir: string } }).echo
    assert.deepEqual(echo, { dir: echo.dir, files: ['agent.json', 'output.schema.json', 'system.md'], folder: resolve('ingest/tests/fixtures'), database: null, maxRunTokens: 5000, maxTokens: 5000, offset: 0 })
    assert.notEqual(echo.dir, 'agents/import')
    assert.equal(existsSync(echo.dir), false)
  })

  test('renders the folder and the remaining batch budget into the agent and keeps the template as service-agent reads it', async () => {
    const template = JSON.parse(await readFile('agents/import/agent.json', 'utf8'))
    assert.deepEqual(Object.keys(template).sort(), ['maxRunTokens', 'maxSteps', 'maxTokens', 'mcpServers', 'model', 'runTimeoutMs', 'toolTimeoutMs'])
    assert.deepEqual(Object.keys(template.mcpServers.ingest).sort(), ['args', 'command', 'tools'])
    const { dir, model } = await renderAgent('agents/import', 'pasta "x"')
    const rendered = JSON.parse(await readFile(`${dir}/agent.json`, 'utf8'))
    assert.equal(model, 'claude-sonnet-4-5')
    assert.deepEqual(rendered, { ...template, mcpServers: { ingest: { ...template.mcpServers.ingest, args: ['ingest/serve.py', resolve('pasta "x"')] } } })
    assert.equal(childEnvironment(dir).TRACE_DIR, `${dir}/traces`)
    const capped = await renderAgent('agents/import', '.', 5000)
    assert.equal(JSON.parse(await readFile(`${capped.dir}/agent.json`, 'utf8')).maxRunTokens, 5000)
    await Promise.all([dir, capped.dir].map((path) => rm(path, { recursive: true })))
  })

  test('counts cache tokens as input and prices runs service-agent could not price', () => {
    const usage = { input: 1000, output: 2000, cacheWrite: 100, cacheRead: 900 }
    assert.deepEqual(usageOf('claude-sonnet-4-5', { type: 'run.end', usage, costUsd: null }), { inputTokens: 2000, outputTokens: 2000, costUsdMicros: 33645 })
    assert.deepEqual(usageOf('claude-sonnet-4-5', { type: 'run.end', usage, costUsd: 0.01 }).costUsdMicros, 10000)
    assert.equal(usageOf('unknown', { type: 'run.end', usage, costUsd: null }).costUsdMicros, 0)
  })

  test('reports the traced usage and a masked reason when the run fails', async () => {
    const error = await failure(run({ folder: '.', cli }, task('fail')))
    assert.deepEqual(error.usage, spent)
    assert.equal(error.message, 'model refused •7890')
  })

  test('rejects a reply that is not JSON, a crash before the trace, a missing CLI and a run past the timeout', async () => {
    const garbage = await failure(run({ folder: '.', cli }, task('garbage')))
    assert.equal(garbage.message, 'service-agent reply is not JSON')
    assert.deepEqual(garbage.usage, spent)
    const crash = await failure(run({ folder: '.', cli }, task('crash')))
    assert.equal(crash.message, 'service-agent exited with 1: Error: Invalid agent config')
    assert.equal(crash.usage.inputTokens, 0)
    assert.match((await failure(run({ folder: '.', cli: 'test/import/missing.ts' }, task('echo')))).message, /^service-agent exited with 1: Error: Cannot find module/)
    assert.throws(() => serviceAgentExtractor({ folder: '.', cli: 'test/import/missing.ts' }), /service-agent CLI not found at test\/import\/missing.ts/)
    assert.match((await failure(run({ folder: '.', cli, timeoutMs: 300 }, task('hang')))).message, /stopped by SIGTERM/)
  })

  test('extract charges the usage of failed runs and keeps the good ones', async () => {
    const result = await extract({ file: 'extrato.csv', segments: [segment('fail'), segment('ok')], extractor: serviceAgentExtractor({ folder: '.', cli }), tokenCap: 100_000 })
    assert.deepEqual(result.usage, { inputTokens: 2400, outputTokens: 600, costUsdMicros: 16200 })
    assert.equal(result.output.candidates.length, sample.candidates.length)
    assert.deepEqual(result.failures, [{ source: 'fail', offset: 0, reason: 'model refused •7890' }])
  })

  test('finds the CLI from SERVICE_AGENT_CLI with a sibling checkout as default', () => {
    const previous = process.env.SERVICE_AGENT_CLI
    try {
      delete process.env.SERVICE_AGENT_CLI
      assert.equal(defaultCli(), resolve('../service-agent/src/cli.ts'))
      process.env.SERVICE_AGENT_CLI = '/opt/agent/cli.ts'
      assert.equal(defaultCli(), '/opt/agent/cli.ts')
    } finally {
      if (previous === undefined) delete process.env.SERVICE_AGENT_CLI
      else process.env.SERVICE_AGENT_CLI = previous
    }
  })
})
