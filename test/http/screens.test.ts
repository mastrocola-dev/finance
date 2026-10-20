import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { connectPool } from '../../src/db/connection.ts'
import { seed } from '../../src/db/seed.ts'
import { serveApi } from '../../src/http/api.ts'
import { testDatabase } from '../db/database.ts'

describe('http api for the screens', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let pool: ReturnType<typeof connectPool>
  let server: Awaited<ReturnType<typeof serveApi>>

  const get = async (path: string) => {
    const response = await fetch(`${server.url}/api${path}`)
    return { status: response.status, body: await response.json() }
  }

  const post = async (path: string, body: unknown, member = 'Marcio') => {
    const response = await fetch(`${server.url}/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-member': member }, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json() }
  }

  before(async () => {
    db = await testDatabase()
    await seed(db.client)
    pool = connectPool(db.url)
    server = await serveApi(pool, 0, '127.0.0.1')
  })

  after(async () => {
    await server.close()
    await pool.end()
    await db.drop()
  })

  test('lists active members with their share', async () => {
    const { status, body } = await get('/members')
    assert.equal(status, 200)
    assert.deepEqual(
      body.map(({ name, sharePercent }: { name: string; sharePercent: number }) => [name, sharePercent]),
      [
        ['Marcio', 50],
        ['Gabriela', 50],
      ],
    )
    assert.equal(typeof body[0].id, 'string')
  })

  test('lists goals with progress', async () => {
    const { body } = await get('/goals')
    assert.deepEqual(body, [
      {
        id: body[0].id,
        name: 'Trip to Lisbon',
        reserve: null,
        target: { cents: '1200000', brl: 'R$ 12.000,00' },
        saved: { cents: '450000', brl: 'R$ 4.500,00' },
        missing: { cents: '750000', brl: 'R$ 7.500,00' },
        progressPercent: '37.5',
        dueOn: '2027-07-01',
      },
    ])
  })

  test('adds reserves and free goal savings and subtracts debt balances', async () => {
    const { rows } = await pool.query<{ debts: bigint }>('select sum(balance_cents)::bigint as debts from debt where closed_at is null')
    const debts = rows[0]?.debts ?? 0n
    const { body } = await get('/net-worth')
    assert.equal(body.reserves.cents, '1800000')
    assert.equal(body.goals.cents, '450000')
    assert.equal(body.debts.cents, debts.toString())
    assert.equal(body.netWorth.cents, (2250000n - debts).toString())
  })

  test('settles joint expenses paid from a member account', async () => {
    const before = await get('/months/2026-10/split')
    assert.equal(before.status, 200)
    assert.equal(before.body.total.cents, '0')
    assert.deepEqual(before.body.transfers, [])
    const created = await post('/entries', { month: '2026-10', due_on: '2026-10-19', description: 'Dinner with friends', direction: 'expense', amount_cents: 42861, category: 'leisure', account: 'Gabriela checking', member: 'joint', paid_on: '2026-10-19' })
    assert.equal(created.status, 201)
    await post('/entries', { month: '2026-10', due_on: '2026-10-28', description: 'Pharmacy', direction: 'expense', amount_cents: 9000, category: 'health', account: 'Marcio card', member: 'joint' })
    const { body } = await get('/months/2026-10/split')
    assert.equal(body.month, '2026-10-01')
    assert.equal(body.total.brl, 'R$ 428,61')
    assert.deepEqual(
      body.members.map(({ name, paid, share, balance }: { name: string; paid: { cents: string }; share: { cents: string }; balance: { cents: string } }) => [name, paid.cents, share.cents, balance.cents]),
      [
        ['Marcio', '0', '21431', '-21431'],
        ['Gabriela', '42861', '21430', '21431'],
      ],
    )
    assert.deepEqual(body.transfers, [{ from: 'Marcio', to: 'Gabriela', amount: { cents: '21431', brl: 'R$ 214,31' } }])
  })

  test('answers 422 for a malformed month in the split', async () => {
    assert.equal((await get('/months/2026-13/split')).status, 422)
  })

  test('pages the audit log newest first with counts per author', async () => {
    const first = await get('/audit?limit=2')
    assert.equal(first.status, 200)
    assert.equal(first.body.items.length, 2)
    assert.ok(Number(first.body.items[0].id) > Number(first.body.items[1].id))
    assert.equal(first.body.next, first.body.items[1].id)
    assert.ok(first.body.counts.system > 0)
    assert.equal(first.body.counts.member, 2)
    assert.equal(first.body.counts.claude, 0)
    const second = await get(`/audit?limit=2&before=${first.body.next}`)
    assert.ok(Number(second.body.items[0].id) < Number(first.body.next))
    const created = first.body.items.find(({ entity }: { entity: string }) => entity === 'entry')
    assert.equal(created.author, 'member')
    assert.equal(created.action, 'create')
    assert.equal(created.before, null)
    assert.equal(typeof created.after.description, 'string')
  })

  test('filters the audit log by author, member and entity', async () => {
    const byMember = await get('/audit?member=marcio')
    assert.deepEqual(byMember.body.counts, { member: 2, claude: 0, import: 0, system: 0 })
    assert.ok(byMember.body.items.every(({ member }: { member: string }) => member === 'Marcio'))
    const members = await get('/audit?entity=member&author=system')
    assert.deepEqual(
      members.body.items.map(({ entity, action }: { entity: string; action: string }) => `${entity}:${action}`),
      ['member:create', 'member:create'],
    )
    assert.equal(members.body.next, null)
    assert.equal((await get('/audit?author=robot')).status, 400)
    assert.equal((await get('/audit?before=abc')).status, 400)
  })
})
