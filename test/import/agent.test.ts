import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import type { Actor } from '../../src/db/write.ts'
import { chunkSize, type Extractor, extract, plan, runImport, type Segment, strategyOf, type Task } from '../../src/import/agent.ts'
import { recordedExtractor } from '../../src/import/recorded.ts'
import { openBatch } from '../../src/import/staging.ts'
import { testDatabase } from '../db/database.ts'
import { sample } from './sample.ts'

const [rent, pharmacy, card] = sample.candidates
const table = (rows: number): Segment => ({ id: 'table-1', kind: 'table', source: `2026-10!A1:G${rows}`, shape: { rows, columns: 7 } })
const tree: Segment = { id: 'tree-1', kind: 'tree', source: '$.accounts', shape: { items: 2, keys: ['name'] } }
const notes: Segment = { id: 'text-1', kind: 'text', source: 'L1-L95', shape: { lines: 95 } }
const usage = (inputTokens: number, outputTokens = 100) => ({ inputTokens, outputTokens, costUsdMicros: inputTokens + outputTokens })
const actor: Actor = { author: 'import' }

const recordings = [
  { source: '2026-10!A1:G3', output: { candidates: [rent, pharmacy], questions: [] }, usage: usage(1000) },
  { source: '$.accounts', output: { candidates: [card], questions: [{ question: 'Cartão é do Marcio?', options: ['Sim', 'Não'], candidate: 0 }] }, usage: usage(500) },
]

describe('import agent orchestration', () => {
  test('maps large regular segments and reads the rest record by record in chunks', () => {
    assert.equal(strategyOf(table(25)), 'mapping')
    assert.equal(strategyOf(table(5)), 'records')
    assert.equal(strategyOf({ ...tree, shape: { items: 300 } }), 'mapping')
    assert.equal(strategyOf({ ...notes, shape: { lines: 300 } }), 'records')
    const chunks = plan('notas.txt', [table(300), tree, notes])
    assert.deepEqual(
      chunks.map(({ segment, strategy, offset, limit }) => [segment.id, strategy, offset, limit]),
      [
        ['table-1', 'mapping', 0, 300],
        ['tree-1', 'records', 0, 2],
        ['text-1', 'records', 0, chunkSize],
        ['text-1', 'records', chunkSize, chunkSize],
        ['text-1', 'records', 2 * chunkSize, chunkSize],
      ],
    )
  })

  test('merges every segment, shifts question indexes and sums usage', async () => {
    const progress: number[][] = []
    const result = await extract({ file: 'a.json', segments: [table(3), tree], extractor: recordedExtractor(recordings), tokenCap: 10_000, onProgress: (done, total) => progress.push([done, total]) })
    assert.deepEqual(result.output.candidates, [rent, pharmacy, card])
    assert.equal(result.output.questions[0]?.candidate, 2)
    assert.deepEqual(result.usage, { inputTokens: 1500, outputTokens: 200, costUsdMicros: 1700 })
    assert.deepEqual(progress, [
      [1, 2],
      [2, 2],
    ])
    assert.equal(result.stopped, undefined)
    assert.deepEqual(result.failures, [])
  })

  test('keeps going past invalid output and extractor errors, with masked reasons', async () => {
    assert.ok(rent)
    const invalid = { ...rent, payload: { ...rent.payload, amountCents: -1 } }
    const extractor: Extractor = {
      extract: async ({ segment }) => {
        if (segment.kind === 'text') throw new Error('agent failed reading conta 0012345678')
        return { output: { candidates: [invalid], questions: [] }, usage: usage(10) }
      },
    }
    const result = await extract({ file: 'a', segments: [table(3), { ...notes, shape: { lines: 5 } }], extractor, tokenCap: 1000 })
    assert.deepEqual(result.output, { candidates: [], questions: [] })
    assert.equal(result.usage.inputTokens, 10)
    assert.equal(result.failures.length, 2)
    assert.match(result.failures[0]?.reason ?? '', /^invalid output: candidates\.0\.payload\.amountCents/)
    assert.deepEqual(result.failures[1], { source: 'L1-L95', offset: 0, reason: 'agent failed reading conta •5678' })
  })

  test('stops at the token cap and passes the remaining budget to each run', async () => {
    const budgets: number[] = []
    const extractor: Extractor = {
      extract: async (task: Task) => {
        budgets.push(task.maxTokens)
        return { output: { candidates: [], questions: [] }, usage: usage(400) }
      },
    }
    const result = await extract({ file: 'a', segments: [notes], extractor, tokenCap: 1000 })
    assert.deepEqual(budgets, [1000, 500])
    assert.equal(result.stopped, 'token cap')
    assert.deepEqual([result.done, result.total], [2, 3])
  })

  test('stops before the output would pass the schema limits', async () => {
    const extractor: Extractor = { extract: async () => ({ output: { candidates: Array.from({ length: 300 }, () => rent), questions: [] }, usage: usage(1) }) }
    const result = await extract({ file: 'a', segments: [notes], extractor, tokenCap: 1000 })
    assert.equal(result.stopped, 'output limit')
    assert.equal(result.output.candidates.length, 300)
  })

  test('rejects usage that is not a count of tokens', async () => {
    const extractor: Extractor = { extract: async () => ({ output: { candidates: [], questions: [] }, usage: { inputTokens: -1, outputTokens: 0, costUsdMicros: 0 } }) }
    const result = await extract({ file: 'a', segments: [tree], extractor, tokenCap: 1000 })
    assert.equal(result.failures.length, 1)
  })

  test('reports a segment without a recording', async () => {
    const result = await extract({ file: 'a', segments: [table(4)], extractor: recordedExtractor(recordings), tokenCap: 1000 })
    assert.deepEqual(result.failures, [{ source: '2026-10!A1:G4', offset: 0, reason: 'no recording for 2026-10!A1:G4@0' }])
  })
})

describe('import run against staging', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client
  const hash = 'd'.repeat(64)

  before(async () => {
    db = await testDatabase()
    client = db.client
  })

  after(() => db.drop())

  test('stages the merged output and adds usage to the batch in one audited write', async () => {
    const batch = await openBatch(client, actor, { name: 'carteira.json', format: 'json', hash })
    const run = { file: 'carteira.json', segments: [table(3), tree], extractor: recordedExtractor(recordings), tokenCap: 10_000 }
    const first = await runImport(client, actor, batch, run)
    assert.equal(first.candidates.length, 3)
    assert.equal(first.questions.length, 1)
    const linked = await client.query('select q.candidate_id = $1 as linked from import_question q where q.id = $2', [first.candidates[2], first.questions[0]])
    assert.deepEqual(linked.rows, [{ linked: true }])
    await runImport(client, actor, batch, run)
    const { rows } = await client.query('select input_tokens, output_tokens, cost_usd_micros from import_batch where id = $1', [batch])
    assert.deepEqual(rows, [{ input_tokens: 3000n, output_tokens: 400n, cost_usd_micros: 3400n }])
    const audit = await client.query<{ total: number }>("select count(*)::int as total from audit_log where entity = 'import_batch' and entity_id = $1 and action = 'update'", [batch])
    assert.equal(audit.rows[0]?.total, 2)
  })

  test('refuses a batch that is not an open draft before calling the agent', async () => {
    let called = false
    const extractor: Extractor = {
      extract: async () => {
        called = true
        return { output: { candidates: [], questions: [] }, usage: usage(1) }
      },
    }
    await assert.rejects(runImport(client, actor, 999_999n, { file: 'a', segments: [tree], extractor, tokenCap: 1000 }), /not an open draft/)
    assert.equal(called, false)
  })
})
