import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { connectPool } from '../../src/db/connection.ts'
import { seed, seedToday } from '../../src/db/seed.ts'
import { findMember, type Member } from '../../src/ledger/members.ts'
import { createServer } from '../../src/mcp/server.ts'
import { testDatabase } from '../db/database.ts'

const groceries = { month: '2026-10', due_on: '2026-10-25', description: 'Farmers market', direction: 'expense', amount_cents: 12345, category: 'groceries', member: 'joint', today: seedToday }

describe('mcp write tools', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let pool: ReturnType<typeof connectPool>
  let marcio: Member
  let anonymous: Client
  let member: Client

  const connectAs = async (caller?: Member) => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await createServer(pool, caller).connect(serverTransport)
    const mcp = new Client({ name: 'test', version: '0.0.0' })
    await mcp.connect(clientTransport)
    return mcp
  }

  const call = async (mcp: Client, name: string, args: Record<string, unknown>) => {
    const { content, isError } = await mcp.callTool({ name, arguments: args })
    const [first] = content as { text: string }[]
    assert.ok(first)
    return { isError, text: first.text, json: () => JSON.parse(first.text) }
  }

  const audit = async (entityId: string) => (await pool.query<{ author: string; member_id: bigint; action: string }>('select author, member_id, action from audit_log where entity = $1 and entity_id = $2 order by id', ['entry', entityId])).rows

  before(async () => {
    db = await testDatabase()
    await seed(db.client)
    pool = connectPool(db.url)
    const found = await findMember(pool, 'Marcio')
    assert.ok(found)
    marcio = found
    anonymous = await connectAs()
    member = await connectAs(marcio)
  })

  after(async () => {
    await Promise.all([anonymous.close(), member.close()])
    await pool.end()
    await db.drop()
  })

  test('refuses writes without a calling member', async () => {
    const refused = await call(anonymous, 'create_entry', groceries)
    assert.equal(refused.isError, true)
    assert.match(refused.text, /calling member/)
    const { rows } = await pool.query("select count(*)::int as count from entry where description = 'Farmers market'")
    assert.equal(rows[0].count, 0)
  })

  test('create_entry records a planned joint expense audited as claude for the member', async () => {
    const created = await call(member, 'create_entry', groceries)
    assert.notEqual(created.isError, true)
    const entry = created.json()
    assert.equal(entry.description, 'Farmers market')
    assert.equal(entry.category, 'Groceries')
    assert.equal(entry.member, null)
    assert.equal(entry.status, 'planned')
    assert.equal(entry.state, 'pending')
    assert.deepEqual(entry.amount, { cents: '12345', brl: 'R$ 123,45' })
    const { rows } = await pool.query('select origin from entry where id = $1', [entry.id])
    assert.equal(rows[0].origin, 'claude')
    assert.deepEqual(await audit(entry.id), [{ author: 'claude', member_id: marcio.id, action: 'create' }])
  })

  test('create_entry records an already paid income for a member on an account', async () => {
    const accounts = await pool.query<{ nickname: string }>("select nickname from account where closed_at is null and kind = 'checking' order by id limit 1")
    const nickname = accounts.rows[0]?.nickname
    assert.ok(nickname)
    const categories = await pool.query<{ name: string }>("select name from category where kind = 'income' order by id limit 1")
    const income = { ...groceries, description: 'Freelance', direction: 'income', category: categories.rows[0]?.name, account: nickname, member: 'gabriela', paid_on: '2026-10-10' }
    const entry = (await call(member, 'create_entry', income)).json()
    assert.equal(entry.member, 'Gabriela')
    assert.equal(entry.account, nickname)
    assert.equal(entry.status, 'paid')
    assert.equal(entry.paidOn, '2026-10-10')
  })

  test('create_entry rejects unknown names and a category of the other direction', async () => {
    for (const changes of [{ category: 'salary' }, { category: 'nothing' }, { account: 'nowhere' }, { member: 'Mallory' }]) {
      const rejected = await call(member, 'create_entry', { ...groceries, description: 'Rejected', ...changes })
      assert.equal(rejected.isError, true, JSON.stringify(changes))
    }
    for (const changes of [{ amount_cents: 0 }, { amount_cents: 1.5 }, { description: ' ' }, { due_on: '2026-10-32' }]) {
      const invalid = await call(member, 'create_entry', { ...groceries, description: 'Rejected', ...changes })
      assert.equal(invalid.isError, true, JSON.stringify(changes))
    }
    const { rows } = await pool.query("select count(*)::int as count from entry where description = 'Rejected'")
    assert.equal(rows[0].count, 0)
  })

  test('mark_paid pays a late entry once and audits the update', async () => {
    const [late] = (await call(member, 'list_entries', { month: '2026-10', state: 'late', today: seedToday })).json()
    const paid = (await call(member, 'mark_paid', { id: late.id, today: seedToday })).json()
    assert.equal(paid.status, 'paid')
    assert.equal(paid.state, 'paid')
    assert.equal(paid.paidOn, seedToday)
    assert.deepEqual((await audit(late.id)).at(-1), { author: 'claude', member_id: marcio.id, action: 'update' })
    const again = await call(member, 'mark_paid', { id: late.id, today: seedToday })
    assert.equal(again.isError, true)
    assert.match(again.text, /already paid/)
  })

  test('mark_paid rejects unknown ids and refuses without a member', async () => {
    assert.equal((await call(member, 'mark_paid', { id: '999999' })).isError, true)
    assert.equal((await call(member, 'mark_paid', { id: 'abc' })).isError, true)
    const [pending] = (await call(member, 'list_entries', { month: '2026-10', state: 'pending', today: seedToday })).json()
    const refused = await call(anonymous, 'mark_paid', { id: pending.id, today: seedToday })
    assert.equal(refused.isError, true)
    const [still] = (await call(member, 'list_entries', { month: '2026-10', state: 'pending', today: seedToday })).json()
    assert.equal(still.id, pending.id)
  })

  test('forecast_month plans a month once, audited as claude for the member', async () => {
    assert.equal((await call(anonymous, 'forecast_month', { month: '2026-11' })).isError, true)
    const forecast = (await call(member, 'forecast_month', { month: '2026-11', today: seedToday })).json()
    assert.equal(forecast.month, '2026-11-01')
    assert.equal(forecast.skipped, 0)
    assert.equal(forecast.created.length, 9)
    const sofa = forecast.created.find(({ description }: { description: string }) => description === 'Sofa')
    assert.deepEqual([sofa.state, sofa.installmentNumber, sofa.amount.brl], ['pending', 10, 'R$ 450,00'])
    assert.deepEqual(await audit(sofa.id), [{ author: 'claude', member_id: marcio.id, action: 'create' }])
    const again = (await call(member, 'forecast_month', { month: '2026-11' })).json()
    assert.deepEqual(again, { month: '2026-11-01', skipped: 9, created: [] })
  })
})
