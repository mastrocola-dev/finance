import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { seed, seedToday } from '../../src/db/seed.ts'
import { write } from '../../src/db/write.ts'
import { compareMonths, competenceOf, localToday, monthSummary, shiftMonth } from '../../src/ledger/summary.ts'
import { testDatabase } from '../db/database.ts'

describe('month summary', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client

  before(async () => {
    db = await testDatabase()
    client = db.client
    await seed(client)
  })

  after(() => db.drop())

  test('current seed month splits paid, pending and late', async () => {
    const summary = await monthSummary(client, '2026-10', seedToday)
    const { byCategory: incomeByCategory, ...income } = summary.income
    const { byCategory, ...expenses } = summary.expenses
    assert.equal(summary.month, '2026-10-01')
    assert.deepEqual(income, { count: 3, total: 2030000n, paid: 1770000n, pending: 260000n, late: 0n })
    assert.deepEqual(expenses, { count: 13, total: 1023800n, paid: 818300n, pending: 183300n, late: 22200n })
    assert.equal(summary.balance, 1006200n)
    assert.deepEqual(
      incomeByCategory.map(({ category, total }) => [category, total]),
      [
        ['Salary', 1770000n],
        ['Freelance', 260000n],
      ],
    )
    assert.deepEqual(byCategory[0], { category: 'Housing', count: 2, total: 405000n, paid: 405000n, pending: 0n, late: 0n })
    assert.deepEqual(
      byCategory.find(({ category }) => category === 'Utilities'),
      { category: 'Utilities', count: 2, total: 34200n, paid: 0n, pending: 12000n, late: 22200n },
    )
  })

  test('categories are ordered by total and add up to the side totals', async () => {
    const { expenses } = await monthSummary(client, '2026-10', seedToday)
    const totals = expenses.byCategory.map(({ total }) => total)
    assert.deepEqual(
      totals,
      [...totals].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0)),
    )
    assert.equal(
      totals.reduce((sum, total) => sum + total, 0n),
      expenses.total,
    )
    assert.equal(expenses.paid + expenses.pending + expenses.late, expenses.total)
  })

  test('planned entries past their due date count as late', async () => {
    const { expenses, income } = await monthSummary(client, '2026-10', '2026-11-01')
    assert.equal(expenses.pending, 0n)
    assert.equal(expenses.late, 22200n + 183300n)
    assert.equal(income.late, 260000n)
  })

  test('a past month is fully paid', async () => {
    const { income, expenses } = await monthSummary(client, '2026-09-01', seedToday)
    assert.deepEqual([income.total, income.paid, expenses.total, expenses.paid], [1770000n, 1770000n, 1009500n, 1009500n])
  })

  test('a month without entries is all zeros', async () => {
    const summary = await monthSummary(client, '2030-01', seedToday)
    assert.deepEqual(summary.expenses, { count: 0, total: 0n, paid: 0n, pending: 0n, late: 0n, byCategory: [] })
    assert.equal(summary.balance, 0n)
  })

  test('compares with the previous month by default', async () => {
    const { other, difference } = await compareMonths(client, '2026-10', undefined, seedToday)
    assert.equal(other.month, '2026-09-01')
    assert.deepEqual([difference.income, difference.expenses, difference.balance], [260000n, 14300n, 245700n])
    assert.deepEqual(difference.expensesByCategory[0], { category: 'Groceries', month: 125400n, other: 118000n, difference: 7400n })
    assert.equal(
      difference.expensesByCategory.reduce((sum, { difference }) => sum + difference, 0n),
      difference.expenses,
    )
  })

  test('compares with any month, keeping categories present on one side only', async () => {
    const { other, difference } = await compareMonths(client, '2026-10', '2026-01', seedToday)
    assert.equal(other.month, '2026-01-01')
    const home = difference.expensesByCategory.find(({ category }) => category === 'Home')
    assert.deepEqual(home, { category: 'Home', month: 45000n, other: 0n, difference: 45000n })
  })

  test('rejects malformed months and dates', async () => {
    await assert.rejects(monthSummary(client, '2026-13', seedToday), /YYYY-MM/)
    await assert.rejects(monthSummary(client, 'october', seedToday), /YYYY-MM/)
    await assert.rejects(monthSummary(client, '2026-10-40', seedToday), /YYYY-MM/)
    await assert.rejects(monthSummary(client, '2026-10', '18/10/2026'), /today/)
  })

  test('closed entries are left out', async () => {
    const { rows } = await client.query<{ id: bigint; amount_cents: bigint }>("select id, amount_cents from entry where competence = '2026-10-01' and description = 'Electricity'")
    const [electricity] = rows
    assert.ok(electricity)
    await write(client, { author: 'system' }, (ledger) => ledger.close('entry', electricity.id))
    const { expenses } = await monthSummary(client, '2026-10', seedToday)
    assert.deepEqual([expenses.count, expenses.total, expenses.late], [12, 1023800n - electricity.amount_cents, 0n])
  })
})

describe('month helpers', () => {
  test('competence is the first day of the month', () => {
    assert.equal(competenceOf('2026-02'), '2026-02-01')
    assert.equal(competenceOf('2026-02-17'), '2026-02-01')
  })

  test('shifts months across years', () => {
    assert.equal(shiftMonth('2026-01', -1), '2025-12-01')
    assert.equal(shiftMonth('2026-11-30', 2), '2027-01-01')
  })

  test('today is taken in America/Sao_Paulo', () => {
    assert.equal(localToday(new Date('2026-10-19T02:30:00Z')), '2026-10-18')
    assert.equal(localToday(new Date('2026-10-19T03:30:00Z')), '2026-10-19')
  })
})
