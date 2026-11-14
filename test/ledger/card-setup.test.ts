import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { seed } from '../../src/db/seed.ts'
import { cardLimits } from '../../src/ledger/cards.ts'
import { findMember } from '../../src/ledger/members.ts'
import { RuleError } from '../../src/ledger/rule.ts'
import { closeRecord, editRecord, listSetup, registerRecord } from '../../src/ledger/setup.ts'
import { bareSeedCard } from '../db/bare-card.ts'
import { testDatabase } from '../db/database.ts'

describe('card installments and limits as setup records', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client
  let actor: { author: 'member'; memberId: bigint }

  const tv = { description: 'Televisão', account: 'Cartão Marcio', amountCents: 25000, installmentsTotal: 10, currentInstallment: 3, billMonth: '2026-11-01', category: 'Casa', member: 'Marcio' }

  const find = async (kind: string, name: string) => (await listSetup(client)).find((record) => record.kind === kind && record.name === name)

  const refused = (work: Promise<unknown>, message: RegExp) => assert.rejects(work, (error) => error instanceof RuleError && message.test(error.message))

  before(async () => {
    db = await testDatabase()
    client = db.client
    await seed(client)
    await bareSeedCard(client)
    const marcio = await findMember(client, 'Marcio')
    assert.ok(marcio)
    actor = { author: 'member', memberId: marcio.id }
  })

  after(() => db.drop())

  test('stores the first bill from the current installment of the chosen month', async () => {
    const id = await registerRecord(client, actor, 'card_installment', tv)
    const { rows } = await client.query<{ first_bill: string; installments_total: number }>('select first_bill::text, installments_total from card_installment where id = $1', [id])
    assert.deepEqual(rows, [{ first_bill: '2026-09-01', installments_total: 10 }])
    const record = await find('card_installment', 'Televisão')
    assert.deepEqual(record && { ...record, id: undefined }, { kind: 'card_installment', id: undefined, name: 'Televisão', detail: '10 installments from 2026-09-01', amount: 25000n, day: null, member: 'Marcio', category: 'Casa', account: 'Cartão Marcio' })
    const [card] = (await cardLimits(client, '2026-11')).filter((item) => item.nickname === 'Cartão Marcio')
    assert.deepEqual(
      card?.installments.map((item) => [item.description, item.current, item.remaining, item.lastBill]),
      [['Televisão', 3, 8, '2027-06-01']],
    )
    await closeRecord(client, actor, 'card_installment', id)
  })

  test('refuses a payload that is not a card installment on a credit card', async () => {
    await refused(registerRecord(client, actor, 'card_installment', { ...tv, account: 'Conta conjunta' }), /account Conta conjunta is not a credit card/)
    await refused(registerRecord(client, actor, 'card_installment', { ...tv, currentInstallment: 11 }), /currentInstallment exceeds installmentsTotal/)
    await refused(registerRecord(client, actor, 'card_installment', { ...tv, installmentsTotal: 1, currentInstallment: 1 }), /installmentsTotal/)
    await refused(registerRecord(client, actor, 'card_installment', { ...tv, billMonth: '2026-11-15' }), /first day of the month/)
    await refused(registerRecord(client, actor, 'card_installment', { ...tv, account: undefined }), /account/)
    await refused(registerRecord(client, actor, 'card_installment', { ...tv, category: 'Salário' }), /unknown expense category Salário/)
  })

  test('edits description, installment, card and category, never the card away', async () => {
    const id = await registerRecord(client, actor, 'card_installment', { ...tv, description: 'Sofá', member: undefined, category: undefined })
    await editRecord(client, actor, 'card_installment', id, { name: 'Sofá retrátil', amountCents: 30000, category: 'Casa' })
    const record = await find('card_installment', 'Sofá retrátil')
    assert.deepEqual([record?.amount, record?.category, record?.member], [30000n, 'Casa', null])
    await refused(editRecord(client, actor, 'card_installment', id, { account: null }), /needs a credit card account/)
    await refused(editRecord(client, actor, 'card_installment', id, { account: 'Conta conjunta' }), /not a credit card/)
    await refused(editRecord(client, actor, 'card_installment', id, { dayOfMonth: 5 }), /has no dayOfMonth/)
    await refused(editRecord(client, actor, 'card_installment', id, { amountCents: 0 }), /must be positive/)
    const { rows } = await client.query<{ action: string }>("select action from audit_log where entity = 'card_installment' and entity_id = $1 order by id", [id])
    assert.deepEqual(
      rows.map((row) => row.action),
      ['create', 'update'],
    )
  })

  test('sets the limit of a credit card account only', async () => {
    const card = await find('account', 'Cartão Marcio')
    const checking = await find('account', 'Conta conjunta')
    assert.ok(card && checking)
    assert.equal(card.amount, null)
    await editRecord(client, actor, 'account', BigInt(card.id), { amountCents: 800000 })
    assert.equal((await find('account', 'Cartão Marcio'))?.amount, 800000n)
    assert.equal((await cardLimits(client, '2026-11')).find((item) => item.nickname === 'Cartão Marcio')?.limit, 800000n)
    await refused(editRecord(client, actor, 'account', BigInt(checking.id), { amountCents: 800000 }), /only credit card accounts have a limit/)
    await refused(editRecord(client, actor, 'account', BigInt(card.id), { amountCents: 0 }), /must be positive/)
  })
})
