import { createMcpHandler, hostHeaderValidationResponse, localhostAllowedHostnames, localhostAllowedOrigins, originValidationResponse } from '@modelcontextprotocol/server'
import { connectPool, type Database } from '../db/connection.ts'
import { HttpError } from '../http/body.ts'
import { identify, type Verifier, verifierFor } from '../http/identity.ts'
import { listen } from '../http/node.ts'
import { createServer } from './server.ts'

export const mcpPath = '/mcp'

const error = (message: string, status: number) => Response.json({ error: message }, { status })

const listOf = (value: string | undefined, fallback: string[]) => {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length ? items : fallback
}

export const allowedHosts = (env = process.env) => listOf(env.MCP_ALLOWED_HOSTS, localhostAllowedHostnames())
export const allowedOrigins = (env = process.env) => listOf(env.MCP_ALLOWED_ORIGINS, localhostAllowedOrigins())

export const mcpHttp = (client: Database, { verify = verifierFor(), hosts = allowedHosts(), origins = allowedOrigins() }: { verify?: Verifier; hosts?: string[]; origins?: string[] } = {}) => {
  const mcp = createMcpHandler(async ({ requestInfo }) => createServer(client, requestInfo && (await identify(client, requestInfo, verify))))
  const fetch = async (request: Request) => {
    const rejected = hostHeaderValidationResponse(request, hosts) ?? originValidationResponse(request, origins)
    if (rejected) return rejected
    if (new URL(request.url).pathname !== mcpPath) return error('not found', 404)
    try {
      await identify(client, request, verify)
    } catch (caught) {
      if (caught instanceof HttpError) return error(caught.message, caught.status)
      throw caught
    }
    return mcp.fetch(request)
  }
  return { fetch, close: mcp.close }
}

export const serveHttp = async (client: Database, port = Number(process.env.MCP_PORT ?? 3100), host = process.env.MCP_HOST ?? '127.0.0.1', options?: Parameters<typeof mcpHttp>[1]) => {
  const handler = mcpHttp(client, options)
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
