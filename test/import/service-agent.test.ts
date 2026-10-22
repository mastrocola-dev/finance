import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { describe, test } from 'node:test'
import { ExtractionError, extract, type Segment, type Task } from '../../src/import/agent.ts'
import { defaultCli, run, serviceAgentExtractor } from '../../src/import/service-agent.ts'
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
  test('passes the task on stdin and reads { output, usage } without the database in the environment', async () => {
    const result = await run({ folder: 'ingest/tests/fixtures', cli }, task('echo'))
    assert.deepEqual(result.usage, spent)
    assert.deepEqual((result.output as { echo: unknown }).echo, { args: ['--agent-dir', 'agents/import'], folder: resolve('ingest/tests/fixtures'), database: null, maxTokens: 5000, offset: 0 })
  })

  test('reports usage and a masked reason when the run fails', async () => {
    const error = await failure(run({ folder: '.', cli }, task('fail')))
    assert.deepEqual(error.usage, spent)
    assert.equal(error.message, 'model refused •7890: budget exceeded')
  })

  test('rejects a reply that is not JSON, a missing CLI and a run past the timeout', async () => {
    const garbage = await failure(run({ folder: '.', cli }, task('garbage')))
    assert.match(garbage.message, /reply is not \{ output, usage \} JSON/)
    assert.equal(garbage.usage.inputTokens, 0)
    assert.match((await failure(run({ folder: '.', cli: 'test/import/missing.ts' }, task('echo')))).message, /^service-agent exited with 1: Error: Cannot find module/)
    assert.throws(() => serviceAgentExtractor({ folder: '.', cli: 'test/import/missing.ts' }), /service-agent CLI not found at test\/import\/missing.ts/)
    assert.match((await failure(run({ folder: '.', cli, timeoutMs: 300 }, task('hang')))).message, /stopped by SIGTERM/)
  })

  test('extract charges the usage of failed runs and keeps the good ones', async () => {
    const result = await extract({ file: 'extrato.csv', segments: [segment('fail'), segment('ok')], extractor: serviceAgentExtractor({ folder: '.', cli }), tokenCap: 100_000 })
    assert.deepEqual(result.usage, { inputTokens: 2400, outputTokens: 600, costUsdMicros: 16200 })
    assert.equal(result.output.candidates.length, sample.candidates.length)
    assert.deepEqual(result.failures, [{ source: 'fail', offset: 0, reason: 'model refused •7890: budget exceeded' }])
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
