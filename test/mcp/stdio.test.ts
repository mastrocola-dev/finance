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

const connectAs = async (member?: string) => {
  const env = { PATH: process.env.PATH ?? '', DATABASE_URL: db.url, ...(member ? { FINANCE_MEMBER: member } : {}) }
  const mcp = new Client({ name: 'test', version: '0.0.0' })
  await mcp.connect(new StdioClientTransport({ command: process.execPath, args: ['src/mcp/stdio.ts'], env }))
  return mcp
}

test('stdio adapter serves the read tools', async () => {
  const mcp = await connectAs()
  const { content } = await mcp.callTool({ name: 'list_debts', arguments: {} })
  const [first] = content as { text: string }[]
  assert.equal(JSON.parse(first?.text ?? '[]').length, 2)
  const summary = await mcp.callTool({ name: 'month_summary', arguments: { month: '2026-10', today: seedToday } })
  assert.notEqual(summary.isError, true)
  await mcp.close()
})

test('stdio adapter writes as FINANCE_MEMBER and refuses writes without it', async () => {
  const entry = { month: '2026-10', due_on: '2026-10-29', description: 'Bakery', direction: 'expense', amount_cents: 1800, category: 'groceries', member: 'joint', today: seedToday }
  const anonymous = await connectAs()
  assert.equal((await anonymous.callTool({ name: 'create_entry', arguments: entry })).isError, true)
  await anonymous.close()
  const marcio = await connectAs('Marcio')
  assert.notEqual((await marcio.callTool({ name: 'create_entry', arguments: entry })).isError, true)
  await marcio.close()
  const { rows } = await db.client.query("select a.author, m.name from audit_log a join member m on m.id = a.member_id join entry e on e.id = a.entity_id where a.entity = 'entry' and e.description = 'Bakery'")
  assert.deepEqual(rows, [{ author: 'claude', name: 'Marcio' }])
})

test('stdio adapter refuses to start for an unknown FINANCE_MEMBER', async () => {
  await assert.rejects(connectAs('Mallory'))
})
