import type { Actor } from '../db/write.ts'
import { Busy, type Imports, type Progress, type Runtime, Unavailable } from '../import/uploads.ts'
import { RuleError } from '../ledger/rule.ts'

export const extractKeyHeader = 'x-extract-key'

export const extractKeyOf = (value = process.env.EXTRACT_KEY) => {
  if (!value || value.length < 32) throw new Error('EXTRACT_KEY must have at least 32 characters')
  return value
}

const failures: Record<number, new (message: string) => Error> = { 409: Busy, 422: RuleError, 503: Unavailable }

const memberOf = (actor: Actor): Record<string, string> => (actor.memberId === undefined ? {} : { 'x-member-id': String(actor.memberId) })

export const remoteUploads = (url: string, key: string, fetcher: typeof fetch = fetch): Imports => {
  const call = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetcher(new URL(path, url), { ...init, headers: { ...init.headers, [extractKeyHeader]: key } }).catch(() => {
      throw new Unavailable('the extraction service cannot be reached')
    })
    const body = await response.json().catch(() => ({}))
    if (response.ok) return body as T
    const Failure = failures[response.status] ?? Error
    throw new Failure(body.error ?? `the extraction service answered ${response.status}`)
  }

  const post = <T>(path: string, actor?: Actor) => call<T>(path, { method: 'POST', headers: actor ? memberOf(actor) : {} })

  return {
    start: async (actor, name, bytes) => {
      const headers = { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(name), ...memberOf(actor) }
      return BigInt((await call<{ id: string }>('/uploads', { method: 'POST', headers, body: bytes as Uint8Array<ArrayBuffer> })).id)
    },
    retry: async (actor, batchId) => {
      await post(`/batches/${batchId}/retry`, actor)
    },
    discard: async (batchId) => (await post<{ removed: string[] }>(`/batches/${batchId}/discard`)).removed,
    runtime: () => call<Runtime>('/runtime').catch((): Runtime => ({ ready: false, cause: 'failed', warming: false })),
    progressOf: async (batchIds) => {
      if (!batchIds.length) return new Map()
      const listed = await call<(Progress & { id: string })[]>(`/progress?ids=${batchIds.join(',')}`)
      return new Map(listed.map(({ id, ...progress }) => [BigInt(id), progress]))
    },
  }
}
