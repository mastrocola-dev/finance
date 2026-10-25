import type { Client } from 'pg'
import * as z from 'zod'
import type { Actor } from '../db/write.ts'
import { RuleError } from '../ledger/rule.ts'
import { type ImportOutput, importOutput } from './candidate.ts'
import { chunkKey, maskDigits, stageOutput } from './staging.ts'
import { confidenceThreshold } from './verify.ts'

export type Segment = { id: string; kind: 'table' | 'tree' | 'text'; source: string; shape: Record<string, unknown>; preview?: unknown }
export type Strategy = 'mapping' | 'records'
export type Chunk = { file: string; segment: Segment; strategy: Strategy; offset: number; limit: number }
export type Task = Chunk & { maxTokens: number }
export type Usage = z.infer<typeof usage>
export type Extraction = { output: unknown; usage: Usage }
export type Extractor = { extract: (task: Task) => Promise<Extraction> }
export type Failure = { source: string; offset: number; reason: string }
export type Origin = { candidates: string[]; questions: string[]; totals: string[] }
export type Run = { file: string; segments: Segment[]; extractor: Extractor; tokenCap?: number; only?: string[]; onProgress?: (done: number, total: number) => void }

export class ExtractionError extends Error {
  usage: Usage

  constructor(message: string, spent: Usage) {
    super(message)
    this.usage = spent
  }
}

export const mappingFrom = 20
export const chunkSize = 40
export const outputLimits = { candidates: 500, questions: 50, totals: 50 }

const tokens = z.int().min(0)
export const usage = z.strictObject({ inputTokens: tokens, outputTokens: tokens, costUsdMicros: tokens })

export const defaultTokenCap = () => {
  const cap = Number(process.env.IMPORT_TOKEN_CAP ?? 400_000)
  if (!Number.isSafeInteger(cap) || cap <= 0) throw new Error('IMPORT_TOKEN_CAP must be a positive integer')
  return cap
}

const size = ({ shape }: Segment) => Number(shape.rows ?? shape.items ?? shape.lines ?? 0)

export const strategyOf = (segment: Segment): Strategy => (segment.kind !== 'text' && size(segment) >= mappingFrom ? 'mapping' : 'records')

export const plan = (file: string, segments: Segment[]): Chunk[] =>
  segments.flatMap((segment) => {
    const strategy = strategyOf(segment)
    const total = Math.max(size(segment), 1)
    if (strategy === 'mapping' || total <= chunkSize) return [{ file, segment, strategy, offset: 0, limit: total }]
    return Array.from({ length: Math.ceil(total / chunkSize) }, (_, index) => ({ file, segment, strategy, offset: index * chunkSize, limit: chunkSize }))
  })

const reason = (error: unknown) => maskDigits(error instanceof Error ? error.message : String(error)).slice(0, 300)

const describeIssues = (error: z.ZodError) =>
  error.issues
    .slice(0, 3)
    .map(({ path, message }) => `${path.map(String).join('.') || 'output'}: ${message}`)
    .join('; ')

export const extract = async ({ file, segments, extractor, tokenCap = defaultTokenCap(), only, onProgress }: Run) => {
  const chunks = plan(file, segments).filter((chunk) => !only || only.includes(chunkKey(chunk.segment.source, chunk.offset)))
  const output: ImportOutput = { candidates: [], questions: [], totals: [] }
  const origin: Origin = { candidates: [], questions: [], totals: [] }
  const spent: Usage = { inputTokens: 0, outputTokens: 0, costUsdMicros: 0 }
  const failures: Failure[] = []
  const attempted: string[] = []
  const result = (done: number, stopped?: 'token cap' | 'output limit') => ({ output, origin, usage: spent, failures, attempted, done, total: chunks.length, stopped })
  for (const [index, chunk] of chunks.entries()) {
    const used = spent.inputTokens + spent.outputTokens
    if (used >= tokenCap) return result(index, 'token cap')
    const key = chunkKey(chunk.segment.source, chunk.offset)
    const fail = (why: string) => {
      attempted.push(key)
      failures.push({ source: chunk.segment.source, offset: chunk.offset, reason: why })
    }
    const charge = (cost: Usage) => {
      spent.inputTokens += cost.inputTokens
      spent.outputTokens += cost.outputTokens
      spent.costUsdMicros += cost.costUsdMicros
    }
    try {
      const extraction = await extractor.extract({ ...chunk, maxTokens: tokenCap - used })
      charge(usage.parse(extraction.usage))
      const parsed = importOutput.safeParse(extraction.output)
      if (!parsed.success) fail(`invalid output: ${describeIssues(parsed.error)}`)
      else if (output.candidates.length + parsed.data.candidates.length > outputLimits.candidates || output.questions.length + parsed.data.questions.length > outputLimits.questions || output.totals.length + parsed.data.totals.length > outputLimits.totals) return result(index, 'output limit')
      else {
        const shift = output.candidates.length
        attempted.push(key)
        output.candidates.push(...parsed.data.candidates)
        output.questions.push(...parsed.data.questions.map((item) => (item.candidate === undefined ? item : { ...item, candidate: item.candidate + shift })))
        output.totals.push(...parsed.data.totals)
        origin.candidates.push(...parsed.data.candidates.map(() => key))
        origin.questions.push(...parsed.data.questions.map(() => key))
        origin.totals.push(...parsed.data.totals.map(() => key))
      }
    } catch (error) {
      if (error instanceof ExtractionError) charge(usage.parse(error.usage))
      fail(reason(error))
    }
    onProgress?.(index + 1, chunks.length)
  }
  return result(chunks.length)
}

const openBatchStatus = async (client: Client, batchId: bigint) => (await client.query<{ status: string }>('select status from import_batch where id = $1 and closed_at is null', [batchId])).rows[0]?.status

const staged = async (client: Client, actor: Actor, batchId: bigint, extracted: Awaited<ReturnType<typeof extract>>, retried?: string[]) => {
  const { output, origin, usage: spent, failures, done, total, stopped } = extracted
  const result = await stageOutput(client, actor, batchId, output, { usage: spent, origin, failures, retried })
  return { ...result, usage: spent, failures, done, total, stopped }
}

export const runImport = async (client: Client, actor: Actor, batchId: bigint, run: Run) => {
  if ((await openBatchStatus(client, batchId)) !== 'draft') throw new RuleError(`import batch ${batchId} is not an open draft`)
  return staged(client, actor, batchId, await extract(run))
}

export const retryTargets = async (client: Client, batchId: bigint, threshold = confidenceThreshold) => {
  const { rows } = await client.query<{ chunk: string }>(
    `select chunk from import_candidate where batch_id = $1 and closed_at is null and status = 'pending' and chunk is not null and confidence < $2
    union select concat(failure->>'source', '@', failure->>'offset') from import_batch, jsonb_array_elements(failures) as failure where id = $1
    except (select chunk from import_candidate where batch_id = $1 and closed_at is null and status <> 'pending' and chunk is not null
      union select q.chunk from import_question q where q.batch_id = $1 and q.closed_at is null and q.answer is not null and q.chunk is not null
      union select c.chunk from import_question q join import_candidate c on c.id = q.candidate_id where q.batch_id = $1 and q.closed_at is null and q.answer is not null and c.chunk is not null)
    order by 1`,
    [batchId, threshold],
  )
  return rows.map((row) => row.chunk)
}

export const retryImport = async (client: Client, actor: Actor, batchId: bigint, run: Omit<Run, 'only'>, threshold = confidenceThreshold) => {
  const status = await openBatchStatus(client, batchId)
  if (status !== 'draft' && status !== 'verified') throw new RuleError(`import batch ${batchId} is not open for a retry`)
  const targets = await retryTargets(client, batchId, threshold)
  const extracted = await extract({ ...run, only: targets })
  return { targets, ...(await staged(client, actor, batchId, extracted, extracted.attempted)) }
}
