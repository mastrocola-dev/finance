import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname } from 'node:path'
import type { Client } from 'pg'
import { connect } from '../db/connection.ts'
import type { Actor } from '../db/write.ts'
import { RuleError } from '../ledger/rule.ts'
import { type Extractor, runImport, type Segment } from './agent.ts'
import { ingestSegments } from './ingest.ts'
import { serviceAgentExtractor } from './service-agent.ts'
import { formats, type ImportFile, maskDigits, openBatch } from './staging.ts'

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

export const importFile = async (client: Client, path: string, { segments = ingestSegments, extractor = (folder) => serviceAgentExtractor({ folder }), onProgress }: FileImport = {}) => {
  const file = await describeFile(path)
  const folder = dirname(path)
  const agent = extractor(folder)
  const found = await segments(folder, file.name)
  const batchId = await openBatch(client, actor, file)
  const result = await runImport(client, actor, batchId, { file: file.name, segments: found, extractor: agent, onProgress })
  return { batchId, ...result }
}

export const importSummary = ({ batchId, candidates, questions, usage, failures, done, total, stopped }: Awaited<ReturnType<typeof importFile>>) =>
  [
    `batch ${batchId}: ${candidates.length} candidates, ${questions.length} questions from ${done} of ${total} chunks`,
    `tokens ${usage.inputTokens} in, ${usage.outputTokens} out, US$ ${(usage.costUsdMicros / 1_000_000).toFixed(4)}`,
    ...(stopped ? [`stopped: ${stopped}`] : []),
    ...failures.map(({ source, offset, reason }) => `failed ${source}@${offset}: ${reason}`),
  ].join('\n')

if (import.meta.main) {
  const [path] = process.argv.slice(2)
  if (!path) {
    console.error('usage: npm run import -- <file>')
    process.exit(1)
  }
  const client = await connect()
  try {
    const result = await importFile(client, path, { onProgress: (done, total) => process.stderr.write(`\rextracting ${done}/${total}`) })
    process.stderr.write('\n')
    console.log(importSummary(result))
  } catch (error) {
    console.error(`import failed: ${maskDigits(error instanceof Error ? error.message : String(error))}`)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}
