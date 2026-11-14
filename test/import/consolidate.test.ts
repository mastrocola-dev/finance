import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { seed } from '../../src/db/seed.ts'
import type { Actor } from '../../src/db/write.ts'
import { ExtractionError } from '../../src/import/agent.ts'
import { commitBatch } from '../../src/import/commit.ts'
import { type ConsolidateTask, type Consolidator, consolidateBatch } from '../../src/import/consolidate.ts'
import { editCandidate, reviewCandidates } from '../../src/import/review.ts'
import { openBatch, stageOutput } from '../../src/import/staging.ts'
import { verifyBatch } from '../../src/import/verify.ts'
import { testDatabase } from '../db/database.ts'
import { freshHash } from './sample.ts'

const importer: Actor = { author: 'import' }
const spent = { inputTokens: 900, outputTokens: 120, costUsdMicros: 4500 }

const category = (name: string, kind = 'expense') => ({ kind: 'category', source: `cat!${name}`, confidence: 0.95, payload: { name, kind } })
const entry = (description: string, name: string, amountCents = 2000) => ({ kind: 'entry', source: `out!${description}`, confidence: 0.95, payload: { date: '2026-10-14', description, direction: 'expense', amountCents, category: name, member: 'joint', paid: true } })
const mapping = (pairs: [string, string][]) => ({ categories: pairs.map(([name, to]) => ({ name, kind: 'expense', to })) })

const recorded = (output: unknown, seen: ConsolidateTask[] = []): Consolidator => ({
  consolidate: async (task) => {
    seen.push(task)
    return { output: structuredClone(output), usage: spent }
  },
})

describe('import consolidation', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client
  let member: Actor

  before(async () => {
    db = await testDatabase()
    client = db.client
    await seed(client)
    const id = (await client.query<{ id: bigint }>("select id from member where name = 'Marcio'")).rows[0]?.id
    assert.ok(id)
    member = { author: 'import', memberId: id }
  })

  after(() => db.drop())

  const staged = async (candidates: ReturnType<typeof entry | typeof category>[], totals: Record<string, unknown>[] = []) => {
    const batch = await openBatch(client, importer, { name: 'outubro.xlsx', format: 'xlsx', hash: freshHash() })
    await stageOutput(client, importer, batch, { candidates, questions: [], totals })
    await verifyBatch(client, importer, batch)
    return batch
  }
  const open = async (batch: bigint) =>
    (await client.query<{ kind: string; name: string | null; category: string | null }>("select kind, payload->>'name' as name, payload->>'category' as category from import_candidate where batch_id = $1 and closed_at is null order by id", [batch])).rows.map((row) =>
      row.kind === 'category' ? `category ${row.name}` : `${row.kind} ${row.category}`,
    )
  const batchRow = async (batch: bigint) => (await client.query('select consolidation, totals, input_tokens::int as input, cost_usd_micros::int as cost from import_batch where id = $1', [batch])).rows[0]

  test('merges near-duplicates into an existing category and rewrites entries and totals in one audited write', async () => {
    const batch = await staged([category('Farmácia'), category('Drogaria'), entry('Drogasil', 'Drogaria'), entry('Droga Raia', 'Farmácia'), entry('Dipirona', 'Remédios'), category('Pets'), entry('Ração', 'Pets')], [{ source: 'C9', month: '2026-10-01', direction: 'expense', category: 'Drogaria', amountCents: 2000 }])
    const audits = Number((await client.query('select count(*) from audit_log')).rows[0]?.count)
    const seen: ConsolidateTask[] = []
    const result = await consolidateBatch(
      client,
      importer,
      batch,
      recorded(
        mapping([
          ['Farmácia', 'Saúde'],
          ['Drogaria', 'Saúde'],
          ['Remédios', 'saude'],
          ['Pets', 'Pets'],
        ]),
        seen,
      ),
      50_000,
    )
    assert.deepEqual(
      seen[0]?.categories.map(({ name, samples }) => [name, samples]),
      [
        ['Farmácia', ['Droga Raia']],
        ['Drogaria', ['Drogasil']],
        ['Pets', ['Ração']],
        ['Remédios', ['Dipirona']],
      ],
    )
    assert.equal(seen[0]?.maxTokens, 50_000)
    assert.ok(seen[0]?.existing.some((item) => item.name === 'Saúde' && item.kind === 'expense'))
    assert.deepEqual(
      result.merges.map(({ name, to, candidates }) => [name, to, candidates]),
      [
        ['Farmácia', 'Saúde', 1],
        ['Drogaria', 'Saúde', 1],
        ['Remédios', 'Saúde', 1],
      ],
    )
    assert.deepEqual(await open(batch), ['entry Saúde', 'entry Saúde', 'entry Saúde', 'category Pets', 'entry Pets'])
    const row = await batchRow(batch)
    assert.deepEqual(row?.totals, [])
    assert.deepEqual(
      row?.consolidation.unchecked.map((item: { category: string }) => item.category),
      ['Drogaria'],
    )
    assert.equal(row?.consolidation.merges.length, 3)
    assert.equal(row?.input, 900)
    assert.equal(row?.cost, 4500)
    const written = (await client.query('select entity, action from audit_log order by id offset $1', [audits])).rows
    assert.ok(written.every((item) => item.entity === 'import_candidate' || item.entity === 'import_batch'))
    assert.equal(written.filter((item) => item.entity === 'import_batch').length, 1)
    const verified = await verifyBatch(client, importer, batch)
    assert.equal(verified.created, 0)
    assert.equal(verified.totals.mismatches.length, 0)
    const pending = (await client.query<{ id: bigint }>("select id from import_candidate where batch_id = $1 and closed_at is null and status = 'pending'", [batch])).rows.map((row) => row.id)
    await reviewCandidates(client, member, batch, pending, 'accept')
    await commitBatch(client, member, batch)
    const saude = (await client.query("select count(*)::int as n from entry e join category c on c.id = e.category_id where c.name = 'Saúde' and e.description in ('Drogasil', 'Droga Raia', 'Dipirona')")).rows[0]?.n
    assert.equal(saude, 3)
  })

  test('folds new names into one new category, keeping the one already named so', async () => {
    const total = (name: string, amountCents: number) => ({ source: `T!${name}`, month: '2026-10-01', direction: 'expense', category: name, amountCents })
    const batch = await staged([category('Uber'), category('Transporte app'), category('Aplicativos'), category('Bichos'), entry('Uber centro', 'Uber'), entry('Corrida', 'Transporte app'), entry('Corrida 2', 'Aplicativos'), entry('Ração', 'Bichos', 3000)], [total('Aplicativos', 2000), total('Bichos', 3000)])
    const result = await consolidateBatch(
      client,
      importer,
      batch,
      recorded(
        mapping([
          ['Uber', 'Corridas'],
          ['Transporte app', 'Corridas'],
          ['Aplicativos', 'Aplicativos'],
          ['Bichos', 'Animais'],
        ]),
      ),
      50_000,
    )
    assert.deepEqual(await open(batch), ['category Corridas', 'category Aplicativos', 'category Animais', 'entry Corridas', 'entry Corridas', 'entry Aplicativos', 'entry Animais'])
    assert.deepEqual(
      result.merges.map(({ name, to }) => `${name} → ${to}`),
      ['Uber → Corridas', 'Transporte app → Corridas', 'Bichos → Animais'],
    )
    assert.deepEqual(
      (await batchRow(batch))?.totals.map((item: { category: string }) => item.category),
      ['Aplicativos', 'Animais'],
    )
    assert.equal((await verifyBatch(client, importer, batch)).totals.mismatches.length, 0)
  })

  test('keeps the extraction when the call fails or answers badly, charging what it spent', async () => {
    const failing: Consolidator = {
      consolidate: async () => {
        throw new ExtractionError('model refused 1234567890', spent)
      },
    }
    const batch = await staged([category('Pets'), entry('Ração', 'Pets')])
    const failed = await consolidateBatch(client, importer, batch, failing, 50_000)
    assert.equal(failed.failure, 'model refused •7890')
    assert.deepEqual(await open(batch), ['category Pets', 'entry Pets'])
    assert.deepEqual((await batchRow(batch))?.consolidation, { merges: [], unchecked: [], failure: 'model refused •7890' })
    assert.equal((await batchRow(batch))?.input, 900)
    const invalid = await consolidateBatch(client, importer, batch, recorded({ categories: [{ name: 'Pets', to: 'Animais' }] }), 50_000)
    assert.match(String(invalid.failure), /^invalid output/)
    assert.deepEqual(await open(batch), ['category Pets', 'entry Pets'])
    assert.equal((await batchRow(batch))?.input, 1800)
  })

  test('makes no call without new categories or without tokens left', async () => {
    const never: Consolidator = {
      consolidate: async () => {
        throw new Error('called')
      },
    }
    const plain = await staged([entry('Feira', 'Alimentação')])
    assert.deepEqual(await consolidateBatch(client, importer, plain, never, 50_000), { merges: [], failure: null, usage: { inputTokens: 0, outputTokens: 0, costUsdMicros: 0 } })
    const capped = await staged([category('Pets'), entry('Ração', 'Pets')])
    assert.equal((await consolidateBatch(client, importer, capped, never, 0)).failure, 'token cap')
  })

  test('leaves candidates a person edited and names the model did not map', async () => {
    const batch = await staged([category('Farmácia'), category('Viagens'), entry('Drogasil', 'Farmácia'), entry('Droga Raia', 'Farmácia')])
    const edited = (await client.query<{ id: bigint; payload: Record<string, unknown> }>("select id, payload from import_candidate where batch_id = $1 and payload->>'description' = 'Droga Raia'", [batch])).rows[0]
    assert.ok(edited)
    await editCandidate(client, member, batch, edited.id, { ...edited.payload, amountCents: 2500 })
    await consolidateBatch(
      client,
      importer,
      batch,
      recorded(
        mapping([
          ['Farmácia', 'Saúde'],
          ['Desconhecida', 'Lazer'],
        ]),
      ),
      50_000,
    )
    assert.deepEqual(await open(batch), ['category Viagens', 'entry Saúde', 'entry Farmácia'])
  })
})
