import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { PoolClient } from 'pg'
import type { Database } from '../db/connection.ts'
import type { Actor } from '../db/write.ts'
import { RuleError } from '../ledger/rule.ts'
import { type FileImport, finishImport, openImport } from './cli.ts'
import { batchOfFile, maskDigits } from './staging.ts'

export type Progress = { state: 'extracting' | 'done' | 'failed'; done: number; total: number; error: string | null }

export type Uploads = Omit<FileImport, 'onProgress'> & { folder?: string }

export const uploadsFolder = () => resolve(process.env.IMPORT_UPLOADS ?? '.imports')

export const fileNameIssue = (name: string) => {
  if (!name.trim() || name.length > 200) return 'file name must have 1 to 200 characters'
  if (/[/\\\0]/.test(name) || name === '.' || name === '..') return 'file name must not contain a path'
  return undefined
}

export const importUploads = (pool: Database, { folder = uploadsFolder(), ...options }: Uploads = {}) => {
  const progress = new Map<bigint, Progress>()
  const running = new Set<Promise<void>>()

  const extract = async (connection: PoolClient, opened: Awaited<ReturnType<typeof openImport>>, actor: Actor) => {
    const state = progress.get(opened.batchId) as Progress
    try {
      await finishImport(connection, opened, (done, total) => Object.assign(state, { done, total }), actor)
      state.state = 'done'
    } catch (error) {
      Object.assign(state, { state: 'failed', error: maskDigits(error instanceof Error ? error.message : String(error)).slice(0, 300) })
    } finally {
      connection.release()
    }
  }

  const start = async (actor: Actor, name: string, bytes: Uint8Array) => {
    const issue = fileNameIssue(name)
    if (issue) throw new RuleError(issue)
    const hash = createHash('sha256').update(bytes).digest('hex')
    const existing = await batchOfFile(pool, hash)
    if (existing) throw new RuleError(`this file is already in import batch ${existing}`)
    const at = join(folder, hash)
    const connection = await pool.connect()
    let created: string | undefined
    try {
      created = await mkdir(at, { recursive: true })
      await writeFile(join(at, name), bytes)
      const opened = await openImport(connection, join(at, name), options, actor)
      progress.set(opened.batchId, { state: 'extracting', done: 0, total: opened.chunks, error: null })
      const job = extract(connection, opened, actor).finally(() => running.delete(job))
      running.add(job)
      return opened.batchId
    } catch (error) {
      connection.release()
      if (created) await rm(at, { recursive: true, force: true })
      throw error
    }
  }

  return { start, progressOf: (batchId: bigint) => progress.get(batchId) ?? null, settled: () => Promise.all(running) }
}

export type ImportUploads = ReturnType<typeof importUploads>
