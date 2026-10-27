import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { seed } from '../../src/db/seed.ts'
import { listEntries } from '../../src/ledger/entries.ts'
import { forecastMonth } from '../../src/ledger/forecast.ts'
import { findMember } from '../../src/ledger/members.ts'
import { cancelEntry, correctEntry, createEntry } from '../../src/ledger/record.ts'
import { RuleError } from '../../src/ledger/rule.ts'
import { closeRecord, editRecord, listSetup, registerRecord } from '../../src/ledger/setup.ts'
import { testDatabase } from '../db/database.ts'

describe('setup and corrections', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client
  let actor: { author: 'member'; memberId: bigint }

  before(async () => {
    db = await testDatabase()
    client = db.client
    await seed(client)
    const marcio = await findMember(client, 'Marcio')
    assert.ok(marcio)
    actor = { author: 'member', memberId: marcio.id }
  })

  after(() => db.drop())

  const bakery = { month: '2026-10', dueOn: '2026-10-20', description: 'Padaria', direction: 'expense', amount: 1800n, category: 'alimentação', member: 'joint' } as const

  test('corrects an entry by closing it with a pointer to its replacement', async () => {
    const id = await createEntry(client, actor, bakery)
    const replacement = await correctEntry(client, actor, id, { ...bakery, amount: 2100n })
    const { rows } = await client.query<{ closed: boolean; replaced_by: bigint | null }>('select closed_at is not null as closed, replaced_by from entry where id = $1', [id])
    assert.deepEqual(rows[0], { closed: true, replaced_by: replacement })
    const padaria = (await listEntries(client, { month: '2026-10' }, '2026-10-26')).filter((entry) => entry.description === 'Padaria')
    assert.deepEqual(
      padaria.map((entry) => entry.amount),
      [2100n],
    )
    const audit = await client.query<{ action: string }>("select action from audit_log where entity = 'entry' and entity_id in ($1, $2) order by id", [id, replacement])
    assert.deepEqual(
      audit.rows.map((row) => row.action),
      ['create', 'create', 'close'],
    )
    await assert.rejects(correctEntry(client, actor, id, bakery), /not found or closed/)
  })

  test('a correction keeps the installment and the recurring source of the entry', async () => {
    const [sofa] = (await listEntries(client, { month: '2026-10' }, '2026-10-26')).filter((entry) => entry.description === 'Sofá')
    assert.ok(sofa?.installmentNumber)
    const replacement = await correctEntry(client, actor, BigInt(sofa.id), { month: '2026-10', dueOn: sofa.dueOn, description: 'Sofá', direction: 'expense', amount: 46000n, category: sofa.category, member: sofa.member ?? 'joint' })
    const { rows } = await client.query<{ installment_number: number; linked: boolean }>('select installment_number, recurring_expense_id is not null as linked from entry where id = $1', [replacement])
    assert.deepEqual(rows[0], { installment_number: sofa.installmentNumber, linked: true })
  })

  test('cancels an entry without deleting it, and the forecast does not plan it again', async () => {
    await forecastMonth(client, actor, '2026-12')
    const [rent] = (await listEntries(client, { month: '2026-12' }, '2026-12-01')).filter((entry) => entry.description === 'Aluguel')
    assert.ok(rent)
    await cancelEntry(client, actor, BigInt(rent.id))
    await forecastMonth(client, actor, '2026-12')
    assert.equal((await listEntries(client, { month: '2026-12' }, '2026-12-01')).filter((entry) => entry.description === 'Aluguel').length, 0)
    const { rows } = await client.query<{ total: number }>('select count(*)::int as total from entry where id = $1', [rent.id])
    assert.equal(rows[0]?.total, 1)
    await assert.rejects(cancelEntry(client, actor, BigInt(rent.id)), RuleError)
  })

  test('registers every kind and lists it with its references', async () => {
    const records = [
      ['category', { name: 'Pets', kind: 'expense' }],
      ['account', { institution: 'Banco Fictício', nickname: 'Conta reserva', lastFour: '4321', kind: 'savings', member: 'Gabriela' }],
      ['reserve', { name: 'Viagem', balanceCents: 50000, targetCents: 600000, account: 'Conta reserva' }],
      ['income', { description: 'Aluguel recebido', amountCents: 90000, dayOfMonth: 8, startsOn: '2026-11-01', category: 'Freelance', member: 'Gabriela' }],
      ['recurring_expense', { description: 'Ração', amountCents: 25000, dayOfMonth: 12, startsOn: '2026-11-01', category: 'Pets', member: 'joint' }],
      ['debt', { creditor: 'Loja Fictícia', description: 'Geladeira', principalCents: 400000, balanceCents: 300000, installmentCents: 40000, installmentsTotal: 10, installmentsPaid: 2, startsOn: '2026-08-01' }],
      ['goal', { name: 'Japão', targetCents: 2000000, savedCents: 0, reserve: 'Viagem' }],
    ] as const
    for (const [kind, payload] of records) await registerRecord(client, actor, kind, payload)
    const setup = await listSetup(client)
    const find = (kind: string, name: string) => setup.find((record) => record.kind === kind && record.name === name)
    assert.deepEqual(find('account', 'Conta reserva'), { kind: 'account', id: find('account', 'Conta reserva')?.id, name: 'Conta reserva', detail: 'Banco Fictício · savings · 4321', amount: null, day: null, member: 'Gabriela', category: null, account: null })
    assert.equal(find('recurring_expense', 'Ração')?.category, 'Pets')
    assert.equal(find('recurring_expense', 'Ração')?.amount, 25000n)
    assert.equal(find('goal', 'Japão')?.detail, 'Viagem')
    assert.equal(find('debt', 'Loja Fictícia')?.detail, 'Geladeira')
    const forecast = await forecastMonth(client, actor, '2027-01')
    const planned = await listEntries(client, { month: '2027-01' }, '2027-01-01')
    assert.ok(forecast.created.length > 0)
    assert.ok(planned.some((entry) => entry.description === 'Ração' && entry.category === 'Pets'))
  })

  test('refuses invalid payloads, duplicates, account numbers and unknown references', async () => {
    await assert.rejects(registerRecord(client, actor, 'category', { name: 'Pets', kind: 'expense' }), /category Pets already exists/)
    await assert.rejects(registerRecord(client, actor, 'account', { institution: 'Outro', nickname: 'conta reserva', lastFour: '9999', kind: 'checking' }), /account conta reserva already exists/)
    await assert.rejects(registerRecord(client, actor, 'account', { institution: 'Banco 123456', nickname: 'X', lastFour: '1111', kind: 'checking' }), /invalid account payload: institution/)
    await assert.rejects(registerRecord(client, actor, 'account', { institution: 'Banco', nickname: 'Y', lastFour: '12345', kind: 'checking' }), /invalid account payload: lastFour/)
    await assert.rejects(registerRecord(client, actor, 'recurring_expense', { description: 'Escola', amountCents: 100, dayOfMonth: 5, startsOn: '2026-11-01', category: 'Inexistente' }), /unknown expense category Inexistente/)
  })

  test('closes a record so lists and new entries no longer use it', async () => {
    const pets = (await listSetup(client)).find((record) => record.kind === 'category' && record.name === 'Pets')
    assert.ok(pets)
    await closeRecord(client, actor, 'category', BigInt(pets.id))
    assert.equal(
      (await listSetup(client)).find((record) => record.id === pets.id && record.kind === 'category'),
      undefined,
    )
    await assert.rejects(createEntry(client, actor, { ...bakery, category: 'Pets' }), /unknown expense category Pets/)
    await assert.rejects(closeRecord(client, actor, 'category', BigInt(pets.id)), /not found or closed/)
    const audit = await client.query<{ author: string }>("select author from audit_log where entity = 'category' and entity_id = $1 and action = 'close'", [pets.id])
    assert.deepEqual(audit.rows, [{ author: 'member' }])
  })

  const recordOf = async (kind: string, name: string) => {
    const record = (await listSetup(client)).find((item) => item.kind === kind && item.name === name)
    assert.ok(record, `${kind} ${name}`)
    return record
  }

  test('edits a recurring expense in place, audited, and the forecast follows', async () => {
    const internet = await recordOf('recurring_expense', 'Internet')
    await editRecord(client, actor, 'recurring_expense', BigInt(internet.id), { name: 'Internet fibra', amountCents: 13500, dayOfMonth: 21, account: 'Conta Marcio', category: 'moradia' })
    const edited = await recordOf('recurring_expense', 'Internet fibra')
    assert.deepEqual(edited, { ...internet, name: 'Internet fibra', amount: 13500n, day: 21, account: 'Conta Marcio', category: 'Moradia' })
    const audit = await client.query<{ action: string; before: { amount_cents: number }; after: { amount_cents: number } }>("select action, before, after from audit_log where entity = 'recurring_expense' and entity_id = $1 order by id desc limit 1", [internet.id])
    assert.deepEqual(
      audit.rows.map((row) => [row.action, row.before.amount_cents, row.after.amount_cents]),
      [['update', 12000, 13500]],
    )
    await forecastMonth(client, actor, '2027-02')
    const [planned] = (await listEntries(client, { month: '2027-02' }, '2027-02-01')).filter((entry) => entry.description === 'Internet fibra')
    assert.deepEqual([planned?.amount, planned?.dueOn, planned?.account], [13500n, '2027-02-21', 'Conta Marcio'])
    await editRecord(client, actor, 'recurring_expense', BigInt(internet.id), { account: null })
    assert.equal((await recordOf('recurring_expense', 'Internet fibra')).account, null)
  })

  test('edits the amount each kind keeps: balance of a reserve or debt, target of a goal', async () => {
    const reserve = await recordOf('reserve', 'Viagem')
    const debt = await recordOf('debt', 'Loja Fictícia')
    const goal = await recordOf('goal', 'Japão')
    await editRecord(client, actor, 'reserve', BigInt(reserve.id), { amountCents: 0 })
    await editRecord(client, actor, 'debt', BigInt(debt.id), { name: 'Loja Exemplo', amountCents: 260000 })
    await editRecord(client, actor, 'goal', BigInt(goal.id), { amountCents: 2500000 })
    assert.equal((await recordOf('reserve', 'Viagem')).amount, 0n)
    assert.equal((await recordOf('debt', 'Loja Exemplo')).amount, 260000n)
    assert.equal((await recordOf('goal', 'Japão')).amount, 2500000n)
  })

  test('refuses edits a kind does not have, duplicates, unknown references and closed records', async () => {
    const lazer = await recordOf('category', 'Lazer')
    const goal = await recordOf('goal', 'Japão')
    const income = await recordOf('income', 'Salário Marcio')
    await assert.rejects(editRecord(client, actor, 'category', BigInt(lazer.id), { amountCents: 100 }), /category has no amountCents to change/)
    await assert.rejects(editRecord(client, actor, 'category', BigInt(lazer.id), {}), /nothing to change/)
    await assert.rejects(editRecord(client, actor, 'category', BigInt(lazer.id), { name: 'saúde' }), /category saúde already exists/)
    await assert.rejects(editRecord(client, actor, 'goal', BigInt(goal.id), { name: 'viagem a lisboa' }), /goal viagem a lisboa already exists/)
    await assert.rejects(editRecord(client, actor, 'goal', BigInt(goal.id), { amountCents: 0 }), /goal amount must be positive/)
    await assert.rejects(editRecord(client, actor, 'income', BigInt(income.id), { category: 'Moradia' }), /unknown income category Moradia/)
    await assert.rejects(editRecord(client, actor, 'income', BigInt(income.id), { account: 'Inexistente' }), /unknown account Inexistente/)
    await assert.rejects(editRecord(client, actor, 'income', BigInt(income.id), { name: 'Salário 123456' }), /invalid income payload: name/)
    await assert.rejects(editRecord(client, actor, 'income', BigInt(income.id), { note: 'x' }), /invalid income payload/)
    const pets = (await client.query<{ id: bigint }>("select id from category where name = 'Pets'")).rows[0]
    assert.ok(pets)
    await assert.rejects(editRecord(client, actor, 'category', pets.id, { name: 'Bichos' }), /not found or closed/)
  })

  test('a closed name can be registered again, an open one cannot in any case', async () => {
    const again = await registerRecord(client, actor, 'category', { name: 'Pets', kind: 'expense' })
    const { rows } = await client.query<{ id: bigint; open: boolean }>("select id, closed_at is null as open from category where name = 'Pets' order by id")
    assert.deepEqual(
      rows.map((row) => row.open),
      [false, true],
    )
    assert.equal(rows[1]?.id, again)
    await assert.rejects(registerRecord(client, actor, 'category', { name: 'pets', kind: 'expense' }), /category pets already exists/)
    const viagem = await recordOf('reserve', 'Viagem')
    await closeRecord(client, actor, 'reserve', BigInt(viagem.id))
    await registerRecord(client, actor, 'reserve', { name: 'Viagem', balanceCents: 0 })
    await assert.rejects(registerRecord(client, actor, 'account', { institution: 'Banco Aurora', nickname: 'Outra', lastFour: '0427', kind: 'checking' }), /account Outra already exists/)
  })
})
