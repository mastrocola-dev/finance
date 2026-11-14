import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { addMembers } from '../../src/db/add-member.ts'
import type { Actor } from '../../src/db/write.ts'
import { casesFolder } from '../../src/eval/run.ts'
import { importFile } from '../../src/import/cli.ts'
import { commitBatch } from '../../src/import/commit.ts'
import type { Consolidator } from '../../src/import/consolidate.ts'
import { ledgerContext } from '../../src/import/context.ts'
import { recordedExtractor } from '../../src/import/recorded.ts'
import { testDatabase } from '../db/database.ts'

const hasUv = (() => {
  try {
    execFileSync('uv', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

const folder = join(casesFolder, 'monthly-xlsx')
const json = async (file: string) => JSON.parse(await readFile(join(folder, file), 'utf8'))
const bar = { questions: 3, categories: 15 }

describe('one-click import of a monthly workbook on an empty ledger', { skip: !hasUv && 'uv is not installed' }, () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client

  before(async () => {
    db = await testDatabase()
    client = db.client
    await addMembers(client, [
      { name: 'Marcio', sharePercent: 50 },
      { name: 'Gabriela', sharePercent: 50 },
    ])
  })

  after(() => db.drop())

  test('the case ledger is what an empty household sends', async () => {
    assert.deepEqual(await ledgerContext(client), await json('ledger.json'))
  })

  test('commits every entry with a category and no answers, within the question and category bar', async () => {
    const recordings = await json('recorded.json')
    const answer = await json('consolidation.json')
    const consolidator: Consolidator = { consolidate: async () => structuredClone(answer) }
    const result = await importFile(client, join(folder, 'contas-da-casa.xlsx'), { extractor: () => recordedExtractor(recordings), consolidator: () => consolidator })
    assert.deepEqual(result.failures, [])
    assert.equal(result.done, 14)
    assert.deepEqual(result.verification.totals, { checked: 4, mismatches: [] })
    assert.deepEqual(
      result.consolidation?.merges.map(({ name, to }) => `${name} → ${to}`),
      ['Mercado → Supermercado', 'Drogaria → Farmácia'],
    )
    const asked = (await client.query<{ count: number }>('select count(*)::int as count from import_question where batch_id = $1 and closed_at is null', [result.batchId])).rows[0]?.count ?? 0
    assert.ok(asked <= bar.questions, `${asked} questions`)
    const waiting = (await client.query("select kind, source from import_candidate where batch_id = $1 and closed_at is null and status not in ('accepted', 'edited')", [result.batchId])).rows
    assert.deepEqual(waiting, [])

    const member = (await client.query<{ id: bigint }>("select id from member where name = 'Marcio'")).rows[0]?.id
    const actor: Actor = { author: 'import', memberId: member }
    const committed = await commitBatch(client, actor, result.batchId)
    const expected = await json('expected.json')
    assert.equal(committed.filter(({ kind }) => kind === 'entry').length, expected.candidates.filter(({ kind }: { kind: string }) => kind === 'entry').length)
    const uncategorized = (await client.query('select description from entry where import_batch_id = $1 and category_id is null', [result.batchId])).rows
    assert.deepEqual(uncategorized, [])
    const created = (await client.query<{ name: string }>('select name from category where import_batch_id = $1 order by kind, name', [result.batchId])).rows.map(({ name }) => name)
    assert.ok(created.length <= bar.categories, `${created.length} categories`)
    assert.deepEqual(created, ['Assinaturas', 'Combustível', 'Contas da casa', 'Educação', 'Farmácia', 'Moradia', 'Pets', 'Presentes', 'Restaurantes', 'Saúde', 'Supermercado', 'Transporte', 'Freela', 'Salário'])
    const decided = (await client.query<{ answer: string; by_model: boolean }>('select answer, decided_by_model as by_model from import_question where batch_id = $1 and closed_at is null order by id', [result.batchId])).rows
    assert.deepEqual(decided, [
      { answer: 'Sim, 50/50', by_model: true },
      { answer: 'Não, é avulsa', by_model: true },
    ])
    const status = (await client.query<{ status: string }>('select status from import_batch where id = $1', [result.batchId])).rows[0]?.status
    assert.equal(status, 'committed')
  })
})
