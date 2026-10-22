import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import type { Actor } from '../../src/db/write.ts'
import { maskDigits, openBatch, stageOutput } from '../../src/import/staging.ts'
import { listAudit } from '../../src/ledger/audit.ts'
import { testDatabase } from '../db/database.ts'
import { sample } from './sample.ts'

const actor: Actor = { author: 'import' }
const hash = 'c'.repeat(64)

describe('import staging', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client

  before(async () => {
    db = await testDatabase()
    client = db.client
  })

  after(() => db.drop())

  const count = async (table: string) => (await client.query<{ total: number }>(`select count(*)::int as total from ${table}`)).rows[0]?.total ?? 0

  test('masks digit runs except dates and amounts', () => {
    assert.equal(maskDigits('conta 0012345678.csv'), 'conta •5678.csv')
    assert.equal(maskDigits('extrato-20261001.ofx'), 'extrato-20261001.ofx')
    assert.equal(maskDigits('R$ 15000,00 do cartão 4111111111111111?'), 'R$ 15000,00 do cartão •1111?')
  })

  test('opens a draft batch with a masked file name and an audit row', async () => {
    const id = await openBatch(client, actor, { name: 'cartao-4111111111111111.csv', format: 'csv', hash })
    const { rows } = await client.query('select file_name, status, input_tokens from import_batch where id = $1', [id])
    assert.deepEqual(rows, [{ file_name: 'cartao-•1111.csv', status: 'draft', input_tokens: 0n }])
    const audit = await client.query("select author, action, after->>'file_name' as name from audit_log where entity = 'import_batch' and entity_id = $1", [id])
    assert.deepEqual(audit.rows, [{ author: 'import', action: 'create', name: 'cartao-•1111.csv' }])
  })

  test('refuses unknown formats and malformed hashes', async () => {
    await assert.rejects(openBatch(client, actor, { name: 'a.doc', format: 'doc' as 'csv', hash }), /unsupported format/)
    await assert.rejects(openBatch(client, actor, { name: 'a.csv', format: 'csv', hash: 'abc' }), /sha-256/)
  })

  test('stages candidates and questions in one audited transaction', async () => {
    const batch = await openBatch(client, actor, { name: 'planilha.xlsx', format: 'xlsx', hash })
    const before = await count('audit_log')
    const staged = await stageOutput(client, actor, batch, sample)
    assert.equal(staged.candidates.length, sample.candidates.length)
    assert.equal(staged.questions.length, 1)
    const { rows } = await client.query("select kind, status, source, confidence, payload->>'description' as description from import_candidate where batch_id = $1 order by id", [batch])
    assert.deepEqual(rows[1], { kind: 'entry', status: 'pending', source: '2026-10!A4:G4', confidence: '0.60', description: 'Farmácia' })
    const question = await client.query('select candidate_id, question, options from import_question where batch_id = $1', [batch])
    assert.deepEqual(question.rows, [{ candidate_id: staged.candidates[1], question: 'GMA é a Gabriela?', options: ['Sim', 'Não'] }])
    assert.equal(await count('audit_log'), before + sample.candidates.length + 1)
    const { items } = await listAudit(client, { limit: 4 })
    assert.deepEqual(
      items.map((item) => [item.entity, item.subject]),
      [
        ['import_question', 'GMA é a Gabriela?'],
        ['import_candidate', 'Viagem'],
        ['import_candidate', 'Reserva de emergência'],
        ['import_candidate', 'Empréstimo do carro'],
      ],
    )
  })

  test('masks digit runs in questions', async () => {
    const batch = await openBatch(client, actor, { name: 'notas.txt', format: 'txt', hash })
    await stageOutput(client, actor, batch, { candidates: [], questions: [{ question: 'A conta 0012345678 é a conjunta?', options: ['Sim, 0012345678'] }] })
    const { rows } = await client.query('select question, options, candidate_id from import_question where batch_id = $1', [batch])
    assert.deepEqual(rows, [{ question: 'A conta •5678 é a conjunta?', options: ['Sim, •5678'], candidate_id: null }])
  })

  test('writes nothing when the output is invalid or the batch is not a draft', async () => {
    const batch = await openBatch(client, actor, { name: 'dados.json', format: 'json', hash })
    const before = await count('import_candidate')
    await assert.rejects(stageOutput(client, actor, batch, { candidates: [{ kind: 'entry' }], questions: [] }), /invalid import output: candidates\.0\.source/)
    await client.query("update import_batch set status = 'closed', closed_at = now() where id = $1", [batch])
    await assert.rejects(stageOutput(client, actor, batch, sample), /not an open draft/)
    await assert.rejects(stageOutput(client, actor, 999999n, sample), /not an open draft/)
    assert.equal(await count('import_candidate'), before)
  })
})
