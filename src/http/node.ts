import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { pipeline, Readable } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'

export type FetchHandler = (request: Request) => Promise<Response>

const bodyless = new Set(['GET', 'HEAD'])

export const toRequest = (incoming: IncomingMessage, signal: AbortSignal) => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(incoming.headers)) for (const item of [value ?? []].flat()) headers.append(name, item)
  const url = new URL(incoming.url ?? '/', `http://${incoming.headers.host ?? 'localhost'}`)
  const method = incoming.method ?? 'GET'
  const body = bodyless.has(method) ? undefined : (Readable.toWeb(incoming) as globalThis.ReadableStream)
  return new Request(url, { method, headers, body, signal, duplex: 'half' } as RequestInit)
}

const failure = () => Response.json({ error: 'internal error' }, { status: 500 })

const respond = async (handler: FetchHandler, incoming: IncomingMessage, signal: AbortSignal) => {
  try {
    return await handler(toRequest(incoming, signal))
  } catch {
    return failure()
  }
}

export const nodeHandler = (handler: FetchHandler) => async (incoming: IncomingMessage, outgoing: ServerResponse) => {
  const aborted = new AbortController()
  outgoing.on('close', () => aborted.abort())
  const response = await respond(handler, incoming, aborted.signal)
  if (outgoing.destroyed) return response.body?.cancel()
  outgoing.writeHead(response.status, [...response.headers].flat())
  if (!response.body) return outgoing.end()
  pipeline(Readable.fromWeb(response.body as ReadableStream), outgoing, () => {})
}

export const listen = (handler: FetchHandler, port: number, host: string) =>
  new Promise<{ url: string; close: () => Promise<void> }>((resolve, reject) => {
    const server = createServer(nodeHandler(handler))
    server.once('error', reject)
    server.listen(port, host, () => {
      const address = server.address() as AddressInfo
      const close = () =>
        new Promise<void>((done) => {
          server.closeAllConnections()
          server.close(() => done())
        })
      resolve({ url: `http://${host}:${address.port}`, close })
    })
  })
