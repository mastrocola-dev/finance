import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { seed } from '../../src/db/seed.ts'
import type { Actor } from '../../src/db/write.ts'
import { openBatch, stageOutput } from '../../src/import/staging.ts'
import { findChecks, normalize, questionFor, type References, reconcile, type Staged, verifyBatch } from '../../src/import/verify.ts'
import { testDatabase } from '../db/database.ts'
import { freshHash } from './sample.ts'

const actor: Actor = { author: 'import' }

const entry = (id: number, payload: Record<string, unknown>, confidence = 0.95): Staged => ({
  id: BigInt(id),
  kind: 'entry',
  source: `2026-10!A${id}:G${id}`,
  confidence,
  checks: [],
  payload: { date: '2026-10-12', description: 'Feira', direction: 'expense', amountCents: 4500, category: 'Alimentação', paid: true, ...payload },
})

const references: References = {
  members: ['Marcio', 'Gabriela'],
  accounts: [{ name: 'Conta conjunta' }],
  categories: [
    { name: 'Alimentação', kind: 'expense' },
    { name: 'Salário', kind: 'income' },
  ],
  reserves: ['Reserva de emergência'],
  existing: [{ id: 7n, key: 'entry|2026-10-10|320000|aluguel' }],
}

describe('import verification rules', () => {
  test('normalizes descriptions for duplicate detection', () => {
    assert.equal(normalize('  ALUGUEL - Out/26 '), 'aluguel out 26')
    assert.equal(normalize('Farmácia São João'), 'farmacia sao joao')
  })

  test('flags low confidence, invalid payloads and duplicates in the file and in the ledger', () => {
    const { checks } = findChecks([entry(1, { date: '2026-10-10', description: 'Aluguel ', amountCents: 320000 }), entry(2, { description: 'FEIRA' }, 0.5), entry(3, { description: 'feira!' }), entry(4, { amountCents: 0 })], references)
    assert.deepEqual(checks.get(1n), [{ code: 'duplicate_in_ledger', detail: 'entry 7' }])
    assert.deepEqual(checks.get(2n), [{ code: 'low_confidence', detail: '0.50' }])
    assert.deepEqual(checks.get(3n), [{ code: 'duplicate_in_file', detail: '2026-10!A2:G2' }])
    assert.equal(checks.get(4n)?.[0]?.code, 'invalid')
    assert.match(checks.get(4n)?.[0]?.detail ?? '', /^amountCents:/)
  })

  test('asks once per unknown name and accepts names staged in the same batch', () => {
    const pets: Staged = { id: 9n, kind: 'category', source: '$.categories[0]', confidence: 1, checks: [], payload: { name: 'Pets', kind: 'expense' } }
    const { checks, asks } = findChecks([entry(1, { member: 'GMA', category: 'pets' }), entry(2, { member: 'gma', account: 'Nubank', description: 'Padaria' }), entry(3, { member: 'joint', category: 'Salário', description: 'Bônus' }), pets], references)
    assert.deepEqual(checks.get(1n), [{ code: 'unknown_member', detail: 'GMA' }])
    assert.deepEqual(checks.get(3n), [{ code: 'unknown_category', detail: 'Salário' }])
    assert.deepEqual(
      asks.map(({ reference, name, candidate }) => [reference, name, candidate]),
      [
        ['member', 'GMA', 1n],
        ['account', 'Nubank', 2n],
        ['category', 'Salário', 3n],
      ],
    )
    assert.deepEqual(questionFor(asks[0] ?? assert.fail(), references), { question: 'Quem é "GMA"?', options: ['Marcio', 'Gabriela', 'Conjunto'] })
    assert.deepEqual(questionFor(asks[2] ?? assert.fail(), references), { question: 'Qual categoria é "Salário"?', options: ['Alimentação', 'Nova categoria'] })
  })

  test('reconciles printed totals with valid entries by month, direction and category', () => {
    const candidates = [
      entry(1, { amountCents: 4500 }),
      entry(2, { description: 'Padaria', amountCents: 1250, category: 'alimentação' }),
      entry(3, { direction: 'income', description: 'Salário', category: 'Salário', amountCents: 900000 }),
      entry(4, { date: '2026-11-02', amountCents: 7000 }),
      entry(5, { amountCents: 0 }),
    ]
    const total = (direction: 'income' | 'expense' | 'net', amountCents: number, category?: string) => ({ source: `2026-10!G${amountCents}`, month: '2026-10-01', direction, amountCents, ...(category && { category }) })
    assert.deepEqual(reconcile(candidates, [total('expense', 5750), total('expense', 5750, 'Alimentação'), total('income', 900000), total('net', 894250)]), [])
    assert.deepEqual(reconcile(candidates, [total('expense', 5700), { ...total('expense', 7000), month: '2026-12-01' }]), [
      { code: 'total_mismatch', detail: '2026-10!G5700: expense 2026-10 expected 5700, found 5750' },
      { code: 'total_mismatch', detail: '2026-10!G7000: expense 2026-12 expected 7000, found 0' },
    ])
  })
})

describe('verifyBatch', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client

  before(async () => {
    db = await testDatabase()
    client = db.client
    await seed(client)
  })

  after(() => db.drop())

  const output = {
    candidates: [
      { kind: 'entry', source: 'out!A2:G2', confidence: 0.95, payload: { date: '2026-10-10', description: 'ALUGUEL', direction: 'expense', amountCents: 320000, category: 'Moradia', account: 'Conta conjunta', member: 'joint', paid: true } },
      { kind: 'entry', source: 'out!A3:G3', confidence: 0.55, payload: { date: '2026-10-21', description: 'Ração', direction: 'expense', amountCents: 18990, category: 'Pets', member: 'GMA', paid: false } },
      { kind: 'entry', source: 'out!A4:G4', confidence: 0.9, payload: { date: '2026-10-21', description: 'Ração', direction: 'expense', amountCents: 18990, category: 'Pets', member: 'GMA', paid: false } },
      { kind: 'entry', source: 'out!A5:G5', confidence: 0.9, payload: { date: '2026-10-22', description: 'Mercadinho', direction: 'expense', amountCents: 5600, category: 'Mercado', member: 'Marcio', paid: true } },
      { kind: 'category', source: 'out!J2', confidence: 1, payload: { name: 'Pets', kind: 'expense' } },
      { kind: 'reserve', source: 'out!L2', confidence: 0.9, payload: { name: 'Reserva de Emergência', balanceCents: 1800000 } },
    ],
    questions: [{ question: 'GMA é a Gabriela?', options: ['Sim', 'Não'], source: 'out!E3', candidate: 1 }],
    totals: [
      { source: 'out!G7', month: '2026-10-01', direction: 'expense', amountCents: 363580 },
      { source: 'out!G8', month: '2026-10-01', direction: 'expense', category: 'pets', amountCents: 18990 },
      { source: 'out!G9', month: '2026-10-01', direction: 'net', amountCents: -363580 },
    ],
  }

  const stage = async (name: string) => {
    const batch = await openBatch(client, actor, { name, format: 'xlsx', hash: freshHash() })
    const staged = await stageOutput(client, actor, batch, output)
    return { batch, ids: staged.candidates }
  }

  test('stores checks, asks for unknown names and marks the batch verified', async () => {
    const { batch, ids } = await stage('outubro.xlsx')
    const result = await verifyBatch(client, actor, batch)
    assert.deepEqual(result.failed, [ids[0], ids[1], ids[2], ids[3], ids[5]])
    assert.deepEqual(result.lowConfidence, [ids[1]])
    assert.equal(result.checked, 6)
    const { rows } = await client.query<{ id: bigint; checks: { code: string }[] }>('select id, checks from import_candidate where batch_id = $1 order by id', [batch])
    assert.deepEqual(
      rows.map((row) => row.checks.map((check) => check.code)),
      [['duplicate_in_ledger'], ['low_confidence', 'unknown_member'], ['unknown_member', 'duplicate_in_file'], ['unknown_category'], [], ['duplicate_in_ledger']],
    )
    const questions = await client.query('select candidate_id, question, options, source from import_question where batch_id = $1 order by id', [batch])
    assert.deepEqual(questions.rows.slice(1), [{ candidate_id: ids[3], question: 'Qual categoria é "Mercado"?', options: ['Alimentação', 'Casa', 'Contas da casa', 'Dívidas', 'Lazer', 'Nova categoria'], source: 'out!A5:G5' }])
    const status = await client.query('select status from import_batch where id = $1', [batch])
    assert.equal(status.rows[0]?.status, 'verified')
    const mismatch = { code: 'total_mismatch', detail: 'out!G8: expense 2026-10 pets expected 18990, found 37980' }
    assert.deepEqual(result.totals, { checked: 3, mismatches: [mismatch] })
    const checks = await client.query('select checks from import_batch where id = $1', [batch])
    assert.deepEqual(checks.rows[0]?.checks, [mismatch])
    const audit = await client.query<{ author: string; total: number }>("select author, count(*)::int as total from audit_log where entity in ('import_candidate', 'import_question', 'import_batch') and action = 'update' group by author")
    assert.deepEqual(audit.rows, [{ author: 'import', total: 7 }])
  })

  test('is idempotent: a second run writes nothing new', async () => {
    const { batch } = await stage('outubro-2.xlsx')
    await verifyBatch(client, actor, batch)
    const count = async () => (await client.query<{ total: number }>('select count(*)::int as total from audit_log')).rows[0]?.total
    const before = await count()
    const again = await verifyBatch(client, actor, batch)
    assert.deepEqual(again.questions, [])
    assert.equal(await count(), before)
  })

  test('refuses batches that are committed or closed', async () => {
    const { batch } = await stage('outubro-3.xlsx')
    await client.query("update import_batch set status = 'committed' where id = $1", [batch])
    await assert.rejects(verifyBatch(client, actor, batch), /not open for verification/)
    await assert.rejects(verifyBatch(client, actor, 999999n), /not open for verification/)
  })
})
