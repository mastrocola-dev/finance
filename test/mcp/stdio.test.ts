import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { seed, seedToday } from '../../src/db/seed.ts'
import { testDatabase } from '../db/database.ts'

let db: Awaited<ReturnType<typeof testDatabase>>

before(async () => {
  db = await testDatabase()
  await seed(db.client)
})

after(() => db.drop())

test('stdio adapter serves the read tools', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ['src/mcp/stdio.ts'], env: { PATH: process.env.PATH ?? '', DATABASE_URL: db.url } })
  const mcp = new Client({ name: 'test', version: '0.0.0' })
  await mcp.connect(transport)
  const { content } = await mcp.callTool({ name: 'list_debts', arguments: {} })
  const [first] = content as { text: string }[]
  assert.equal(JSON.parse(first?.text ?? '[]').length, 2)
  const summary = await mcp.callTool({ name: 'month_summary', arguments: { month: '2026-10', today: seedToday } })
  assert.notEqual(summary.isError, true)
  await mcp.close()
})
