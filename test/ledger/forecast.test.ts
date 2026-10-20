import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { connect } from '../../src/db/connection.ts'
import { seed } from '../../src/db/seed.ts'
import { write } from '../../src/db/write.ts'
import { listEntries } from '../../src/ledger/entries.ts'
import { forecastMonth } from '../../src/ledger/forecast.ts'
import { findMember } from '../../src/ledger/members.ts'
import { testDatabase } from '../db/database.ts'

describe('forecast', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client
  const system = { author: 'system' } as const

  before(async () => {
    db = await testDatabase()
    client = db.client
    await seed(client)
  })

  after(() => db.drop())

  test('plans every active recurring expense and income of a new month', async () => {
    const forecast = await forecastMonth(client, system, '2026-11')
    assert.equal(forecast.month, '2026-11-01')
    assert.equal(forecast.created.length, 9)
    assert.equal(forecast.skipped, 0)
    const entries = await listEntries(client, { month: '2026-11' }, '2026-11-01')
    assert.deepEqual(
      entries.map(({ description, dueOn, amount, status, installmentNumber }) => [description, dueOn, amount, status, installmentNumber]),
      [
        ['Gabriela salary', '2026-11-05', 820000n, 'planned', null],
        ['Health plan', '2026-11-05', 98000n, 'planned', null],
        ['Marcio salary', '2026-11-05', 950000n, 'planned', null],
        ['Gym', '2026-11-07', 15000n, 'planned', null],
        ['Condominium fee', '2026-11-10', 85000n, 'planned', null],
        ['Rent', '2026-11-10', 320000n, 'planned', null],
        ['Sofa', '2026-11-12', 45000n, 'planned', 10],
        ['Electricity', '2026-11-15', 21000n, 'planned', null],
        ['Internet', '2026-11-20', 12000n, 'planned', null],
      ],
    )
    const { rows } = await client.query<{ origin: string; linked: number }>("select origin, count(*)::int as linked from entry where competence = '2026-11-01' and (income_id is not null or recurring_expense_id is not null) group by origin")
    assert.deepEqual(rows, [{ origin: 'manual', linked: 9 }])
  })

  test('is idempotent and skips months already recorded', async () => {
    assert.deepEqual(await forecastMonth(client, system, '2026-11'), { month: '2026-11-01', created: [], skipped: 9 })
    assert.deepEqual(await forecastMonth(client, system, '2026-10'), { month: '2026-10-01', created: [], skipped: 9 })
  })

  test('stops installments after the last one', async () => {
    const forecast = await forecastMonth(client, system, '2026-12')
    assert.equal(forecast.created.length, 8)
    const entries = await listEntries(client, { month: '2026-12' }, '2026-12-01')
    assert.equal(
      entries.some(({ description }) => description === 'Sofa'),
      false,
    )
  })

  test('does not recreate an entry that was closed', async () => {
    const [rent] = await listEntries(client, { month: '2026-12', category: 'housing' }, '2026-12-01')
    assert.ok(rent)
    await write(client, system, (ledger) => ledger.close('entry', rent.id))
    assert.deepEqual(await forecastMonth(client, system, '2026-12'), { month: '2026-12-01', created: [], skipped: 8 })
  })

  test('clamps the due day to the end of the month and ignores closed sources', async () => {
    await write(client, system, async (ledger) => {
      const [{ id: category_id }] = (await client.query("select id from category where name = 'Leisure'")).rows
      await ledger.create('recurring_expense', { description: 'Streaming', category_id, amount_cents: 5590n, day_of_month: 31, starts_on: '2027-01-01' })
      const closed = await ledger.create('recurring_expense', { description: 'Old magazine', category_id, amount_cents: 2990n, day_of_month: 3, starts_on: '2024-01-01' })
      await ledger.close('recurring_expense', closed.id as bigint)
    })
    await forecastMonth(client, system, '2027-02')
    const entries = await listEntries(client, { month: '2027-02', category: 'leisure' }, '2027-02-01')
    assert.deepEqual(
      entries.map(({ description, dueOn, member }) => [description, dueOn, member]),
      [['Streaming', '2027-02-28', null]],
    )
  })

  test('concurrent forecasts of the same month plan it once', async () => {
    const other = await connect(db.url)
    try {
      const results = await Promise.all([forecastMonth(client, system, '2027-03'), forecastMonth(other, system, '2027-03')])
      assert.deepEqual(results.map(({ created }) => created.length).sort(), [0, 9])
    } finally {
      await other.end()
    }
  })

  test('audits the planned entries with the actor', async () => {
    const gabriela = await findMember(client, 'Gabriela')
    assert.ok(gabriela)
    const forecast = await forecastMonth(client, { author: 'member', memberId: gabriela.id }, '2027-04')
    const { rows } = await client.query('select a.author, a.member_id, e.origin from audit_log a join entry e on e.id = a.entity_id where a.entity = $1 and a.entity_id = any($2) group by 1, 2, 3', ['entry', forecast.created])
    assert.deepEqual(rows, [{ author: 'member', member_id: gabriela.id, origin: 'manual' }])
    await assert.rejects(forecastMonth(client, system, '2027-13'), /month must be YYYY-MM/)
  })
})
