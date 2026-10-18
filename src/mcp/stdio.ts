import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { connect } from '../db/connection.ts'
import { createServer } from './server.ts'

if (import.meta.main) {
  const client = await connect()
  const handle = serveStdio(() => createServer(client))
  process.stdin.on('close', async () => {
    await handle.close()
    await client.end()
  })
}
