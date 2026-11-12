import { createHash } from 'node:crypto'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { PoolClient } from 'pg'
import type { Database } from '../db/connection.ts'
import type { Actor } from '../db/write.ts'
import { RuleError } from '../ledger/rule.ts'
import { type FileImport, finishImport, finishRetry, openImport, openRetry } from './cli.ts'
import { type IngestReadiness, warmIngest } from './ingest.ts'
import { batchOfFile, maskDigits } from './staging.ts'

export type Progress = { state: 'extracting' | 'done' | 'failed'; done: number; total: number; error: string | null }

export type Uploads = Omit<FileImport, 'onProgress'> & { folder?: string; warm?: () => Promise<IngestReadiness>; cooldownMs?: number; onWarmed?: (readiness: IngestReadiness) => void; dailyCapUsdMicros?: number }

export const uploadsFolder = () => resolve(process.env.IMPORT_UPLOADS ?? '.imports')

export const fileNameIssue = (name: string) => {
  if (!name.trim() || name.length > 200) return 'file name must have 1 to 200 characters'
  if (/[/\\\0]/.test(name) || name === '.' || name === '..') return 'file name must not contain a path'
  return undefined
}

export const dailyCapOf = (value = process.env.IMPORT_DAILY_USD_CAP) => {
  if (value === undefined || value === '') return Number.POSITIVE_INFINITY
  const usd = Number(value)
  if (!/^\d+(\.\d+)?$/.test(value) || !(usd > 0)) throw new Error('IMPORT_DAILY_USD_CAP must be a positive amount in US$')
  return Math.round(usd * 1_000_000)
}

const spentToday = async (pool: Database) => Number((await pool.query<{ spent: string }>("select coalesce(sum(cost_usd_micros), 0)::text as spent from import_batch where (created_at at time zone 'America/Sao_Paulo')::date = (ledger_now() at time zone 'America/Sao_Paulo')::date")).rows[0]?.spent)

const dollars = (micros: number) => (micros / 1_000_000).toFixed(2).replace('.', ',')

export class Busy extends Error {}

export class Unavailable extends Error {}

const hashName = /^[0-9a-f]{64}$/

const kept = async (pool: Database, hashes: string[]) => new Set((await pool.query<{ hash: string }>("select distinct file_hash as hash from import_batch where file_hash = any($1) and status in ('draft', 'verified')", [hashes])).rows.map((row) => row.hash))

const present = (path: string) =>
  stat(path).then(
    (info) => info.isFile(),
    () => false,
  )

const folders = async (folder: string) => {
  try {
    return (await readdir(folder, { withFileTypes: true })).filter((item) => item.isDirectory() && hashName.test(item.name)).map((item) => item.name)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export const importUploads = (pool: Database, { folder = uploadsFolder(), warm: warmer = warmIngest, cooldownMs = 30000, onWarmed, dailyCapUsdMicros = dailyCapOf(), ...options }: Uploads = {}) => {
  const progress = new Map<bigint, Progress>()
  const running = new Set<Promise<void>>()
  let readiness: IngestReadiness = { ready: true }
  let warming: Promise<IngestReadiness> | undefined
  let attempted = Number.NEGATIVE_INFINITY

  const warm = () => {
    warming ??= warmer()
      .catch((error: unknown): IngestReadiness => ({ ready: false, cause: 'failed', reason: String(error) }))
      .then((value) => {
        readiness = value
        attempted = Date.now()
        warming = undefined
        onWarmed?.(value)
        return value
      })
    return warming
  }

  const rewarm = () => {
    if (!readiness.ready && !warming && Date.now() - attempted >= cooldownMs) void warm()
  }

  const runtime = () => {
    rewarm()
    return readiness.ready ? { ready: true, cause: null, warming: false } : { ready: false, cause: readiness.cause, warming: Boolean(warming) }
  }

  const available = () => {
    rewarm()
    if (!readiness.ready) throw new Unavailable(`the ingest runtime is not ready (${readiness.cause})`)
  }

  const withinCap = async () => {
    if (!Number.isFinite(dailyCapUsdMicros)) return
    if ((await spentToday(pool)) >= dailyCapUsdMicros) throw new RuleError(`O limite diário de leitura pelo Claude (US$ ${dollars(dailyCapUsdMicros)}) foi atingido. Tente de novo amanhã.`)
  }

  const extract = async (connection: PoolClient, batchId: bigint, finish: (onProgress: NonNullable<FileImport['onProgress']>) => Promise<unknown>) => {
    const state = progress.get(batchId) as Progress
    try {
      await finish((done, total) => Object.assign(state, { done, total }))
      state.state = 'done'
    } catch (error) {
      Object.assign(state, { state: 'failed', error: maskDigits(error instanceof Error ? error.message : String(error)).slice(0, 300) })
    } finally {
      connection.release()
    }
  }

  const track = (job: Promise<void>) => {
    const tracked = job.finally(() => running.delete(tracked))
    running.add(tracked)
  }

  const start = async (actor: Actor, name: string, bytes: Uint8Array) => {
    available()
    const issue = fileNameIssue(name)
    if (issue) throw new RuleError(issue)
    const hash = createHash('sha256').update(bytes).digest('hex')
    const existing = await batchOfFile(pool, hash)
    if (existing) throw new RuleError(`this file is already in import batch ${existing}`)
    await withinCap()
    const at = join(folder, hash)
    const connection = await pool.connect()
    let created: string | undefined
    try {
      created = await mkdir(at, { recursive: true })
      await writeFile(join(at, name), bytes)
      const opened = await openImport(connection, join(at, name), options, actor)
      progress.set(opened.batchId, { state: 'extracting', done: 0, total: opened.chunks, error: null })
      track(extract(connection, opened.batchId, (onProgress) => finishImport(connection, opened, onProgress, actor)))
      return opened.batchId
    } catch (error) {
      connection.release()
      if (created) await rm(at, { recursive: true, force: true })
      throw error
    }
  }

  const retry = async (actor: Actor, batchId: bigint) => {
    const previous = progress.get(batchId)
    if (previous?.state === 'extracting') throw new Busy(`import batch ${batchId} is still extracting`)
    available()
    progress.set(batchId, { state: 'extracting', done: 0, total: 0, error: null })
    let connection: PoolClient | undefined
    try {
      const batch = (await pool.query<{ hash: string; name: string; open: boolean }>("select file_hash as hash, file_name as name, closed_at is null and status in ('draft', 'verified') as open from import_batch where id = $1", [batchId])).rows[0]
      if (!batch) throw new RuleError(`import batch ${batchId} not found`)
      if (!batch.open) throw new RuleError(`import batch ${batchId} is not open for a retry`)
      const path = join(folder, batch.hash, batch.name)
      if (!(await present(path))) throw new RuleError(`the file of import batch ${batchId} is no longer kept; close the batch and upload the file again`)
      await withinCap()
      connection = await pool.connect()
      const opened = await openRetry(connection, batchId, path, options)
      const held = connection
      Object.assign(progress.get(batchId) as Progress, { total: opened.chunks })
      track(extract(held, batchId, (onProgress) => finishRetry(held, opened, onProgress, actor)))
    } catch (error) {
      connection?.release()
      if (previous) progress.set(batchId, previous)
      else progress.delete(batchId)
      throw error
    }
  }

  const prune = async (hashes: string[]) => {
    const keep = await kept(pool, hashes)
    const removed = hashes.filter((hash) => !keep.has(hash))
    for (const hash of removed) await rm(join(folder, hash), { recursive: true, force: true })
    return removed
  }

  const discard = async (batchId: bigint) => {
    const hash = (await pool.query<{ hash: string }>('select file_hash as hash from import_batch where id = $1', [batchId])).rows[0]?.hash
    return hash ? prune([hash]) : []
  }

  const sweep = async () => prune(await folders(folder))

  return { start, retry, discard, sweep, runtime, warm, progressOf: (batchId: bigint) => progress.get(batchId) ?? null, settled: () => Promise.all([...running, warming]) }
}

export type ImportUploads = ReturnType<typeof importUploads>
