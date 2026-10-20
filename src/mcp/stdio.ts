import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { connectPool } from '../db/connection.ts'
import { findMember } from '../ledger/members.ts'
import { createServer } from './server.ts'

const memberFrom = async (pool: ReturnType<typeof connectPool>, name = process.env.FINANCE_MEMBER) => {
  if (!name) return undefined
  const member = await findMember(pool, name)
  if (!member) throw new Error(`FINANCE_MEMBER ${name} is not an active member`)
  return member
}

if (import.meta.main) {
  const pool = connectPool()
  const member = await memberFrom(pool)
  const handle = serveStdio(() => createServer(pool, member))
  process.stdin.on('close', async () => {
    await handle.close()
    await pool.end()
  })
}
