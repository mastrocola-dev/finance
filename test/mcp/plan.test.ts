import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { connectPool } from '../../src/db/connection.ts'
import { seed } from '../../src/db/seed.ts'
import { findMember, type Member } from '../../src/ledger/members.ts'
import { createServer } from '../../src/mcp/server.ts'
import { testDatabase } from '../db/database.ts'

describe('mcp reserve and decision tools', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let pool: ReturnType<typeof connectPool>
  let marcio: Member
  let gabriela: Member
  let anonymous: Client
  let asMarcio: Client
  let asGabriela: Client

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

  const audit = async (entity: string) => (await pool.query<{ author: string; member_id: bigint; action: string }>('select author, member_id, action from audit_log where entity = $1 and author = $2 order by id', [entity, 'claude'])).rows

  const propose = async (title: string) => (await call(asMarcio, 'propose_decision', { title, amount_cents: 500000 })).json()

  before(async () => {
    db = await testDatabase()
    await seed(db.client)
    pool = connectPool(db.url)
    const [one, two] = await Promise.all([findMember(pool, 'Marcio'), findMember(pool, 'Gabriela')])
    assert.ok(one && two)
    marcio = one
    gabriela = two
    ;[anonymous, asMarcio, asGabriela] = await Promise.all([connectAs(), connectAs(marcio), connectAs(gabriela)])
  })

  after(async () => {
    await Promise.all([anonymous.close(), asMarcio.close(), asGabriela.close()])
    await pool.end()
    await db.drop()
  })

  test('update_reserve sets balance and target audited as claude', async () => {
    const reserve = (await call(asMarcio, 'update_reserve', { reserve: 'emergency fund', balance_cents: 1950000, target_cents: 3600000 })).json()
    assert.equal(reserve.name, 'Emergency fund')
    assert.deepEqual(reserve.balance, { cents: '1950000', brl: 'R$ 19.500,00' })
    assert.deepEqual(reserve.target, { cents: '3600000', brl: 'R$ 36.000,00' })
    assert.deepEqual(await audit('reserve'), [{ author: 'claude', member_id: marcio.id, action: 'update' }])
    const zero = (await call(asMarcio, 'update_reserve', { reserve: 'Emergency fund', balance_cents: 0 })).json()
    assert.deepEqual(zero.balance, { cents: '0', brl: 'R$ 0,00' })
    assert.deepEqual(zero.target, { cents: '3600000', brl: 'R$ 36.000,00' })
  })

  test('update_reserve rejects negative balances, unknown reserves, empty changes and anonymous callers', async () => {
    for (const args of [{ reserve: 'Emergency fund', balance_cents: -1 }, { reserve: 'Emergency fund', target_cents: 0 }, { reserve: 'Emergency fund' }, { reserve: 'Holidays', balance_cents: 100 }]) {
      assert.equal((await call(asMarcio, 'update_reserve', args)).isError, true, JSON.stringify(args))
    }
    assert.equal((await call(anonymous, 'update_reserve', { reserve: 'Emergency fund', balance_cents: 100 })).isError, true)
    const { rows } = await pool.query("select balance_cents from reserve where name = 'Emergency fund'")
    assert.equal(rows[0].balance_cents, 0n)
  })

  test('a decision stays proposed until every member confirms, proposer included', async () => {
    const proposed = await propose('New fridge')
    assert.equal(proposed.status, 'proposed')
    assert.equal(proposed.proposedBy, 'Marcio')
    assert.equal(proposed.origin, 'claude')
    assert.deepEqual(proposed.amount, { cents: '500000', brl: 'R$ 5.000,00' })
    assert.deepEqual(proposed.awaiting, ['Marcio', 'Gabriela'])
    const half = (await call(asGabriela, 'confirm_decision', { id: proposed.id })).json()
    assert.equal(half.status, 'proposed')
    assert.deepEqual(half.confirmedBy, ['Gabriela'])
    assert.deepEqual(half.awaiting, ['Marcio'])
    const again = await call(asGabriela, 'confirm_decision', { id: proposed.id })
    assert.equal(again.isError, true)
    assert.match(again.text, /already confirmed/)
    const done = (await call(asMarcio, 'confirm_decision', { id: proposed.id })).json()
    assert.equal(done.status, 'confirmed')
    assert.deepEqual(done.confirmedBy, ['Gabriela', 'Marcio'])
    assert.deepEqual(done.awaiting, [])
    assert.ok(done.closedAt)
    const { rows } = await pool.query<{ author: string; member_id: bigint; action: string }>("select author, member_id, action from audit_log where (entity = 'decision' and entity_id = $1) or (entity = 'decision_confirmation' and after->>'decision_id' = $1::text) order by id", [proposed.id])
    assert.deepEqual(
      rows.map(({ author, member_id, action }) => [author, member_id, action]),
      [
        ['claude', marcio.id, 'create'],
        ['claude', gabriela.id, 'create'],
        ['claude', marcio.id, 'create'],
        ['claude', marcio.id, 'close'],
      ],
    )
    assert.equal((await call(asGabriela, 'reject_decision', { id: proposed.id })).isError, true)
  })

  test('the other member rejects; the proposer cannot reject but can withdraw', async () => {
    const rejected = await propose('Car upgrade')
    const own = await call(asMarcio, 'reject_decision', { id: rejected.id })
    assert.equal(own.isError, true)
    assert.match(own.text, /withdraw/)
    const closed = (await call(asGabriela, 'reject_decision', { id: rejected.id })).json()
    assert.equal(closed.status, 'rejected')
    assert.deepEqual(closed.awaiting, [])
    assert.equal((await call(asMarcio, 'confirm_decision', { id: rejected.id })).isError, true)
    const withdrawn = await propose('Weekend trip')
    assert.equal((await call(asGabriela, 'withdraw_decision', { id: withdrawn.id })).isError, true)
    assert.equal((await call(asMarcio, 'withdraw_decision', { id: withdrawn.id })).json().status, 'withdrawn')
  })

  test('decision tools refuse anonymous callers, unknown ids and empty titles', async () => {
    assert.equal((await call(anonymous, 'propose_decision', { title: 'Anonymous' })).isError, true)
    assert.equal((await call(asMarcio, 'propose_decision', { title: ' ' })).isError, true)
    assert.equal((await call(asMarcio, 'confirm_decision', { id: '999999' })).isError, true)
    const pending = await propose('Solar panels')
    assert.equal((await call(anonymous, 'confirm_decision', { id: pending.id })).isError, true)
    const { rows } = await pool.query('select count(*)::int as count from decision_confirmation where decision_id = $1', [pending.id])
    assert.equal(rows[0].count, 0)
  })

  test('list_decisions filters by status, newest first, with confirmations and awaited members', async () => {
    const titles = async (args: Record<string, unknown>) => (await call(anonymous, 'list_decisions', args)).json().map(({ title }: { title: string }) => title)
    const [pending, ...others] = (await call(anonymous, 'list_decisions', {})).json()
    assert.deepEqual(others, [])
    assert.equal(pending.title, 'Solar panels')
    assert.equal(pending.status, 'proposed')
    assert.deepEqual(pending.awaiting, ['Marcio', 'Gabriela'])
    assert.deepEqual(await titles({ status: 'confirmed' }), ['New fridge'])
    assert.deepEqual(await titles({ status: 'all' }), ['Solar panels', 'Weekend trip', 'Car upgrade', 'New fridge'])
    assert.deepEqual(await titles({ status: 'all', limit: 2 }), ['Solar panels', 'Weekend trip'])
    for (const args of [{ status: 'open' }, { limit: 0 }, { limit: 101 }]) assert.equal((await call(anonymous, 'list_decisions', args)).isError, true, JSON.stringify(args))
  })

  test('list_reserves reflects update_reserve', async () => {
    const [reserve] = (await call(anonymous, 'list_reserves', {})).json()
    assert.deepEqual(reserve.balance, { cents: '0', brl: 'R$ 0,00' })
    assert.deepEqual(reserve.missing, { cents: '3600000', brl: 'R$ 36.000,00' })
    assert.equal(reserve.progressPercent, '0.0')
  })
})
