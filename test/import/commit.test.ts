import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { seed } from '../../src/db/seed.ts'
import type { Actor } from '../../src/db/write.ts'
import { commitBatch } from '../../src/import/commit.ts'
import { editCandidate, reviewCandidates } from '../../src/import/review.ts'
import { openBatch, stageOutput } from '../../src/import/staging.ts'
import { verifyBatch } from '../../src/import/verify.ts'
import { testDatabase } from '../db/database.ts'
import { freshHash } from './sample.ts'

const importer: Actor = { author: 'import' }

const candidate = (kind: string, payload: Record<string, unknown>) => ({ kind, source: `L-${kind}`, confidence: 0.95, payload })

const output = {
  candidates: [
    candidate('entry', { date: '2026-10-12', description: 'Vacina', direction: 'expense', amountCents: 15000, category: 'pets', account: 'Conta Pets', member: 'Gabriela', paid: true, installment: { number: 1, total: 2 } }),
    candidate('entry', { date: '2026-10-20', description: 'Banho', direction: 'expense', amountCents: 6000, category: 'Pets', member: 'joint', paid: false }),
    candidate('category', { name: 'Pets', kind: 'expense' }),
    candidate('account', { institution: 'Banco Ficticio', nickname: 'Conta Pets', lastFour: '4321', kind: 'checking', member: 'Gabriela' }),
    candidate('reserve', { name: 'Reserva Pets', balanceCents: 10000, account: 'Conta Pets' }),
    candidate('goal', { name: 'Castração', targetCents: 50000, savedCents: 0, reserve: 'Reserva Pets' }),
    candidate('income', { description: 'Bico', amountCents: 50000, dayOfMonth: 5, startsOn: '2026-01-01', category: 'Freelance', member: 'Marcio' }),
    candidate('recurring_expense', { description: 'Ração', amountCents: 12000, dayOfMonth: 10, startsOn: '2026-01-01', category: 'Pets', account: 'Conta Pets' }),
    candidate('debt', { creditor: 'Pet Shop Exemplo', description: 'Parcelas do aquário', principalCents: 60000, balanceCents: 40000, installmentsTotal: 6, installmentsPaid: 2, startsOn: '2026-08-01', member: 'joint' }),
  ],
  questions: [],
  totals: [],
}

describe('import commit', () => {
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

  const staged = async (data = output) => {
    const batch = await openBatch(client, importer, { name: 'pets.json', format: 'json', hash: freshHash() })
    const { candidates } = await stageOutput(client, importer, batch, data)
    await verifyBatch(client, importer, batch)
    return { batch, candidates }
  }

  const batchStatus = async (batch: bigint) => (await client.query('select status from import_batch where id = $1', [batch])).rows[0]?.status
  const ledgerRows = async (batch: bigint) => (await client.query<{ count: number }>('select count(*)::int as count from entry where import_batch_id = $1', [batch])).rows[0]?.count

  test('writes accepted and edited candidates with names resolved and the batch on every row', async () => {
    const { batch, candidates } = await staged()
    const [vacina, banho, , , , , , racao] = candidates
    assert.ok(vacina && banho && racao)
    await editCandidate(client, member, batch, racao, { ...output.candidates[7]?.payload, amountCents: 13000 })
    await reviewCandidates(
      client,
      member,
      batch,
      candidates.filter((id) => id !== banho),
      'accept',
    )
    const committed = await commitBatch(client, committer, batch)
    assert.deepEqual(
      committed.map((item) => item.kind),
      ['category', 'account', 'reserve', 'income', 'recurring_expense', 'debt', 'goal', 'entry'],
    )
    assert.equal(await batchStatus(batch), 'committed')
    const entry = (
      await client.query(
        `select e.competence::text, e.status, e.paid_on::text as paid_on, e.origin, e.installment_number, c.name as category, a.nickname as account, m.name as member
        from entry e join category c on c.id = e.category_id join account a on a.id = e.account_id join member m on m.id = e.member_id
        where e.import_batch_id = $1`,
        [batch],
      )
    ).rows
    assert.deepEqual(entry, [{ competence: '2026-10-01', status: 'paid', paid_on: '2026-10-12', origin: 'import', installment_number: 1, category: 'Pets', account: 'Conta Pets', member: 'Gabriela' }])
    const goal = (await client.query('select r.name from goal g join reserve r on r.id = g.reserve_id where g.import_batch_id = $1', [batch])).rows
    assert.deepEqual(goal, [{ name: 'Reserva Pets' }])
    const expense = (await client.query('select amount_cents, member_id from recurring_expense where import_batch_id = $1', [batch])).rows
    assert.deepEqual(expense, [{ amount_cents: 13000n, member_id: null }])
    const links = (await client.query('select id, status, record_id from import_candidate where batch_id = $1 order by id', [batch])).rows
    assert.deepEqual(
      links.map((row) => row.record_id === null),
      candidates.map((id) => id === banho),
    )
    const audit = (await client.query("select author, member_id from audit_log where action = 'create' and after->>'import_batch_id' = $1", [String(batch)])).rows
    assert.equal(audit.length, 8)
    assert.ok(audit.every((row) => row.author === 'import' && row.member_id === committer.memberId))
    await assert.rejects(reviewCandidates(client, member, batch, [banho], 'accept'), /not open for review/)
    await assert.rejects(commitBatch(client, committer, batch), /is not verified/)
  })

  test('refuses an empty commit and candidates with failed checks, writing nothing', async () => {
    const { batch, candidates } = await staged()
    await assert.rejects(commitBatch(client, committer, batch), /no accepted candidates/)
    await client.query(`update import_candidate set payload = jsonb_set(payload, '{member}', '"GMA"') where id = $1`, [candidates[0]])
    await reviewCandidates(client, member, batch, candidates.slice(0, 2), 'accept')
    await assert.rejects(commitBatch(client, committer, batch), new RegExp(`candidates ${candidates[0]} have failed checks`))
    assert.equal(await batchStatus(batch), 'verified')
    assert.equal(await ledgerRows(batch), 0)
  })

  test('refuses names whose staged candidate was not accepted', async () => {
    const birds = [
      candidate('entry', { date: '2026-10-05', description: 'Alpiste', direction: 'expense', amountCents: 2500, category: 'Aves', account: 'Conta Aves', member: 'joint', paid: false }),
      candidate('category', { name: 'Aves', kind: 'expense' }),
      candidate('account', { institution: 'Banco Ficticio', nickname: 'Conta Aves', lastFour: '8765', kind: 'checking' }),
    ]
    const { batch, candidates } = await staged({ candidates: birds, questions: [], totals: [] })
    await reviewCandidates(client, member, batch, candidates.slice(0, 2), 'accept')
    await assert.rejects(commitBatch(client, committer, batch), /unknown account Conta Aves/)
    assert.equal((await client.query("select count(*)::int as count from category where name = 'Aves'")).rows[0]?.count, 0)
  })

  test('refuses a joint income and a reserve already in the ledger', async () => {
    const income = candidate('income', { description: 'Aluguel recebido', amountCents: 80000, dayOfMonth: 1, startsOn: '2026-01-01', member: 'joint' })
    const reserve = candidate('reserve', { name: 'reserva de emergência', balanceCents: 100 })
    const { batch, candidates } = await staged({ candidates: [income, reserve], questions: [], totals: [] })
    await reviewCandidates(client, member, batch, [candidates[1] as bigint], 'accept')
    await assert.rejects(commitBatch(client, committer, batch), new RegExp(`candidates ${candidates[1]} have failed checks`))
    await reviewCandidates(client, member, batch, [candidates[1] as bigint], 'reject')
    await reviewCandidates(client, member, batch, [candidates[0] as bigint], 'accept')
    await assert.rejects(commitBatch(client, committer, batch), /income Aluguel recebido needs a member/)
  })
})
