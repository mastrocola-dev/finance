import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { seed } from '../../src/db/seed.ts'
import type { Actor } from '../../src/db/write.ts'
import { closeBatch } from '../../src/import/close.ts'
import { commitBatch } from '../../src/import/commit.ts'
import { reviewCandidates } from '../../src/import/review.ts'
import { batchOfFile, openBatch, stageOutput } from '../../src/import/staging.ts'
import { verifyBatch } from '../../src/import/verify.ts'
import { testDatabase } from '../db/database.ts'
import { freshHash } from './sample.ts'

const importer: Actor = { author: 'import' }

const output = {
  candidates: [
    { kind: 'entry', source: 'L1', confidence: 0.95, payload: { date: '2026-10-08', description: 'Feira', direction: 'expense', amountCents: 9000, category: 'Alimentação', account: 'Conta conjunta', member: 'joint', paid: true } },
    { kind: 'entry', source: 'L2', confidence: 0.95, payload: { date: '2026-10-09', description: 'Padaria', direction: 'expense', amountCents: 2000, category: 'Alimentação', member: 'joint', paid: false } },
  ],
  questions: [{ question: 'A feira é semanal?', options: ['Sim', 'Não'], candidate: 0 }],
  totals: [],
}

describe('import close', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client
  let member: Actor

  before(async () => {
    db = await testDatabase()
    client = db.client
    await seed(client)
    const id = (await client.query<{ id: bigint }>("select id from member where name = 'Gabriela'")).rows[0]?.id
    assert.ok(id)
    member = { author: 'member', memberId: id }
  })

  after(() => db.drop())

  const staged = async (hash = freshHash()) => {
    const batch = await openBatch(client, importer, { name: 'feira.txt', format: 'txt', hash })
    const { candidates } = await stageOutput(client, importer, batch, output)
    await verifyBatch(client, importer, batch)
    return { batch, candidates, hash }
  }

  const openRows = async (table: string, batch: bigint) => (await client.query<{ count: number }>(`select count(*)::int as count from ${table} where batch_id = $1 and closed_at is null`, [batch])).rows[0]?.count
  const batchRow = async (batch: bigint) => (await client.query('select status, closed_at is not null as closed from import_batch where id = $1', [batch])).rows[0]

  test('closes a committed batch with its candidates and questions while ledger rows stay', async () => {
    const { batch, candidates, hash } = await staged()
    await reviewCandidates(client, member, batch, candidates.slice(0, 1), 'accept')
    await commitBatch(client, { author: 'import', memberId: member.memberId }, batch)
    assert.deepEqual(await closeBatch(client, member, batch), { batchId: batch, outcome: 'closed' })
    assert.deepEqual(await batchRow(batch), { status: 'closed', closed: true })
    assert.equal(await openRows('import_candidate', batch), 0)
    assert.equal(await openRows('import_question', batch), 0)
    const ledger = (await client.query('select description from entry where import_batch_id = $1 and closed_at is null', [batch])).rows
    assert.deepEqual(ledger, [{ description: 'Feira' }])
    const audit = (await client.query("select entity, author, member_id from audit_log where action = 'close' and ((entity = 'import_batch' and entity_id = $1) or after->>'batch_id' = $2) order by id", [batch, String(batch)])).rows
    assert.deepEqual(
      audit.map((row) => row.entity),
      ['import_question', 'import_candidate', 'import_candidate', 'import_batch'],
    )
    assert.ok(audit.every((row) => row.author === 'member' && row.member_id === member.memberId))
    assert.equal(await batchOfFile(client, hash), batch)
    await assert.rejects(closeBatch(client, member, batch), /already closed/)
  })

  test('abandons a verified batch without touching the ledger and frees its file', async () => {
    const { batch, candidates, hash } = await staged()
    await reviewCandidates(client, member, batch, candidates, 'accept')
    assert.deepEqual(await closeBatch(client, member, batch), { batchId: batch, outcome: 'abandoned' })
    assert.deepEqual(await batchRow(batch), { status: 'closed', closed: true })
    assert.equal((await client.query<{ count: number }>('select count(*)::int as count from entry where import_batch_id = $1', [batch])).rows[0]?.count, 0)
    assert.equal(await batchOfFile(client, hash), undefined)
    await assert.rejects(commitBatch(client, { author: 'import', memberId: member.memberId }, batch), /is not verified/)
    const again = await staged(hash)
    assert.notEqual(again.batch, batch)
  })

  test('abandons a draft batch', async () => {
    const batch = await openBatch(client, importer, { name: 'rascunho.txt', format: 'txt', hash: freshHash() })
    assert.equal((await closeBatch(client, member, batch)).outcome, 'abandoned')
    assert.deepEqual(await batchRow(batch), { status: 'closed', closed: true })
  })
})
