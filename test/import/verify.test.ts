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

  test('resolves names by similarity and plans missing categories once per batch', () => {
    const pets: Staged = { id: 9n, kind: 'category', source: '$.categories[0]', confidence: 1, checks: [], payload: { name: 'Pets', kind: 'expense' } }
    const { checks, asks, resolved, missing } = findChecks(
      [entry(1, { member: 'GMA', category: 'pets' }), entry(2, { member: 'Tia Rosa', account: 'Nubank', description: 'Padaria', category: 'Alimentacao' }), entry(3, { category: 'Farmácias', description: 'Remédio' }), entry(4, { category: 'farmacia', description: 'Vitamina' }), pets],
      references,
    )
    assert.deepEqual(checks.get(1n), [{ code: 'matched_member', detail: 'GMA → Gabriela' }])
    assert.deepEqual(checks.get(2n), [
      { code: 'member_unmatched', detail: 'Tia Rosa' },
      { code: 'account_unmatched', detail: 'Nubank' },
      { code: 'matched_category', detail: 'Alimentacao → Alimentação' },
    ])
    assert.deepEqual(checks.get(3n), [])
    assert.deepEqual(checks.get(4n), [{ code: 'matched_category', detail: 'farmacia → Farmácias' }])
    assert.deepEqual(missing, [{ name: 'Farmácias', kind: 'expense', source: '2026-10!A3:G3' }])
    assert.deepEqual(resolved.get(1n), { member: 'Gabriela' })
    assert.deepEqual(resolved.get(2n), { member: 'joint', account: undefined, category: 'Alimentação' })
    assert.deepEqual(asks, [])
  })

  test('still asks for the member of an income and for unknown reserves', () => {
    const goal: Staged = { id: 5n, kind: 'goal', source: 'G2', confidence: 1, checks: [], payload: { name: 'Viagem', targetCents: 500000, savedCents: 0, reserve: 'Cofrinho' } }
    const { checks, asks } = findChecks([entry(1, { direction: 'income', description: 'Bônus', category: 'Salario', member: 'Tia Rosa' }), goal], references)
    assert.deepEqual(checks.get(1n), [
      { code: 'unknown_member', detail: 'Tia Rosa' },
      { code: 'matched_category', detail: 'Salario → Salário' },
    ])
    assert.deepEqual(checks.get(5n), [{ code: 'unknown_reserve', detail: 'Cofrinho' }])
    assert.deepEqual(
      asks.map(({ reference, name, candidate }) => [reference, name, candidate]),
      [
        ['member', 'Tia Rosa', 1n],
        ['reserve', 'Cofrinho', 5n],
      ],
    )
    assert.deepEqual(questionFor(asks[0] ?? assert.fail(), references), { question: 'Quem é "Tia Rosa"?', options: ['Marcio', 'Gabriela', 'Conjunto'] })
  })

  test('does not plan again a category the reviewers rejected', () => {
    const { checks, missing, asks } = findChecks([entry(1, { category: 'Pets' })], references, 0.8, [{ name: 'pets', kind: 'expense' }])
    assert.deepEqual(missing, [])
    assert.deepEqual(checks.get(1n), [{ code: 'unknown_category', detail: 'Pets' }])
    assert.deepEqual(questionFor(asks[0] ?? assert.fail(), references), { question: 'Qual categoria é "Pets"?', options: ['Alimentação', 'Nova categoria'] })
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

  test('stores checks, resolves names, creates missing categories and marks the batch verified', async () => {
    const { batch, ids } = await stage('outubro.xlsx')
    const result = await verifyBatch(client, actor, batch)
    assert.deepEqual(result.failed, [ids[0], ids[2], ids[5]])
    assert.deepEqual(result.lowConfidence, [ids[1]])
    assert.equal(result.checked, 6)
    assert.equal(result.created, 1)
    assert.deepEqual(result.questions, [])
    const { rows } = await client.query<{ kind: string; status: string; source: string; payload: unknown; checks: { code: string }[] }>('select kind, status, source, payload, checks from import_candidate where batch_id = $1 order by id', [batch])
    assert.deepEqual(
      rows.map((row) => row.checks.map((check) => check.code)),
      [['duplicate_in_ledger'], ['low_confidence', 'matched_member'], ['matched_member', 'duplicate_in_file'], [], [], ['duplicate_in_ledger'], []],
    )
    assert.deepEqual(rows[6], { kind: 'category', status: 'accepted', source: 'out!A5:G5', payload: { name: 'Mercado', kind: 'expense' }, checks: [] })
    const questions = await client.query('select question from import_question where batch_id = $1 order by id', [batch])
    assert.deepEqual(questions.rows, [{ question: 'GMA é a Gabriela?' }])
    const status = await client.query('select status from import_batch where id = $1', [batch])
    assert.equal(status.rows[0]?.status, 'verified')
    const mismatch = { code: 'total_mismatch', detail: 'out!G8: expense 2026-10 pets expected 18990, found 37980' }
    assert.deepEqual(result.totals, { checked: 3, mismatches: [mismatch] })
    const checks = await client.query('select checks from import_batch where id = $1', [batch])
    assert.deepEqual(checks.rows[0]?.checks, [mismatch])
    const audit = await client.query<{ author: string; total: number }>("select author, count(*)::int as total from audit_log where entity in ('import_candidate', 'import_question', 'import_batch') and action = 'update' group by author")
    assert.deepEqual(audit.rows, [{ author: 'import', total: 6 }])
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
