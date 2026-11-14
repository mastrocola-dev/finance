import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { seed, seedToday } from '../../src/db/seed.ts'
import { findMember } from '../../src/ledger/members.ts'
import { cancelEntry, createEntry } from '../../src/ledger/record.ts'
import { registerRecord } from '../../src/ledger/setup.ts'
import { monthSummary } from '../../src/ledger/summary.ts'
import { variablePlan } from '../../src/ledger/variables.ts'
import { testDatabase } from '../db/database.ts'

describe('variable plan of a month', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client
  let actor: { author: 'member'; memberId: bigint }

  const lines = async (month: string, member?: string) => (await variablePlan(client, month, member)).items.map(({ description, member, estimate, spent }) => ({ description, member, estimate, spent }))

  before(async () => {
    db = await testDatabase()
    client = db.client
    await seed(client)
    const marcio = await findMember(client, 'Marcio')
    assert.ok(marcio)
    actor = { author: 'member', memberId: marcio.id }
  })

  after(() => db.drop())

  test('compares each estimate with the expense entries of its category and member, recurring and debt entries left out', async () => {
    assert.deepEqual(await lines('2026-10'), [
      { description: 'Supermercado', member: null, estimate: 130000n, spent: 125400n },
      { description: 'Farmácia', member: null, estimate: 12000n, spent: 13300n },
      { description: 'Combustível', member: 'Marcio', estimate: 40000n, spent: 33900n },
    ])
    const { items, ...totals } = await variablePlan(client, '2026-10')
    assert.deepEqual(totals, { month: '2026-10-01', estimate: 182000n, spent: 172600n, unspent: 10700n })
  })

  test('the projected balance takes the larger of estimate and spent per variable expense', async () => {
    const { balance } = await monthSummary(client, '2026-10', seedToday)
    const plan = await variablePlan(client, '2026-10')
    const larger = plan.items.reduce((sum, { estimate, spent }) => sum + (estimate > spent ? estimate : spent), 0n)
    assert.equal(balance - plan.unspent, balance + plan.spent - larger)
    const empty = await variablePlan(client, '2026-12')
    assert.deepEqual([empty.spent, empty.unspent], [0n, empty.estimate])
  })

  test('follows new and cancelled entries, the member filter and the first month', async () => {
    const entry = await createEntry(client, actor, { month: '2026-10', dueOn: '2026-10-27', description: 'Feira', direction: 'expense', amount: 8000n, category: 'Alimentação', member: 'joint' })
    await createEntry(client, actor, { month: '2026-10', dueOn: '2026-10-27', description: 'Lanche', direction: 'expense', amount: 3000n, category: 'Alimentação', member: 'Gabriela' })
    assert.equal((await variablePlan(client, '2026-10')).unspent, 6100n)
    await cancelEntry(client, actor, entry)
    assert.equal((await variablePlan(client, '2026-10')).unspent, 10700n)
    assert.deepEqual(
      (await lines('2026-10', 'marcio')).map(({ description }) => description),
      ['Combustível'],
    )
    assert.deepEqual(
      (await lines('2026-10', 'joint')).map(({ description }) => description),
      ['Supermercado', 'Farmácia'],
    )
    assert.deepEqual(await lines('2026-10', 'Gabriela'), [])
    await registerRecord(client, actor, 'variable_expense', { description: 'Presentes', amountCents: 20000, startsOn: '2026-12-01', category: 'Lazer', member: 'joint' })
    assert.equal((await variablePlan(client, '2026-11')).estimate, 182000n)
    assert.equal((await variablePlan(client, '2026-12')).estimate, 202000n)
    assert.equal((await variablePlan(client, '2025-10')).items.length, 0)
  })
})
