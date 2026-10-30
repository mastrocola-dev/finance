import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import type { Task } from '../../src/import/agent.ts'
import { run } from '../../src/import/service-agent.ts'

const cli = resolve(process.env.SERVICE_AGENT_CLI ?? '../service-agent/src/cli.ts')
const installed = existsSync(cli) && existsSync(resolve(dirname(cli), '../node_modules')) && existsSync('ingest/.venv-runtime/bin/python')
const required = process.env.SERVICE_AGENT_REQUIRED === 'true'
const usage = { input_tokens: 900, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 100 }
const answer = { candidates: [], questions: [], totals: [] }

const reply = (step: number) => ({
  id: `msg_${step}`,
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-4-5',
  stop_reason: step === 0 ? 'tool_use' : 'end_turn',
  stop_sequence: null,
  usage,
  content: step === 0 ? [{ type: 'tool_use', id: 'toolu_1', name: 'ingest__list_segments', input: { file: 'extrato.csv' } }] : [{ type: 'text', text: JSON.stringify(answer) }],
})

test('the real service-agent CLI loads the import agent and reaches the ingest tools', { skip: !installed && !required && 'no sibling service-agent checkout with modules' }, async () => {
  const requests: { tools: { name: string }[]; messages: { content: unknown }[] }[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      requests.push(JSON.parse(body))
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify(reply(requests.length - 1)))
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const keys = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL }
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    const task: Task = { file: 'extrato.csv', segment: { id: 'table-1', kind: 'table', source: 'table-1', shape: { rows: 3 } }, strategy: 'records', offset: 0, limit: 3, maxTokens: 5000 }
    const result = await run({ folder: 'ingest/tests/fixtures', cli, timeoutMs: 60_000 }, task)
    assert.deepEqual(result, { output: answer, usage: { inputTokens: 2000, outputTokens: 200, costUsdMicros: 8460 } })
    assert.deepEqual((requests[0]?.tools ?? []).map(({ name }) => name).sort(), ['ingest__apply_mapping', 'ingest__list_segments', 'ingest__read_segment'])
    assert.match(JSON.stringify(requests[1]?.messages.at(-1)?.content), /tool_result.*segments/)
  } finally {
    server.close()
    for (const [key, value] of Object.entries(keys)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
