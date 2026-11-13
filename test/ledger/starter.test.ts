import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import { addMembers } from '../../src/db/add-member.ts'
import { createStarterCategories, listSetup, registerRecord, starterCategories } from '../../src/ledger/setup.ts'
import { testDatabase } from '../db/database.ts'

describe('starter categories on an empty ledger', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client
  let actor: { author: 'member'; memberId: bigint }

  before(async () => {
    db = await testDatabase()
    client = db.client
    const [marcio] = await addMembers(client, [
      { name: 'Marcio', sharePercent: 50 },
      { name: 'Gabriela', sharePercent: 50 },
    ])
    actor = { author: 'member', memberId: marcio?.id as bigint }
  })

  after(() => db.drop())

  const categories = async () => (await listSetup(client)).filter((record) => record.kind === 'category').map((record) => `${record.detail}:${record.name}`)

  test('creates the pt-BR set in one write authored by the member, skipping names already open', async () => {
    await registerRecord(client, actor, 'category', { name: 'mercado', kind: 'expense' })
    await registerRecord(client, actor, 'category', { name: 'Lazer', kind: 'income' })
    const last = (await client.query<{ id: string }>('select max(id)::text as id from audit_log')).rows[0]?.id
    const created = await createStarterCategories(client, actor)
    assert.equal(created.length, 11)
    const open = await categories()
    assert.equal(open.filter((name) => name.toLowerCase() === 'expense:mercado').length, 1)
    assert.ok(open.includes('expense:Lazer') && open.includes('income:Lazer'))
    for (const name of starterCategories.income) assert.ok(open.includes(`income:${name}`))
    const { rows } = await client.query<{ author: string; member_id: string; entity: string; action: string }>('select author, member_id::text, entity, action from audit_log where id > $1', [last])
    assert.deepEqual(new Set(rows.map((row) => JSON.stringify(row))), new Set([JSON.stringify({ author: 'member', member_id: String(actor.memberId), entity: 'category', action: 'create' })]))
    assert.equal(rows.length, 11)
  })

  test('creates nothing the second time', async () => {
    const count = (await categories()).length
    assert.deepEqual(await createStarterCategories(client, actor), [])
    assert.equal((await categories()).length, count)
  })
})
