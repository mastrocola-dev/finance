import { createMcpHandler, hostHeaderValidationResponse, localhostAllowedHostnames, localhostAllowedOrigins, originValidationResponse } from '@modelcontextprotocol/server'
import { connectPool, type Database } from '../db/connection.ts'
import { HttpError } from '../http/body.ts'
import { identify, type Verifier, verifierFor } from '../http/identity.ts'
import { listen } from '../http/node.ts'
import { createServer } from './server.ts'

export const mcpPath = '/mcp'
export const metadataPath = '/.well-known/oauth-protected-resource'

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
export const scopesOf = (env = process.env) => listOf(env.MCP_SCOPES, [])

type Options = { verify?: Verifier; hosts?: string[]; origins?: string[]; publicUrl?: string; scopes?: string[] }

const metadata = (resource: string, issuer: string, scopes: string[]) => ({
  resource,
  authorization_servers: [issuer],
  bearer_methods_supported: ['header'],
  ...(scopes.length ? { scopes_supported: scopes } : {}),
  resource_name: 'finance',
})

export const mcpHttp = (client: Database, { verify = verifierFor(), hosts = allowedHosts(), origins = allowedOrigins(), publicUrl = process.env.MCP_PUBLIC_URL, scopes = scopesOf() }: Options = {}) => {
  const mcp = createMcpHandler(async ({ requestInfo }) => createServer(client, requestInfo && (await identify(client, requestInfo, verify))))
  const originOf = (request: Request) => (publicUrl?.trim() || new URL(request.url).origin).replace(/\/+$/, '')
  const challenge = (request: Request, message: string, status: number) => {
    const response = error(message, status)
    if (status === 401 && verify.issuer) response.headers.set('www-authenticate', `Bearer resource_metadata="${originOf(request)}${metadataPath}${mcpPath}"${message.startsWith('invalid token') ? ', error="invalid_token"' : ''}`)
    return response
  }
  const fetch = async (request: Request) => {
    const rejected = hostHeaderValidationResponse(request, hosts) ?? originValidationResponse(request, origins)
    if (rejected) return rejected
    const { pathname } = new URL(request.url)
    if (verify.issuer && request.method === 'GET' && (pathname === metadataPath || pathname === `${metadataPath}${mcpPath}`)) return Response.json(metadata(`${originOf(request)}${mcpPath}`, verify.issuer, scopes))
    if (pathname !== mcpPath) return error('not found', 404)
    try {
      const member = await identify(client, request, verify)
      if (!member && !verify.openReads) return challenge(request, `this request needs ${verify.credential}`, 401)
    } catch (caught) {
      if (caught instanceof HttpError) return challenge(request, caught.message, caught.status)
      throw caught
    }
    return mcp.fetch(request)
  }
  return { fetch, close: mcp.close }
}

export const serveHttp = async (client: Database, port = Number(process.env.MCP_PORT ?? 3100), host = process.env.MCP_HOST ?? '127.0.0.1', options?: Options) => {
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
