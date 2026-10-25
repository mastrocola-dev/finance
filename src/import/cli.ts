import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname } from 'node:path'
import type { Client } from 'pg'
import { connect } from '../db/connection.ts'
import type { Actor } from '../db/write.ts'
import { RuleError } from '../ledger/rule.ts'
import { type Extractor, plan, retryImport, retryTargets, runImport, type Segment } from './agent.ts'
import { ingestSegments } from './ingest.ts'
import { serviceAgentExtractor } from './service-agent.ts'
import { formats, type ImportFile, maskDigits, openBatch } from './staging.ts'
import { verifyBatch } from './verify.ts'

export const maxBytes = 20 * 1024 * 1024

const actor: Actor = { author: 'import' }

export type FileImport = {
  segments?: (folder: string, file: string) => Promise<Segment[]>
  extractor?: (folder: string) => Extractor
  onProgress?: (done: number, total: number) => void
}

export const describeFile = async (path: string): Promise<ImportFile> => {
  const info = await stat(path)
  if (!info.isFile()) throw new RuleError(`${basename(path)} is not a file`)
  if (info.size > maxBytes) throw new RuleError(`${basename(path)} is larger than ${maxBytes / 1024 / 1024} MB`)
  const format = extname(path).slice(1).toLowerCase()
  if (!formats.some((known) => known === format)) throw new RuleError(`unsupported format ${format || 'without extension'}`)
  const hash = createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
  return { name: basename(path), format: format as ImportFile['format'], hash }
}

const defaults = { segments: ingestSegments, extractor: (folder: string) => serviceAgentExtractor({ folder }) }

export const openImport = async (client: Client, path: string, { segments = defaults.segments, extractor = defaults.extractor }: FileImport = {}, by: Actor = actor) => {
  const file = await describeFile(path)
  const folder = dirname(path)
  const agent = extractor(folder)
  const found = await segments(folder, file.name)
  const batchId = await openBatch(client, by, file)
  return { batchId, file, agent, found, chunks: plan(file.name, found).length }
}

export type OpenImport = Awaited<ReturnType<typeof openImport>>

export const finishImport = async (client: Client, { batchId, file, agent, found }: OpenImport, onProgress?: FileImport['onProgress'], by: Actor = actor) => {
  const result = await runImport(client, by, batchId, { file: file.name, segments: found, extractor: agent, onProgress })
  const verification = await verifyBatch(client, by, batchId)
  return { batchId, ...result, verification }
}

export const importFile = async (client: Client, path: string, options: FileImport = {}) => finishImport(client, await openImport(client, path, options), options.onProgress)

export const openRetry = async (client: Client, batchId: bigint, path: string, { segments = defaults.segments, extractor = defaults.extractor }: FileImport = {}) => {
  const file = await describeFile(path)
  const { rows } = await client.query<{ file_hash: string; open: boolean }>("select file_hash, closed_at is null and status in ('draft', 'verified') as open from import_batch where id = $1", [batchId])
  if (!rows[0]) throw new RuleError(`import batch ${batchId} not found`)
  if (!rows[0].open) throw new RuleError(`import batch ${batchId} is not open for a retry`)
  if (rows[0].file_hash !== file.hash) throw new RuleError(`${file.name} is not the file of import batch ${batchId}`)
  const targets = await retryTargets(client, batchId)
  if (!targets.length) throw new RuleError(`nothing to retry in import batch ${batchId}`)
  const folder = dirname(path)
  return { batchId, file, agent: extractor(folder), found: await segments(folder, file.name), chunks: targets.length }
}

export type OpenRetry = Awaited<ReturnType<typeof openRetry>>

export const finishRetry = async (client: Client, { batchId, file, agent, found }: OpenRetry, onProgress?: FileImport['onProgress'], by: Actor = actor) => {
  const result = await retryImport(client, by, batchId, { file: file.name, segments: found, extractor: agent, onProgress })
  const verification = await verifyBatch(client, by, batchId)
  return { batchId, ...result, verification }
}

export const retryFile = async (client: Client, batchId: bigint, path: string, options: FileImport = {}) => finishRetry(client, await openRetry(client, batchId, path, options), options.onProgress)

type Summary = Awaited<ReturnType<typeof importFile>> & { targets?: string[] }

export const importSummary = ({ batchId, candidates, questions, replaced, targets, usage, failures, done, total, stopped, verification }: Summary) =>
  [
    `batch ${batchId}: ${candidates.length} candidates, ${questions.length} questions from ${done} of ${total} chunks${targets ? `, ${replaced.length} replaced` : ''}`,
    `verified: ${verification.failed.length} with failed checks, ${verification.lowConfidence.length} low confidence, ${verification.questions.length} new questions, ${verification.totals.mismatches.length} of ${verification.totals.checked} totals mismatched`,
    ...verification.totals.mismatches.map(({ detail }) => `mismatch ${detail}`),
    `tokens ${usage.inputTokens} in, ${usage.outputTokens} out, US$ ${(usage.costUsdMicros / 1_000_000).toFixed(4)}`,
    ...(stopped ? [`stopped: ${stopped}`] : []),
    ...failures.map(({ source, offset, reason }) => `failed ${source}@${offset}: ${reason}`),
  ].join('\n')

const usage = 'usage: npm run import -- <file> | --retry <batch> <file>'

export const parseArgs = (args: string[]) => {
  if (args[0] !== '--retry') return args.length === 1 && args[0] ? { path: args[0] } : undefined
  const [, batch, path] = args
  return args.length === 3 && batch && /^\d+$/.test(batch) && path ? { batchId: BigInt(batch), path } : undefined
}

if (import.meta.main) {
  const parsed = parseArgs(process.argv.slice(2))
  if (!parsed) {
    console.error(usage)
    process.exit(1)
  }
  const client = await connect()
  const onProgress = (done: number, total: number) => process.stderr.write(`\rextracting ${done}/${total}`)
  try {
    const result = parsed.batchId === undefined ? await importFile(client, parsed.path, { onProgress }) : await retryFile(client, parsed.batchId, parsed.path, { onProgress })
    process.stderr.write('\n')
    console.log(importSummary(result))
  } catch (error) {
    console.error(`import failed: ${maskDigits(error instanceof Error ? error.message : String(error))}`)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}
