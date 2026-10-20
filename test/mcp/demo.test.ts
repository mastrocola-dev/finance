import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { connectPool } from '../../src/db/connection.ts'
import { seed, seedToday } from '../../src/db/seed.ts'
import { createDemoServer } from '../../src/mcp/demo.ts'
import { testDatabase } from '../db/database.ts'

const readTools = ['list_debts', 'list_decisions', 'list_entries', 'list_reserves', 'month_summary']

describe('demo mcp server', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let pool: ReturnType<typeof connectPool>
  let mcp: Client

  before(async () => {
    db = await testDatabase()
    await seed(db.client)
    pool = connectPool(db.url, true)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await createDemoServer(pool).connect(serverTransport)
    mcp = new Client({ name: 'test', version: '0.0.0' })
    await mcp.connect(clientTransport)
  })

  after(async () => {
    await mcp.close()
    await pool.end()
    await db.drop()
  })

  test('registers only the read tools', async () => {
    const { tools } = await mcp.listTools()
    assert.deepEqual(tools.map(({ name }) => name).sort(), readTools)
  })

  test('answers reads over the seed', async () => {
    const { content } = await mcp.callTool({ name: 'month_summary', arguments: { month: '2026-10', today: seedToday } })
    const [first] = content as { text: string }[]
    assert.equal(JSON.parse(first?.text ?? '{}').month.expenses.count, 13)
  })

  test('the connection itself refuses writes', async () => {
    await assert.rejects(pool.query('create table probe (id int)'), /read-only/)
  })
})

test('demo stdio entry serves the read tools only', async () => {
  const db = await testDatabase()
  await seed(db.client)
  const env = { PATH: process.env.PATH ?? '', DEMO_DATABASE_URL: db.url }
  const mcp = new Client({ name: 'test', version: '0.0.0' })
  await mcp.connect(new StdioClientTransport({ command: process.execPath, args: ['src/mcp/demo.ts'], env }))
  const { tools } = await mcp.listTools()
  assert.deepEqual(tools.map(({ name }) => name).sort(), readTools)
  await mcp.close()
  await db.drop()
})
