import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { seed, seedToday } from '../../src/db/seed.ts'
import { createServer } from '../../src/mcp/server.ts'
import { testDatabase } from '../db/database.ts'

type Money = { cents: string; brl: string }

describe('mcp read tools', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let mcp: Client

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const { content, isError } = await mcp.callTool({ name, arguments: args })
    const [first] = content as { type: string; text: string }[]
    assert.ok(first)
    return { isError, text: first.text, json: () => JSON.parse(first.text) }
  }

  before(async () => {
    db = await testDatabase()
    await seed(db.client)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await createServer(db.client).connect(serverTransport)
    mcp = new Client({ name: 'test', version: '0.0.0' })
    await mcp.connect(clientTransport)
  })

  after(async () => {
    await mcp.close()
    await db.drop()
  })

  test('lists only read-only tools', async () => {
    const { tools } = await mcp.listTools()
    assert.deepEqual(tools.map(({ name }) => name).sort(), ['list_debts', 'list_entries', 'month_summary'])
    assert.ok(tools.every(({ annotations }) => annotations?.readOnlyHint === true))
  })

  test('month_summary serializes cents as strings with BRL display', async () => {
    const { month, other, difference } = (await call('month_summary', { month: '2026-10', today: seedToday })).json()
    assert.equal(month.month, '2026-10-01')
    assert.equal(other.month, '2026-09-01')
    assert.deepEqual(month.expenses.late, { cents: '22200', brl: 'R$ 222,00' })
    assert.deepEqual(month.expenses.total, { cents: '1023800', brl: 'R$ 10.238,00' })
    assert.deepEqual(month.balance, { cents: '1006200', brl: 'R$ 10.062,00' })
    assert.equal(month.expenses.count, 13)
    assert.deepEqual(difference.expenses, { cents: '14300', brl: 'R$ 143,00' })
  })

  test('month_summary compares with a chosen month', async () => {
    const { other } = (await call('month_summary', { month: '2026-10', compare_with: '2026-01', today: seedToday })).json()
    assert.equal(other.month, '2026-01-01')
  })

  test('list_entries returns a month ordered by due date', async () => {
    const entries = (await call('list_entries', { month: '2026-10', today: seedToday })).json()
    assert.equal(entries.length, 16)
    const dates = entries.map(({ dueOn }: { dueOn: string }) => dueOn)
    assert.deepEqual(dates, [...dates].sort())
    assert.equal(typeof entries[0].id, 'string')
  })

  test('list_entries filters by state, category, account and member', async () => {
    const late = (await call('list_entries', { month: '2026-10', state: 'late', today: seedToday })).json()
    assert.deepEqual(
      late.map(({ description, status, amount }: { description: string; status: string; amount: Money }) => [description, status, amount.cents]),
      [['Electricity', 'late', '22200']],
    )
    const utilities = (await call('list_entries', { month: '2026-10', category: 'utilities', today: seedToday })).json()
    assert.deepEqual(utilities.map(({ description }: { description: string }) => description).sort(), ['Electricity', 'Internet'])
    const card = (await call('list_entries', { month: '2026-10', account: 'Marcio card', today: seedToday })).json()
    assert.ok(card.length > 0 && card.every(({ account, member }: { account: string; member: string }) => account === 'Marcio card' && member === 'Marcio'))
    const joint = (await call('list_entries', { month: '2026-10', member: 'joint', direction: 'expense', today: seedToday })).json()
    assert.ok(joint.length > 0 && joint.every(({ member }: { member: string | null }) => member === null))
  })

  test('list_entries derives late from planned entries past due', async () => {
    const late = (await call('list_entries', { month: '2026-10', direction: 'expense', state: 'late', today: '2026-11-01' })).json()
    const pending = (await call('list_entries', { month: '2026-10', state: 'pending', today: '2026-11-01' })).json()
    const total = late.reduce((sum: bigint, { amount }: { amount: Money }) => sum + BigInt(amount.cents), 0n)
    assert.equal(total, 22200n + 183300n)
    assert.deepEqual(pending, [])
  })

  test('list_debts lists active debts with installments left', async () => {
    const debts = (await call('list_debts')).json()
    assert.deepEqual(
      debts.map(({ description, member }: { description: string; member: string | null }) => [description, member]),
      [
        ['Car financing', null],
        ['Personal loan', 'Gabriela'],
      ],
    )
    const [car] = debts
    assert.equal(BigInt(car.balance.cents), BigInt(car.installment.cents) * BigInt(car.installmentsRemaining))
    assert.equal(car.monthlyRatePercent, '1.2900')
  })

  test('invalid input comes back as a tool error', async () => {
    const malformed = await call('month_summary', { month: '2026-13' })
    assert.equal(malformed.isError, true)
    assert.match(malformed.text, /YYYY-MM/)
    const unknown = await call('list_entries', { month: '2026-10', state: 'overdue' })
    assert.equal(unknown.isError, true)
  })
})
