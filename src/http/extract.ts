import { timingSafeEqual } from 'node:crypto'
import { connectPool } from '../db/connection.ts'
import type { Actor } from '../db/write.ts'
import { maxBytes } from '../import/cli.ts'
import { Busy, type ImportUploads, Unavailable, warmedUploads } from '../import/uploads.ts'
import { RuleError } from '../ledger/rule.ts'
import { HttpError, readBytes } from './body.ts'
import { listen } from './node.ts'
import { extractKeyHeader, extractKeyOf } from './remote-uploads.ts'

const statusOf = (caught: unknown) => {
  if (caught instanceof HttpError) return caught.status
  if (caught instanceof RuleError) return 422
  if (caught instanceof Busy) return 409
  if (caught instanceof Unavailable) return 503
  return undefined
}

const failure = (caught: unknown) => {
  const status = statusOf(caught)
  return status ? Response.json({ error: (caught as Error).message }, { status }) : Response.json({ error: 'internal error' }, { status: 500 })
}

const holds = (request: Request, key: Buffer) => {
  const given = Buffer.from(request.headers.get(extractKeyHeader) ?? '')
  return given.length === key.length && timingSafeEqual(given, key)
}

const actorOf = (request: Request): Actor => {
  const member = request.headers.get('x-member-id')
  if (member !== null && !/^\d{1,18}$/.test(member)) throw new HttpError(400, 'x-member-id must be a member id')
  return member === null ? { author: 'import' } : { author: 'import', memberId: BigInt(member) }
}

const idsOf = (value: string | null) => {
  const ids = value ? value.split(',') : []
  if (ids.length > 200 || !ids.every((id) => /^\d{1,18}$/.test(id))) throw new HttpError(400, 'ids must be up to 200 batch ids')
  return ids.map(BigInt)
}

const nameOf = (value: string | null) => {
  try {
    return decodeURIComponent(value ?? '')
  } catch {
    throw new HttpError(400, 'x-file-name must be URI encoded')
  }
}

const batchPath = /^\/batches\/(\d{1,18})\/(retry|discard)$/

const answer = async (uploads: ImportUploads, request: Request, url: URL) => {
  if (request.method === 'GET' && url.pathname === '/runtime') return uploads.runtime()
  if (request.method === 'GET' && url.pathname === '/progress') return [...uploads.progressOf(idsOf(url.searchParams.get('ids')))].map(([id, progress]) => ({ id: String(id), ...progress }))
  if (request.method === 'POST' && url.pathname === '/uploads') {
    if (request.headers.get('content-type') !== 'application/octet-stream') throw new HttpError(415, 'content-type must be application/octet-stream')
    return { id: String(await uploads.start(actorOf(request), nameOf(request.headers.get('x-file-name')), await readBytes(request, maxBytes))) }
  }
  const [, id, action] = (request.method === 'POST' && batchPath.exec(url.pathname)) || []
  if (action === 'retry') return uploads.retry(actorOf(request), BigInt(id as string)).then(() => ({ id }))
  if (action === 'discard') return { removed: await uploads.discard(BigInt(id as string)) }
  throw new HttpError(404, 'not found')
}

export const extract = (uploads: ImportUploads, key: string) => {
  const secret = Buffer.from(key)
  return async (request: Request) => {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') return Response.json({ status: 'ok' })
    if (!holds(request, secret)) return Response.json({ error: `this request needs the ${extractKeyHeader} header` }, { status: 401 })
    try {
      return Response.json(await answer(uploads, request, url))
    } catch (caught) {
      return failure(caught)
    }
  }
}

if (import.meta.main) {
  const key = extractKeyOf()
  const pool = connectPool()
  const uploads = await warmedUploads(pool)
  const server = await listen(extract(uploads, key), Number(process.env.EXTRACT_PORT ?? 3300), process.env.EXTRACT_HOST ?? '127.0.0.1')
  console.error(`finance extract on ${server.url}`)
  const stop = async () => {
    await uploads.settled()
    await server.close()
    await pool.end()
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
