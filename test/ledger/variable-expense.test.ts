import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { seed, seedToday } from '../../src/db/seed.ts'
import { listEntries } from '../../src/ledger/entries.ts'
import { forecastMonth } from '../../src/ledger/forecast.ts'
import { findMember } from '../../src/ledger/members.ts'
import { closeRecord, editRecord, listSetup, registerRecord } from '../../src/ledger/setup.ts'
import { monthSummary } from '../../src/ledger/summary.ts'
import { testDatabase } from '../db/database.ts'

describe('variable expenses', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client
  let actor: { author: 'member'; memberId: bigint }

  const market = { description: 'Supermercado', amountCents: 150000, startsOn: '2026-11-01', category: 'Alimentação', member: 'joint' }

  const find = async (name: string) => (await listSetup(client)).find((record) => record.kind === 'variable_expense' && record.name === name)

  const audit = async (id: bigint) => (await client.query<{ action: string; author: string }>("select action, author from audit_log where entity = 'variable_expense' and entity_id = $1 order by id", [id])).rows

  before(async () => {
    db = await testDatabase()
    client = db.client
    await seed(client)
    const marcio = await findMember(client, 'Marcio')
    assert.ok(marcio)
    actor = { author: 'member', memberId: marcio.id }
  })

  after(() => db.drop())

  test('registers, edits and closes a variable expense, each write audited', async () => {
    const id = await registerRecord(client, actor, 'variable_expense', market)
    assert.deepEqual(await find('Supermercado'), { kind: 'variable_expense', id: String(id), name: 'Supermercado', detail: null, amount: 150000n, day: null, member: null, category: 'Alimentação', account: null })
    await editRecord(client, actor, 'variable_expense', id, { name: 'Mercado do mês', amountCents: 180000, account: 'Conta conjunta', category: 'casa' })
    assert.deepEqual(await find('Mercado do mês'), { kind: 'variable_expense', id: String(id), name: 'Mercado do mês', detail: null, amount: 180000n, day: null, member: null, category: 'Casa', account: 'Conta conjunta' })
    await closeRecord(client, actor, 'variable_expense', id)
    assert.equal(await find('Mercado do mês'), undefined)
    assert.deepEqual(await audit(id), [
      { action: 'create', author: 'member' },
      { action: 'update', author: 'member' },
      { action: 'close', author: 'member' },
    ])
    await assert.rejects(editRecord(client, actor, 'variable_expense', id, { amountCents: 100 }), /not found or closed/)
  })

  test('keeps a member, and open descriptions unique case-insensitively', async () => {
    const fuel = await registerRecord(client, actor, 'variable_expense', { description: 'Combustível', amountCents: 40000, startsOn: '2026-11-01', category: 'Transporte', member: 'Gabriela', account: 'Conta Gabriela' })
    assert.equal((await find('Combustível'))?.member, 'Gabriela')
    await assert.rejects(registerRecord(client, actor, 'variable_expense', { ...market, description: 'combustível' }), /variable expense combustível already exists/)
    await closeRecord(client, actor, 'variable_expense', fuel)
    assert.ok(await registerRecord(client, actor, 'variable_expense', { ...market, description: 'combustível' }))
  })

  test('refuses invalid payloads and changes it has no field for', async () => {
    const refused = [
      [{ ...market, description: 'Mercado 123456' }, /description: runs of five or more digits/],
      [{ ...market, amountCents: 0 }, /amountCents/],
      [{ ...market, startsOn: '2026-11-15' }, /startsOn must be the first day of the month/],
      [{ ...market, category: 'Salário' }, /unknown expense category Salário/],
      [{ ...market, dayOfMonth: 5 }, /invalid variable_expense payload/],
    ] as const
    for (const [payload, message] of refused) await assert.rejects(registerRecord(client, actor, 'variable_expense', payload), message)
    const id = await registerRecord(client, actor, 'variable_expense', { ...market, description: 'Farmácia', category: 'Saúde' })
    await assert.rejects(editRecord(client, actor, 'variable_expense', id, { dayOfMonth: 10 }), /variable expense has no dayOfMonth to change/)
    await assert.rejects(editRecord(client, actor, 'variable_expense', id, { amountCents: 0 }), /variable expense amount must be positive/)
    await assert.rejects(editRecord(client, actor, 'variable_expense', id, { category: 'Freelance' }), /unknown expense category Freelance/)
  })

  test('the database refuses income categories, mid-month starts and deletes', async () => {
    const income = (await client.query<{ id: bigint }>("select id from category where name = 'Salário'")).rows[0]?.id
    await assert.rejects(client.query("insert into variable_expense (description, category_id, amount_cents, starts_on) values ('Teste', $1, 100, '2026-11-01')", [income]), /not an expense category/)
    const expense = (await client.query<{ id: bigint }>("select id from category where name = 'Lazer'")).rows[0]?.id
    await assert.rejects(client.query("insert into variable_expense (description, category_id, amount_cents, starts_on) values ('Teste', $1, 100, '2026-11-02')", [expense]), /check constraint/)
    await assert.rejects(client.query("insert into variable_expense (description, category_id, amount_cents, starts_on) values ('Cartão 4111111111111111', $1, 100, '2026-11-01')", [expense]), /check constraint/)
    await assert.rejects(client.query('delete from variable_expense'), /rows in variable_expense are never deleted/)
  })

  test('is a plan: the forecast and the summary of the month do not change', async () => {
    const forecast = await forecastMonth(client, actor, '2026-11')
    assert.ok(forecast.created.length > 0)
    const summary = await monthSummary(client, '2026-11', seedToday)
    const entries = await listEntries(client, { month: '2026-11' }, seedToday)
    await registerRecord(client, actor, 'variable_expense', { ...market, description: 'Feira', amountCents: 60000, startsOn: '2026-10-01' })
    assert.deepEqual(await monthSummary(client, '2026-11', seedToday), summary)
    assert.deepEqual(await forecastMonth(client, actor, '2026-11'), { month: '2026-11-01', created: [], skipped: forecast.created.length + forecast.skipped })
    assert.deepEqual(await listEntries(client, { month: '2026-11' }, seedToday), entries)
  })
})
