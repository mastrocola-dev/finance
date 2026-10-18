import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { seed, seedMonths, seedToday } from '../../src/db/seed.ts'
import { testDatabase } from './database.ts'

const snapshot = 'select competence, due_on, description, direction, amount_cents, status, paid_on, installment_number from entry order by competence, due_on, description, amount_cents'

describe('fictional seed', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client

  const one = async (sql: string) => (await client.query(sql)).rows[0]

  before(async () => {
    db = await testDatabase()
    client = db.client
    await seed(client)
  })

  after(() => db.drop())

  test('two members splitting 50/50', async () => {
    const { rows } = await client.query('select name, share_percent from member order by id')
    assert.deepEqual(rows, [
      { name: 'Marcio', share_percent: 50 },
      { name: 'Gabriela', share_percent: 50 },
    ])
  })

  test('twelve months with income and expenses in each', async () => {
    const { rows } = await client.query("select competence, count(*) filter (where direction = 'income')::int as incomes, count(*) filter (where direction = 'expense')::int as expenses from entry group by competence order by competence")
    assert.deepEqual(
      rows.map((row) => row.competence),
      seedMonths,
    )
    assert.ok(rows.every((row) => row.incomes >= 2 && row.expenses >= 10))
  })

  test('past months are paid and the current month mixes paid, late and planned', async () => {
    const past = await one(`select count(*)::int as total from entry where competence < '${seedMonths.at(-1)}' and status <> 'paid'`)
    assert.equal(past.total, 0)
    const { rows } = await client.query(`select distinct status from entry where competence = '${seedMonths.at(-1)}' order by status`)
    assert.deepEqual(
      rows.map((row) => row.status),
      ['late', 'paid', 'planned'],
    )
    const future = await one(`select count(*)::int as total from entry where paid_on >= '${seedToday}' or (status = 'planned' and due_on < '${seedToday}')`)
    assert.equal(future.total, 0)
  })

  test('debts match their paid installment entries', async () => {
    const { rows } = await client.query("select d.description, d.installments_paid, d.installments_total, d.balance_cents, d.installment_cents, max(e.installment_number) filter (where e.status = 'paid') as last_paid from debt d join entry e on e.debt_id = d.id group by d.id order by d.id")
    assert.equal(rows.length, 2)
    for (const debt of rows) {
      assert.equal(debt.last_paid, debt.installments_paid)
      assert.equal(debt.balance_cents, debt.installment_cents * BigInt(debt.installments_total - debt.installments_paid))
    }
  })

  test('installment expenses are numbered from their start', async () => {
    const { rows } = await client.query('select e.competence, e.installment_number from entry e join recurring_expense r on r.id = e.recurring_expense_id where r.installments_total is not null order by e.competence')
    assert.equal(rows[0]?.competence, '2026-02-01')
    assert.deepEqual(
      rows.map((row) => row.installment_number),
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
    )
  })

  test('one reserve and one goal', async () => {
    assert.equal((await one('select count(*)::int as total from reserve')).total, 1)
    assert.equal((await one('select count(*)::int as total from goal')).total, 1)
  })

  test('every row is audited as system', async () => {
    const audit = await one("select count(*)::int as total, count(*) filter (where author <> 'system' or action <> 'create')::int as other from audit_log")
    const rows = await one(
      'select (select count(*) from member) + (select count(*) from account) + (select count(*) from category) + (select count(*) from income) + (select count(*) from recurring_expense) + (select count(*) from debt) + (select count(*) from entry) + (select count(*) from reserve) + (select count(*) from goal) as total',
    )
    assert.equal(BigInt(audit.total), rows.total)
    assert.equal(audit.other, 0)
  })

  test('refuses to seed twice', async () => {
    await assert.rejects(seed(client), /already has members/)
  })

  test('is deterministic', async () => {
    const other = await testDatabase()
    try {
      await seed(other.client)
      assert.deepEqual((await other.client.query(snapshot)).rows, (await client.query(snapshot)).rows)
    } finally {
      await other.drop()
    }
  })
})
