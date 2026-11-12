import assert from 'node:assert/strict'
import { request } from 'node:http'
import { after, before, describe, test } from 'node:test'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { connectPool } from '../../src/db/connection.ts'
import { seed, seedToday } from '../../src/db/seed.ts'
import { findMember } from '../../src/ledger/members.ts'
import { allowedHosts, allowedOrigins, serveHttp } from '../../src/mcp/http.ts'
import { testDatabase } from '../db/database.ts'

const rawPost = (url: string, headers: Record<string, string>) =>
  new Promise<number>((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    const call = request(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers } }, (response) => {
      response.resume()
      resolve(response.statusCode ?? 0)
    })
    call.on('error', reject)
    call.end(body)
  })

describe('streamable http adapter', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let pool: ReturnType<typeof connectPool>
  let server: Awaited<ReturnType<typeof serveHttp>>

  const connectClient = async (member?: string) => {
    const mcp = new Client({ name: 'test', version: '0.0.0' })
    await mcp.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: member ? { 'x-member': member } : {} } }))
    return mcp
  }

  before(async () => {
    db = await testDatabase()
    await seed(db.client)
    pool = connectPool(db.url)
    server = await serveHttp(pool, 0, '127.0.0.1')
  })

  after(async () => {
    await server.close()
    await pool.end()
    await db.drop()
  })

  test('binds to loopback on an ephemeral port', () => {
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
  })

  test('serves the read and write tools', async () => {
    const mcp = await connectClient('Marcio')
    const { tools } = await mcp.listTools()
    assert.deepEqual(tools.map(({ name }) => name).sort(), [
      'cancel_entry',
      'close_record',
      'confirm_decision',
      'correct_entry',
      'create_entry',
      'edit_record',
      'forecast_month',
      'list_debts',
      'list_decisions',
      'list_entries',
      'list_reserves',
      'list_setup',
      'mark_paid',
      'mark_unpaid',
      'month_summary',
      'propose_decision',
      'register_record',
      'reject_decision',
      'update_reserve',
      'withdraw_decision',
    ])
    const { content } = await mcp.callTool({ name: 'list_debts', arguments: {} })
    const [first] = content as { text: string }[]
    assert.equal(JSON.parse(first?.text ?? '[]').length, 2)
    await mcp.close()
  })

  test('answers concurrent calls through the pool', async () => {
    const clients = await Promise.all([connectClient('Marcio'), connectClient('gabriela')])
    const calls = clients.flatMap((mcp) => ['2026-09', '2026-10'].map((month) => mcp.callTool({ name: 'month_summary', arguments: { month, today: seedToday } })))
    const results = await Promise.all(calls)
    const expenses = results.map(({ content }) => JSON.parse((content as { text: string }[])[0]?.text ?? '{}').month.expenses.total.cents)
    assert.deepEqual(expenses, ['1021500', '1037100', '1021500', '1037100'])
    await Promise.all(clients.map((mcp) => mcp.close()))
  })

  test('writes on behalf of the x-member header and refuses without it', async () => {
    const entry = { month: '2026-10', due_on: '2026-10-28', description: 'Farmácia', direction: 'expense', amount_cents: 4590, category: 'saúde', member: 'Gabriela', today: seedToday }
    const [gabriela, anonymous] = await Promise.all([connectClient(' gabriela '), connectClient()])
    const refused = await anonymous.callTool({ name: 'create_entry', arguments: entry })
    assert.equal(refused.isError, true)
    const created = await gabriela.callTool({ name: 'create_entry', arguments: entry })
    assert.notEqual(created.isError, true)
    const { id } = JSON.parse((created.content as { text: string }[])[0]?.text ?? '{}')
    const { rows } = await pool.query('select a.author, m.name from audit_log a join member m on m.id = a.member_id where a.entity = $1 and a.entity_id = $2', ['entry', id])
    assert.deepEqual(rows, [{ author: 'claude', name: 'Gabriela' }])
    await Promise.all([gabriela.close(), anonymous.close()])
  })

  test('accepts requests without a member header', async () => {
    assert.equal(await rawPost(server.url, {}), 200)
  })

  test('rejects an unknown or closed member', async () => {
    assert.equal(await rawPost(server.url, { 'x-member': 'Mallory' }), 403)
    await pool.query("insert into member (name, share_percent, closed_at) values ('Ana', 0, now())")
    assert.equal(await rawPost(server.url, { 'x-member': 'Ana' }), 403)
  })

  test('allowed hosts and origins come from the environment, localhost by default', async () => {
    assert.deepEqual(allowedHosts({}), ['localhost', '127.0.0.1', '[::1]'])
    assert.deepEqual(allowedOrigins({ MCP_ALLOWED_ORIGINS: ' ' }), ['localhost', '127.0.0.1', '[::1]'])
    const env = { MCP_ALLOWED_HOSTS: 'mcp.example, localhost', MCP_ALLOWED_ORIGINS: 'claude.ai' }
    assert.deepEqual(allowedHosts(env), ['mcp.example', 'localhost'])
    const exposed = await serveHttp(pool, 0, '127.0.0.1', { hosts: allowedHosts(env), origins: allowedOrigins(env) })
    try {
      assert.equal(await rawPost(exposed.url, { host: 'mcp.example', origin: 'https://claude.ai' }), 200)
      assert.equal(await rawPost(exposed.url, { host: 'mcp.example', origin: 'https://finance.example' }), 403)
      assert.equal(await rawPost(exposed.url, { host: 'finance.example' }), 403)
    } finally {
      await exposed.close()
    }
  })

  test('rejects a foreign host or origin', async () => {
    assert.equal(await rawPost(server.url, { host: 'finance.example' }), 403)
    assert.equal(await rawPost(server.url, { origin: 'https://finance.example' }), 403)
  })

  test('answers 404 outside the mcp path', async () => {
    assert.equal(await rawPost(server.url.replace('/mcp', '/other'), {}), 404)
  })

  test('finds active members by name, ignoring case and spaces', async () => {
    assert.equal((await findMember(pool, ' marcio '))?.name, 'Marcio')
    assert.equal(await findMember(pool, 'joint'), undefined)
  })
})
