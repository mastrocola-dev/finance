import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { seed } from '../../src/db/seed.ts'
import type { Actor } from '../../src/db/write.ts'
import { retryTargets } from '../../src/import/agent.ts'
import { answerQuestion, askedNames, editCandidate, renameCategory, reviewCandidates } from '../../src/import/review.ts'
import { openBatch, stageOutput } from '../../src/import/staging.ts'
import { verifyBatch } from '../../src/import/verify.ts'
import { testDatabase } from '../db/database.ts'
import { freshHash, sample } from './sample.ts'

const importer: Actor = { author: 'import' }
const origin = { candidates: sample.candidates.map((_, index) => `L${index + 1}@0`), questions: ['L2@0'], totals: [] }

describe('import review', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client
  let member: Actor

  before(async () => {
    db = await testDatabase()
    client = db.client
    await seed(client)
    const id = (await client.query<{ id: bigint }>("select id from member where name = 'Marcio'")).rows[0]?.id
    assert.ok(id)
    member = { author: 'member', memberId: id }
  })

  after(() => db.drop())

  const staged = async (verify = true) => {
    const batch = await openBatch(client, importer, { name: 'notas.txt', format: 'txt', hash: freshHash() })
    const { candidates, questions } = await stageOutput(client, importer, batch, sample, { origin })
    if (verify) await verifyBatch(client, importer, batch)
    return { batch, candidates, questions }
  }

  const candidate = async (id: bigint | undefined) => (await client.query('select status, payload, checks from import_candidate where id = $1', [id])).rows[0]

  test('refuses review before verification', async () => {
    const { batch, candidates } = await staged(false)
    await assert.rejects(reviewCandidates(client, member, batch, candidates.slice(0, 1), 'accept'), /not open for review/)
  })

  test('accepts and rejects candidates with one audit row per change', async () => {
    const { batch, candidates } = await staged()
    const [first, second] = candidates
    assert.ok(first && second)
    assert.deepEqual(await reviewCandidates(client, member, batch, [first, second, first], 'accept'), [first, second])
    assert.deepEqual(await reviewCandidates(client, member, batch, [second], 'reject'), [second])
    await reviewCandidates(client, member, batch, [second], 'reject')
    assert.equal((await candidate(first)).status, 'accepted')
    assert.equal((await candidate(second)).status, 'rejected')
    const audit = await client.query("select author, action, after->>'status' as status from audit_log where entity = 'import_candidate' and entity_id = $1 and action = 'update' and before->>'status' <> after->>'status' order by id", [second])
    assert.deepEqual(audit.rows, [
      { author: 'member', action: 'update', status: 'accepted' },
      { author: 'member', action: 'update', status: 'rejected' },
    ])
    await assert.rejects(reviewCandidates(client, member, batch, [999999n], 'accept'), /candidate 999999 is not open/)
  })

  test('refuses to accept an invalid payload', async () => {
    const { batch, candidates } = await staged()
    await client.query(`update import_candidate set payload = payload - 'date' where id = $1`, [candidates[0]])
    await assert.rejects(reviewCandidates(client, member, batch, candidates.slice(0, 1), 'accept'), /invalid payload; edit it first/)
  })

  test('edits a payload, marks it edited and verifies again', async () => {
    const { batch, candidates } = await staged()
    const id = candidates[1]
    assert.deepEqual(
      (await candidate(id)).checks.map((check: { code: string }) => check.code),
      ['low_confidence', 'matched_member'],
    )
    const payload = { ...sample.candidates[1]?.payload, member: 'Gabriela', description: ' Farmácia Central ' }
    await editCandidate(client, member, batch, id as bigint, payload)
    const edited = await candidate(id)
    assert.equal(edited.status, 'edited')
    assert.equal(edited.payload.description, 'Farmácia Central')
    assert.deepEqual(
      edited.checks.map((check: { code: string }) => check.code),
      ['low_confidence'],
    )
    await assert.rejects(editCandidate(client, member, batch, id as bigint, { ...payload, amountCents: 0 }), /invalid entry payload: amountCents/)
    await reviewCandidates(client, member, batch, [id as bigint], 'accept')
    assert.equal((await candidate(id)).status, 'edited')
  })

  test('answers a question and resolves every candidate carrying the asked name', async () => {
    const { batch, candidates, questions } = await staged()
    const [question] = questions
    assert.ok(question)
    await client.query(`update import_candidate set payload = jsonb_set(payload, '{member}', '"gma"') where id = $1`, [candidates[4]])
    const answered = await answerQuestion(client, member, batch, question, ' gabriela ')
    assert.deepEqual(answered, { questionId: question, resolved: [candidates[1], candidates[4]] })
    assert.equal((await candidate(candidates[1])).payload.member, 'Gabriela')
    assert.equal((await candidate(candidates[1])).checks.length, 1)
    assert.equal((await client.query('select answer from import_question where id = $1', [question])).rows[0]?.answer, 'gabriela')
    await assert.rejects(answerQuestion(client, member, batch, question, 'Marcio'), /already answered/)
  })

  test('keeps free answers without changing candidates', async () => {
    const { batch, candidates, questions } = await staged()
    assert.deepEqual(await answerQuestion(client, member, batch, questions[0] as bigint, 'Sim'), { questionId: questions[0], resolved: [] })
    assert.equal((await candidate(candidates[1])).payload.member, 'GMA')
    await assert.rejects(answerQuestion(client, member, batch, questions[0] as bigint, 'Gabriela'), /already answered/)
    const { questions: others } = await staged()
    await assert.rejects(answerQuestion(client, member, batch, others[0] as bigint, 'Sim'), /is not open in import batch/)
    await assert.rejects(answerQuestion(client, member, batch, 1n << 40n, ' '), /1 to 200/)
  })

  test('renames a new category everywhere the batch uses it', async () => {
    const { batch, candidates } = await staged()
    const [, farmacia, , pets, , internet] = candidates
    await client.query(`update import_candidate set payload = jsonb_set(payload, '{category}', '"pets"') where id = any($1)`, [[farmacia, internet]])
    const totals = [
      { direction: 'expense', category: 'Pets', month: '2026-10-01', amountCents: 8990, source: 'A9' },
      { direction: 'income', category: 'Pets', month: '2026-10-01', amountCents: 1, source: 'A10' },
    ]
    const consolidation = { merges: [{ name: 'Gatos', kind: 'expense', to: 'Pets', candidates: 1 }], unchecked: [{ direction: 'expense', category: 'PETS', amountCents: 5 }], failure: null }
    await client.query('update import_batch set totals = $2, consolidation = $3 where id = $1', [batch, JSON.stringify(totals), JSON.stringify(consolidation)])
    assert.deepEqual(await renameCategory(client, member, batch, pets as bigint, ' Animais '), [pets, farmacia, internet])
    assert.deepEqual((await candidate(pets)).payload, { name: 'Animais', kind: 'expense' })
    assert.equal((await candidate(farmacia)).payload.category, 'Animais')
    assert.equal((await candidate(internet)).payload.category, 'Animais')
    const after = (await client.query('select totals, consolidation from import_batch where id = $1', [batch])).rows[0]
    assert.deepEqual(
      after.totals.map((item: { category: string }) => item.category),
      ['Animais', 'Pets'],
    )
    assert.equal(after.consolidation.merges[0].to, 'Animais')
    assert.equal(after.consolidation.unchecked[0].category, 'Animais')
    const audit = await client.query("select author, entity from audit_log where entity_id = any($1) and action = 'update' and after->'payload' is distinct from before->'payload' and (after->'payload')::text like '%Animais%'", [[pets, farmacia, internet]])
    assert.equal(audit.rowCount, 3)
    assert.ok(audit.rows.every((row) => row.author === 'member'))
    assert.deepEqual(await renameCategory(client, member, batch, pets as bigint, 'Animais'), [])
    assert.deepEqual(await renameCategory(client, member, batch, pets as bigint, 'animais'), [pets, farmacia, internet])
  })

  test('refuses renames to an open name or of something else', async () => {
    const { batch, candidates } = await staged()
    const [entry, , , pets] = candidates
    await assert.rejects(renameCategory(client, member, batch, pets as bigint, 'saude'), /category saude is already open/)
    await assert.rejects(renameCategory(client, member, batch, pets as bigint, ' '), /invalid category name/)
    await assert.rejects(renameCategory(client, member, batch, entry as bigint, 'Animais'), /is not a new category/)
    await client.query("update import_candidate set status = 'rejected' where id = $1", [pets])
    await assert.rejects(renameCategory(client, member, batch, pets as bigint, 'Animais'), /is not a new category/)
    assert.equal((await candidate(pets)).payload.name, 'Pets')
  })

  test('finds asked names by whole words only', () => {
    const checks = [
      {
        checks: [
          { code: 'unknown_member', detail: 'GMA' },
          { code: 'unknown_account', detail: 'Nubank' },
          { code: 'low_confidence', detail: '0.60' },
          { code: 'matched_category', detail: 'Mercado → Supermercado' },
          { code: 'member_unmatched', detail: 'Tia Rosa' },
        ],
      },
    ]
    assert.deepEqual(askedNames('GMA é a Gabriela?', checks), [{ reference: 'member', name: 'GMA' }])
    assert.deepEqual(askedNames('Gamado? nubank?', checks), [{ reference: 'account', name: 'Nubank' }])
    assert.deepEqual(askedNames('Mercado é Supermercado? E a tia rosa?', checks), [
      { reference: 'category', name: 'Mercado' },
      { reference: 'member', name: 'Tia Rosa' },
    ])
  })

  test('retries skip chunks holding reviewed rows', async () => {
    const { batch, candidates } = await staged()
    assert.deepEqual(await retryTargets(client, batch), ['L2@0', 'L4@0', 'L7@0'])
    await reviewCandidates(client, member, batch, [candidates[6] as bigint], 'reject')
    assert.deepEqual(await retryTargets(client, batch), ['L2@0', 'L4@0'])
    await client.query("update import_candidate set chunk = 'L4@0' where id = $1 and accepted_by_model", [candidates[0]])
    assert.deepEqual(await retryTargets(client, batch), ['L2@0', 'L4@0'])
    await reviewCandidates(client, member, batch, [candidates[0] as bigint], 'accept')
    assert.deepEqual(await retryTargets(client, batch), ['L2@0'])
    const { batch: other, questions } = await staged()
    await answerQuestion(client, member, other, questions[0] as bigint, 'Sim')
    assert.deepEqual(await retryTargets(client, other), ['L4@0', 'L7@0'])
  })
})
