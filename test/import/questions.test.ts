import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { seed } from '../../src/db/seed.ts'
import type { Actor } from '../../src/db/write.ts'
import { listQuestions } from '../../src/import/batches.ts'
import { commitBatch } from '../../src/import/commit.ts'
import { answerQuestion, editCandidate, reviewCandidates } from '../../src/import/review.ts'
import { openBatch, stageOutput } from '../../src/import/staging.ts'
import { verifyBatch } from '../../src/import/verify.ts'
import { testDatabase } from '../db/database.ts'
import { freshHash } from './sample.ts'

const importer: Actor = { author: 'import' }

const candidate = (kind: string, payload: Record<string, unknown>, source = `L-${kind}`) => ({ kind, source, confidence: 0.95, payload })
const spent = (description: string, payload: Record<string, unknown> = {}) => candidate('entry', { date: '2026-10-14', description, direction: 'expense', amountCents: 2000, category: 'Alimentação', member: 'joint', paid: true, ...payload }, `out!${description}`)
const asking = (question: string) => ({ question, options: ['Sim', 'Não'] })
const output = (candidates: ReturnType<typeof candidate>[], questions: ReturnType<typeof asking>[] = []) => ({ candidates, questions, totals: [] })

describe('import questions', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client
  let member: Actor
  let committer: Actor

  before(async () => {
    db = await testDatabase()
    client = db.client
    await seed(client)
    const id = (await client.query<{ id: bigint }>("select id from member where name = 'Marcio'")).rows[0]?.id
    assert.ok(id)
    member = { author: 'member', memberId: id }
    committer = { author: 'import', memberId: id }
  })

  after(() => db.drop())

  const opened = () => openBatch(client, importer, { name: 'outubro.xlsx', format: 'xlsx', hash: freshHash() })
  const open = async (batch: bigint) => (await listQuestions(client, batch)).map((item) => item.question)
  const closedAt = async (id: bigint | undefined) => (await client.query('select closed_at from import_candidate where id = $1', [id])).rows[0]?.closed_at

  test('shows a question asked by three chunks once and keeps the answered copy', async () => {
    const batch = await opened()
    for (const [index, question] of ['Quem é GMA?', 'quem é gma', 'Quem é  GMA ?!'].entries()) await stageOutput(client, importer, batch, output([spent(`Feira ${index}`)], [asking(question)]))
    const verified = await verifyBatch(client, importer, batch)
    assert.equal(verified.closed.questions.length, 2)
    assert.deepEqual(await open(batch), ['Quem é GMA?'])
    const [first] = await listQuestions(client, batch)
    await answerQuestion(client, member, batch, BigInt(first?.id ?? 0), 'Sim')
    await client.query("update import_batch set status = 'draft' where id = $1", [batch])
    await stageOutput(client, importer, batch, output([spent('Feira 3')], [asking('QUEM É GMA?')]))
    await verifyBatch(client, importer, batch)
    assert.deepEqual(await open(batch), ['Quem é GMA?'])
    const again = await verifyBatch(client, importer, batch)
    assert.deepEqual(again.closed, { categories: [], questions: [] })
  })

  test('closes a verify question once the matcher resolves its name', async () => {
    const batch = await opened()
    await stageOutput(client, importer, batch, output([candidate('goal', { name: 'Ir à praia', targetCents: 300000, savedCents: 0, reserve: 'Reserva viagem' })]))
    await verifyBatch(client, importer, batch)
    assert.deepEqual(await open(batch), ['Qual reserva é "Reserva viagem"?'])
    await client.query("update import_batch set status = 'draft' where id = $1", [batch])
    await stageOutput(client, importer, batch, output([candidate('reserve', { name: 'Reserva de viagem', balanceCents: 0 })]))
    const verified = await verifyBatch(client, importer, batch)
    assert.equal(verified.closed.questions.length, 1)
    assert.deepEqual(await open(batch), [])
  })

  test('closes a created category no candidate references after an edit', async () => {
    const batch = await opened()
    const { candidates } = await stageOutput(client, importer, batch, output([spent('Ração', { category: 'Aquarismo' })]))
    const verified = await verifyBatch(client, importer, batch)
    assert.equal(verified.created, 1)
    const created = (await client.query<{ id: bigint; origin: string }>("select id, origin from import_candidate where batch_id = $1 and kind = 'category'", [batch])).rows
    assert.deepEqual(
      created.map((row) => row.origin),
      ['verify'],
    )
    await editCandidate(client, member, batch, candidates[0] as bigint, spent('Ração').payload)
    assert.ok(await closedAt(created[0]?.id))
    const audit = (await client.query("select author from audit_log where entity = 'import_candidate' and entity_id = $1 and action = 'close'", [created[0]?.id])).rows
    assert.deepEqual(audit, [{ author: 'member' }])
  })

  test('keeps a staged category the model proposed even when nothing references it', async () => {
    const batch = await opened()
    const { candidates } = await stageOutput(client, importer, batch, output([candidate('category', { name: 'Jardinagem', kind: 'expense' })]))
    const verified = await verifyBatch(client, importer, batch)
    assert.deepEqual(verified.closed.categories, [])
    assert.equal(await closedAt(candidates[0]), null)
  })

  test('commits with unanswered questions, deciding each with its first option', async () => {
    const batch = await opened()
    const income = candidate('income', { description: 'Aulas', amountCents: 40000, dayOfMonth: 5, startsOn: '2026-01-01', member: 'Tia Rosa' })
    const { candidates } = await stageOutput(client, importer, batch, output([income, spent('Padaria')], [asking('A padaria é conjunta?')]))
    await verifyBatch(client, importer, batch)
    assert.deepEqual(await open(batch), ['A padaria é conjunta?', 'Quem é "Tia Rosa"?'])
    await reviewCandidates(client, member, batch, candidates, 'accept')
    const committed = await commitBatch(client, committer, batch)
    assert.equal(committed.length, 2)
    const decided = (await listQuestions(client, batch)).map(({ question, answer, decidedByModel }) => ({ question, answer, decidedByModel }))
    assert.deepEqual(decided, [
      { question: 'A padaria é conjunta?', answer: 'Sim', decidedByModel: true },
      { question: 'Quem é "Tia Rosa"?', answer: 'Marcio', decidedByModel: true },
    ])
    const owner = (await client.query('select m.name from income i join member m on m.id = i.member_id where i.import_batch_id = $1', [batch])).rows
    assert.deepEqual(owner, [{ name: 'Marcio' }])
    const audit = (await client.query("select distinct author from audit_log where entity = 'import_question' and action = 'update' and (after->>'batch_id')::bigint = $1", [batch])).rows
    assert.deepEqual(audit, [{ author: 'import' }])
  })

  test('keeps answers the household gave and marks them as theirs', async () => {
    const batch = await opened()
    const { candidates } = await stageOutput(client, importer, batch, output([spent('Café')], [asking('O café é conjunto?')]))
    await verifyBatch(client, importer, batch)
    const [question] = await listQuestions(client, batch)
    await answerQuestion(client, member, batch, BigInt(question?.id ?? 0), 'Não')
    await reviewCandidates(client, member, batch, candidates, 'accept')
    await commitBatch(client, committer, batch)
    const [after] = await listQuestions(client, batch)
    assert.deepEqual([after?.answer, after?.decidedByModel], ['Não', false])
  })
})
