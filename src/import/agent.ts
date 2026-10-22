import type { Client } from 'pg'
import * as z from 'zod'
import type { Actor } from '../db/write.ts'
import { RuleError } from '../ledger/rule.ts'
import { type ImportOutput, importOutput } from './candidate.ts'
import { maskDigits, stageOutput } from './staging.ts'

export type Segment = { id: string; kind: 'table' | 'tree' | 'text'; source: string; shape: Record<string, unknown>; preview?: unknown }
export type Strategy = 'mapping' | 'records'
export type Chunk = { file: string; segment: Segment; strategy: Strategy; offset: number; limit: number }
export type Task = Chunk & { maxTokens: number }
export type Usage = z.infer<typeof usage>
export type Extraction = { output: unknown; usage: Usage }
export type Extractor = { extract: (task: Task) => Promise<Extraction> }
export type Failure = { source: string; offset: number; reason: string }
export type Run = { file: string; segments: Segment[]; extractor: Extractor; tokenCap?: number; onProgress?: (done: number, total: number) => void }

export const mappingFrom = 20
export const chunkSize = 40
export const outputLimits = { candidates: 500, questions: 50 }

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

export const extract = async ({ file, segments, extractor, tokenCap = defaultTokenCap(), onProgress }: Run) => {
  const chunks = plan(file, segments)
  const output: ImportOutput = { candidates: [], questions: [] }
  const spent: Usage = { inputTokens: 0, outputTokens: 0, costUsdMicros: 0 }
  const failures: Failure[] = []
  const result = (done: number, stopped?: 'token cap' | 'output limit') => ({ output, usage: spent, failures, done, total: chunks.length, stopped })
  for (const [index, chunk] of chunks.entries()) {
    const used = spent.inputTokens + spent.outputTokens
    if (used >= tokenCap) return result(index, 'token cap')
    const fail = (why: string) => failures.push({ source: chunk.segment.source, offset: chunk.offset, reason: why })
    try {
      const extraction = await extractor.extract({ ...chunk, maxTokens: tokenCap - used })
      const cost = usage.parse(extraction.usage)
      spent.inputTokens += cost.inputTokens
      spent.outputTokens += cost.outputTokens
      spent.costUsdMicros += cost.costUsdMicros
      const parsed = importOutput.safeParse(extraction.output)
      if (!parsed.success) fail(`invalid output: ${describeIssues(parsed.error)}`)
      else if (output.candidates.length + parsed.data.candidates.length > outputLimits.candidates || output.questions.length + parsed.data.questions.length > outputLimits.questions) return result(index, 'output limit')
      else {
        const shift = output.candidates.length
        output.candidates.push(...parsed.data.candidates)
        output.questions.push(...parsed.data.questions.map((item) => (item.candidate === undefined ? item : { ...item, candidate: item.candidate + shift })))
      }
    } catch (error) {
      fail(reason(error))
    }
    onProgress?.(index + 1, chunks.length)
  }
  return result(chunks.length)
}

export const runImport = async (client: Client, actor: Actor, batchId: bigint, run: Run) => {
  const { rows } = await client.query<{ status: string }>('select status from import_batch where id = $1 and closed_at is null', [batchId])
  if (rows[0]?.status !== 'draft') throw new RuleError(`import batch ${batchId} is not an open draft`)
  const extracted = await extract(run)
  const staged = await stageOutput(client, actor, batchId, extracted.output, extracted.usage)
  return { ...staged, usage: extracted.usage, failures: extracted.failures, done: extracted.done, total: extracted.total, stopped: extracted.stopped }
}
