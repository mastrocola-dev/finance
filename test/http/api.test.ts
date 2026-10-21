import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { connectPool } from '../../src/db/connection.ts'
import { seed, seedToday } from '../../src/db/seed.ts'
import { serveApi } from '../../src/http/api.ts'
import { bodyLimit } from '../../src/http/body.ts'
import { testDatabase } from '../db/database.ts'

const groceries = { month: '2026-10', due_on: '2026-10-25', description: 'Farmers market', direction: 'expense', amount_cents: 12345, category: 'groceries', member: 'joint' }

describe('http api', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let pool: ReturnType<typeof connectPool>
  let server: Awaited<ReturnType<typeof serveApi>>

  const get = async (path: string, headers: Record<string, string> = {}) => {
    const response = await fetch(`${server.url}/api${path}`, { headers })
    return { status: response.status, body: await response.json() }
  }

  const send = async (method: string, path: string, body: unknown, headers: Record<string, string> = { 'x-member': 'Marcio' }) => {
    const response = await fetch(`${server.url}/api${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
    return { status: response.status, headers: response.headers, body: await response.json() }
  }

  const post = (path: string, body: unknown, headers?: Record<string, string>) => send('POST', path, body, headers)

  const audit = async (entityId: string) => (await pool.query<{ author: string; action: string; name: string }>('select a.author, a.action, m.name from audit_log a join member m on m.id = a.member_id where a.entity = $1 and a.entity_id = $2 order by a.id', ['entry', entityId])).rows

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

  test('summarizes a month against the previous one', async () => {
    const { status, body } = await get(`/months/2026-10/summary?today=${seedToday}`)
    assert.equal(status, 200)
    assert.deepEqual(body.month.expenses.total, { cents: '1037100', brl: 'R$ 10.371,00' })
    assert.equal(body.month.expenses.late.cents, '22200')
    assert.equal(body.other.month, '2026-09-01')
    assert.equal(body.other.expenses.total.cents, '1021500')
  })

  test('lists entries with filters', async () => {
    const all = await get(`/months/2026-10/entries?today=${seedToday}`)
    assert.equal(all.body.length, 17)
    const late = await get(`/months/2026-10/entries?state=late&direction=expense&today=${seedToday}`)
    assert.deepEqual(
      late.body.map(({ description }: { description: string }) => description),
      ['Electricity'],
    )
    assert.equal(typeof late.body[0].id, 'string')
  })

  test('lists debts, reserves and decisions', async () => {
    assert.equal((await get('/debts')).body.length, 2)
    const [reserve] = (await get('/reserves')).body
    assert.equal(reserve.name, 'Emergency fund')
    assert.equal(reserve.missing.cents, '1200000')
    assert.deepEqual((await get('/decisions?status=all&limit=5')).body, [])
  })

  test('answers invalid input with 400 and the issues', async () => {
    const { status, body } = await get('/decisions?limit=0')
    assert.equal(status, 400)
    assert.equal(body.error, 'invalid input')
    assert.equal(body.issues[0].path, 'limit')
    assert.equal((await get('/months/2026-13/summary')).status, 422)
  })

  test('answers unknown routes, methods and members', async () => {
    assert.deepEqual(await get('/nothing'), { status: 404, body: { error: 'not found' } })
    const response = await fetch(`${server.url}/api/debts`, { method: 'DELETE' })
    assert.equal(response.status, 405)
    assert.equal(response.headers.get('allow'), 'GET')
    assert.deepEqual(await get('/debts', { 'x-member': 'Nobody' }), { status: 403, body: { error: 'unknown member' } })
    assert.equal((await get('/debts', { origin: 'https://example.com' })).status, 403)
  })

  test('creates an entry as the calling member, audited', async () => {
    const { status, body } = await post(`/entries?today=${seedToday}`, groceries)
    assert.equal(status, 201)
    assert.equal(body.description, 'Farmers market')
    assert.deepEqual(body.amount, { cents: '12345', brl: 'R$ 123,45' })
    assert.equal(body.member, null)
    assert.equal(body.state, 'pending')
    const { rows } = await pool.query<{ origin: string }>('select origin from entry where id = $1', [body.id])
    assert.equal(rows[0]?.origin, 'manual')
    assert.deepEqual(await audit(body.id), [{ author: 'member', action: 'create', name: 'Marcio' }])
  })

  test('marks an entry paid and refuses to pay it twice', async () => {
    const created = await post(`/entries?today=${seedToday}`, { ...groceries, description: 'Pharmacy', category: 'health' })
    const paid = await post(`/entries/${created.body.id}/paid?today=${seedToday}`, {}, { 'x-member': 'gabriela' })
    assert.equal(paid.status, 200)
    assert.equal(paid.body.status, 'paid')
    assert.equal(paid.body.paidOn, seedToday)
    const again = await post(`/entries/${created.body.id}/paid`, { paid_on: seedToday })
    assert.equal(again.status, 422)
    assert.match(again.body.error, /already paid/)
    assert.deepEqual(
      (await audit(created.body.id)).map(({ name }) => name),
      ['Marcio', 'Gabriela'],
    )
  })

  test('refuses writes without a member or with a bad body', async () => {
    assert.deepEqual((await post('/entries', groceries, {})).status, 401)
    assert.equal((await post('/entries', '{', { 'x-member': 'Marcio' })).status, 400)
    assert.equal((await post('/entries', { ...groceries, category: 'salary' })).status, 422)
    assert.equal((await post('/entries', { ...groceries, amount_cents: -1 })).status, 400)
    assert.equal((await post('/entries', { ...groceries, description: 'x'.repeat(bodyLimit) })).status, 413)
    const plain = await fetch(`${server.url}/api/entries`, { method: 'POST', headers: { 'x-member': 'Marcio', 'content-type': 'text/plain' }, body: 'hello' })
    assert.equal(plain.status, 415)
    const { rows } = await pool.query<{ count: number }>("select count(*)::int as count from entry where description = 'Farmers market'")
    assert.equal(rows[0]?.count, 1)
  })

  test('updates a reserve as the calling member, audited', async () => {
    const patched = await send('PATCH', '/reserves/Emergency%20fund', { balance_cents: 250000 })
    assert.equal(patched.status, 200)
    assert.deepEqual(patched.body.balance, { cents: '250000', brl: 'R$ 2.500,00' })
    assert.equal(patched.body.missing.cents, '2750000')
    const { rows } = await pool.query<{ author: string; name: string }>("select a.author, m.name from audit_log a join member m on m.id = a.member_id where a.entity = 'reserve' order by a.id desc limit 1")
    assert.deepEqual(rows[0], { author: 'member', name: 'Marcio' })
    assert.equal((await send('PATCH', '/reserves/Emergency%20fund', { balance_cents: -1 })).status, 422)
    assert.equal((await send('PATCH', '/reserves/Nowhere', { balance_cents: 1 })).status, 422)
    assert.equal((await send('PATCH', '/reserves/Emergency%20fund', {}, {})).status, 401)
  })

  test('proposes a decision and closes it once every member confirms', async () => {
    const proposed = await post('/decisions', { title: 'Move to a bigger flat', amount_cents: 50000000 })
    assert.equal(proposed.status, 201)
    assert.equal(proposed.body.status, 'proposed')
    assert.equal(proposed.body.proposedBy, 'Marcio')
    assert.deepEqual(proposed.body.amount, { cents: '50000000', brl: 'R$ 500.000,00' })
    const first = await post(`/decisions/${proposed.body.id}/confirm`, {})
    assert.deepEqual(first.body.confirmedBy, ['Marcio'])
    assert.deepEqual(first.body.awaiting, ['Gabriela'])
    const second = await post(`/decisions/${proposed.body.id}/confirm`, {}, { 'x-member': 'Gabriela' })
    assert.equal(second.body.status, 'confirmed')
    assert.equal((await post(`/decisions/${proposed.body.id}/reject`, {}, { 'x-member': 'Gabriela' })).status, 422)
  })

  test('rejects and withdraws decisions only as the right member', async () => {
    assert.equal((await post('/decisions', { title: ' ' })).status, 400)
    const rejectable = await post('/decisions', { title: 'Change the school' })
    assert.equal((await post(`/decisions/${rejectable.body.id}/reject`, {})).status, 422)
    const rejected = await post(`/decisions/${rejectable.body.id}/reject`, {}, { 'x-member': 'Gabriela' })
    assert.equal(rejected.body.status, 'rejected')
    const withdrawable = await post('/decisions', { title: 'Hold the trip' })
    assert.equal((await post(`/decisions/${withdrawable.body.id}/withdraw`, {}, { 'x-member': 'Gabriela' })).status, 422)
    const withdrawn = await post(`/decisions/${withdrawable.body.id}/withdraw`, {})
    assert.equal(withdrawn.body.status, 'withdrawn')
  })

  test('forecasts a month once, planned as the calling member', async () => {
    const first = await post(`/months/2026-11/forecast?today=${seedToday}`, {})
    assert.equal(first.status, 200)
    assert.equal(first.body.month, '2026-11-01')
    assert.ok(first.body.created.length > 0)
    assert.equal(first.body.created[0].status, 'planned')
    const again = await post(`/months/2026-11/forecast?today=${seedToday}`, {})
    assert.deepEqual(again.body.created, [])
    assert.equal(again.body.skipped, first.body.created.length + first.body.skipped)
    assert.equal((await post('/months/2026-11/forecast', {}, {})).status, 401)
  })
})
