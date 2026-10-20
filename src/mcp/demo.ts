import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { connectPool, type Database } from '../db/connection.ts'
import { registerReads } from './read.ts'

export const createDemoServer = (client: Database) => {
  const server = new McpServer({ name: 'finance-demo', version: '0.1.0' })
  registerReads(server, client)
  return server
}

if (import.meta.main) {
  const pool = connectPool(process.env.DEMO_DATABASE_URL, true)
  const handle = serveStdio(() => createDemoServer(pool))
  process.stdin.on('close', async () => {
    await handle.close()
    await pool.end()
  })
}
