import { createMcpHandler, hostHeaderValidationResponse, localhostAllowedHostnames, localhostAllowedOrigins, originValidationResponse } from '@modelcontextprotocol/server'
import { connectPool, type Database } from '../db/connection.ts'
import { listen } from '../http/node.ts'
import { findMember } from '../ledger/members.ts'
import { createServer } from './server.ts'

export const mcpPath = '/mcp'
export const memberHeader = 'x-member'

const error = (message: string, status: number) => Response.json({ error: message }, { status })

const memberOf = async (client: Database, request?: Request) => {
  const name = request?.headers.get(memberHeader)
  return name ? findMember(client, name) : undefined
}

export const mcpHttp = (client: Database) => {
  const mcp = createMcpHandler(async ({ requestInfo }) => createServer(client, await memberOf(client, requestInfo)))
  const fetch = async (request: Request) => {
    const rejected = hostHeaderValidationResponse(request, localhostAllowedHostnames()) ?? originValidationResponse(request, localhostAllowedOrigins())
    if (rejected) return rejected
    if (new URL(request.url).pathname !== mcpPath) return error('not found', 404)
    const member = request.headers.get(memberHeader)
    if (member !== null && !(await findMember(client, member))) return error('unknown member', 403)
    return mcp.fetch(request)
  }
  return { fetch, close: mcp.close }
}

export const serveHttp = async (client: Database, port = Number(process.env.MCP_PORT ?? 3100), host = process.env.MCP_HOST ?? '127.0.0.1') => {
  const handler = mcpHttp(client)
  const server = await listen(handler.fetch, port, host)
  const close = async () => {
    await server.close()
    await handler.close()
  }
  return { url: `${server.url}${mcpPath}`, close }
}

if (import.meta.main) {
  const pool = connectPool()
  const server = await serveHttp(pool)
  console.error(`finance mcp on ${server.url}`)
  const stop = async () => {
    await server.close()
    await pool.end()
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
