import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { seed, seedToday } from '../../src/db/seed.ts'
import { type Actor, write } from '../../src/db/write.ts'
import { cardLimits } from '../../src/ledger/cards.ts'
import { forecastMonth } from '../../src/ledger/forecast.ts'
import { findMember } from '../../src/ledger/members.ts'
import { monthSplit } from '../../src/ledger/split.ts'
import { monthSummary } from '../../src/ledger/summary.ts'
import { netWorth } from '../../src/ledger/worth.ts'
import { testDatabase } from '../db/database.ts'

describe('card installments and limits', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client
  let actor: Actor
  let marcioCard: bigint
  let jointCard: bigint
  let checking: bigint
  let baseline: unknown

  const idOf = async (sql: string, value: string) => {
    const id = (await client.query<{ id: bigint }>(sql, [value])).rows[0]?.id
    assert.ok(id)
    return id
  }

  const ledgerView = async () => ({
    summaries: [await monthSummary(client, '2026-10', seedToday), await monthSummary(client, '2026-11', seedToday)],
    split: await monthSplit(client, '2026-10'),
    worth: await netWorth(client),
  })

  const installment = (account: bigint, description: string, cents: number, total: number, firstBill: string, category: bigint | null = null) =>
    write(client, actor, (ledger) => ledger.create('card_installment', { account_id: account, description, installment_cents: cents, installments_total: total, first_bill: firstBill, category_id: category }))

  before(async () => {
    db = await testDatabase()
    client = db.client
    await seed(client)
    const marcio = await findMember(client, 'Marcio')
    assert.ok(marcio)
    actor = { author: 'member', memberId: marcio.id }
    marcioCard = await idOf('select id from account where nickname = $1', 'Cartão Marcio')
    checking = await idOf('select id from account where nickname = $1', 'Conta conjunta')
    const casa = await idOf("select id from category where kind = 'expense' and name = $1", 'Casa')
    await forecastMonth(client, actor, '2026-11')
    baseline = await ledgerView()
    jointCard = (await write(client, actor, (ledger) => ledger.create('account', { institution: 'Banco Aurora', nickname: 'Cartão conjunto', last_four: '0429', kind: 'credit_card' }))).id as bigint
    await write(client, actor, (ledger) => ledger.update('account', marcioCard, { credit_limit_cents: 1000000 }))
    await installment(marcioCard, 'Televisão', 25000, 10, '2026-09-01', casa)
    await installment(marcioCard, 'Curso de inglês', 40000, 3, '2026-09-01')
    await installment(marcioCard, 'Fone antigo', 10000, 2, '2026-01-01')
    await installment(marcioCard, 'Passagens', 50000, 4, '2026-12-01')
    const cancelled = (await installment(marcioCard, 'Compra cancelada', 30000, 5, '2026-10-01')).id as bigint
    await write(client, actor, (ledger) => ledger.close('card_installment', cancelled))
    await installment(jointCard, 'Geladeira', 50000, 6, '2026-11-01', casa)
  })

  after(() => db.drop())

  test('gives limit, committed, available and releases per card for a month', async () => {
    const [joint, marcio, ...rest] = await cardLimits(client, '2026-11')
    assert.deepEqual(rest, [])
    assert.equal(joint?.nickname, 'Cartão conjunto')
    assert.deepEqual({ limit: joint?.limit, committed: joint?.committed, available: joint?.available, member: joint?.member }, { limit: null, committed: 300000n, available: null, member: null })
    assert.deepEqual(
      joint?.installments.map(({ description, category, current, remaining, lastBill }) => ({ description, category, current, remaining, lastBill })),
      [{ description: 'Geladeira', category: 'Casa', current: 1, remaining: 6, lastBill: '2027-04-01' }],
    )
    assert.ok(marcio)
    assert.deepEqual(
      { nickname: marcio.nickname, institution: marcio.institution, lastFour: marcio.lastFour, member: marcio.member, limit: marcio.limit, committed: marcio.committed, available: marcio.available },
      { nickname: 'Cartão Marcio', institution: 'Banco Horizonte', lastFour: '8812', member: 'Marcio', limit: 1000000n, committed: 440000n, available: 560000n },
    )
    assert.deepEqual(
      marcio.installments.map(({ description, installment, installmentsTotal, current, remaining, firstBill, lastBill, committed }) => [description, installment, installmentsTotal, current, remaining, firstBill, lastBill, committed]),
      [
        ['Televisão', 25000n, 10, 3, 8, '2026-09-01', '2027-06-01', 200000n],
        ['Curso de inglês', 40000n, 3, 3, 1, '2026-09-01', '2026-11-01', 40000n],
        ['Passagens', 50000n, 4, null, 4, '2026-12-01', '2027-03-01', 200000n],
      ],
    )
    assert.deepEqual(
      marcio.releases.map(({ month, amount }) => [month, amount]),
      [
        ['2026-11-01', 65000n],
        ['2026-12-01', 75000n],
        ['2027-01-01', 75000n],
        ['2027-02-01', 75000n],
        ['2027-03-01', 75000n],
        ['2027-04-01', 25000n],
        ['2027-05-01', 25000n],
        ['2027-06-01', 25000n],
      ],
    )
  })

  test('an installment ending this month frees the limit next month', async () => {
    const marcio = (await cardLimits(client, '2026-12')).find((card) => card.id === marcioCard)
    assert.deepEqual(
      marcio?.installments.map(({ description, current }) => [description, current]),
      [
        ['Televisão', 4],
        ['Passagens', 1],
      ],
    )
    assert.equal(marcio?.committed, 375000n)
    assert.equal(marcio?.available, 625000n)
    assert.equal((await cardLimits(client, '2027-07')).find((card) => card.id === marcioCard)?.committed, 0n)
  })

  test('the month summary, settlement and net worth ignore installments, and the forecast creates nothing from them', async () => {
    assert.deepEqual(await ledgerView(), baseline)
    await forecastMonth(client, actor, '2026-12')
    const { rows } = await client.query("select 1 from entry where description in ('Televisão', 'Curso de inglês', 'Passagens', 'Geladeira')")
    assert.deepEqual(rows, [])
  })

  test('refuses an invalid month', async () => {
    await assert.rejects(cardLimits(client, '2026-13'), /month must be YYYY-MM/)
  })

  test('the database keeps installments on credit cards with valid amounts and never deletes them', async () => {
    const insert = (values: string) => client.query(`insert into card_installment (account_id, description, installment_cents, installments_total, first_bill, category_id) values ${values}`)
    const income = await idOf("select id from category where kind = 'income' and name = $1", 'Salário')
    await assert.rejects(insert(`(${checking}, 'Teste', 100, 2, '2026-11-01', null)`), /is not a credit card/)
    await assert.rejects(insert(`(${marcioCard}, 'Teste', 100, 2, '2026-11-01', ${income})`), /not an expense category/)
    await assert.rejects(insert(`(${marcioCard}, 'Teste', 100, 1, '2026-11-01', null)`), /check constraint/)
    await assert.rejects(insert(`(${marcioCard}, 'Teste', 0, 2, '2026-11-01', null)`), /check constraint/)
    await assert.rejects(insert(`(${marcioCard}, 'Teste', 100, 2, '2026-11-15', null)`), /check constraint/)
    await assert.rejects(insert(`(${marcioCard}, 'Cartão 4111111111111111', 100, 2, '2026-11-01', null)`), /check constraint/)
    await assert.rejects(client.query('delete from card_installment'), /rows in card_installment are never deleted/)
    await assert.rejects(client.query('update account set credit_limit_cents = 100 where id = $1', [checking]), /account_credit_limit_on_card/)
    await assert.rejects(client.query('update account set credit_limit_cents = 0 where id = $1', [marcioCard]), /check constraint/)
    await assert.rejects(client.query("update account set kind = 'checking' where id = $1", [marcioCard]), /has open card installments/)
  })

  test('every installment write is audited', async () => {
    const { rows } = await client.query<{ action: string; count: number }>("select action, count(*)::int as count from audit_log where entity = 'card_installment' group by action order by action")
    assert.deepEqual(rows, [
      { action: 'close', count: 1 },
      { action: 'create', count: 6 },
    ])
  })
})
