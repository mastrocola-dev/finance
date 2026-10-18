import assert from 'node:assert/strict'
import { request } from 'node:http'
import { after, before, describe, test } from 'node:test'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { connectPool } from '../../src/db/connection.ts'
import { seed, seedToday } from '../../src/db/seed.ts'
import { findMember } from '../../src/ledger/members.ts'
import { serveHttp } from '../../src/mcp/http.ts'
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

  const connectClient = async (member = 'Marcio') => {
    const mcp = new Client({ name: 'test', version: '0.0.0' })
    await mcp.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: { 'x-member': member } } }))
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

  test('serves the read tools', async () => {
    const mcp = await connectClient()
    const { tools } = await mcp.listTools()
    assert.deepEqual(tools.map(({ name }) => name).sort(), ['list_debts', 'list_entries', 'month_summary'])
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
    assert.deepEqual(expenses, ['1009500', '1023800', '1009500', '1023800'])
    await Promise.all(clients.map((mcp) => mcp.close()))
  })

  test('accepts requests without a member header', async () => {
    assert.equal(await rawPost(server.url, {}), 200)
  })

  test('rejects an unknown member', async () => {
    assert.equal(await rawPost(server.url, { 'x-member': 'Mallory' }), 403)
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
