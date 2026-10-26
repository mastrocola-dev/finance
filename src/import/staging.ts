import type { Client } from 'pg'
import type { Queryable } from '../db/connection.ts'
import { type Actor, type Writer, write } from '../db/write.ts'
import { RuleError } from '../ledger/rule.ts'
import type { Failure, Origin, Usage } from './agent.ts'
import { importOutput } from './candidate.ts'

export const formats = ['xlsx', 'csv', 'json', 'xml', 'txt', 'ofx', 'pdf'] as const

export type ImportFile = { name: string; format: (typeof formats)[number]; hash: string }

const date = /^(19|20)\d\d(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(([01]\d|2[0-3])[0-5]\d([0-5]\d)?)?$/

export const maskDigits = (value: string) => value.replace(/\d{5,}/g, (digits, offset: number) => (date.test(digits) || /^[.,]\d\d(?!\d)/.test(value.slice(offset + digits.length)) ? digits : `•${digits.slice(-4)}`))

export const batchOfFile = async (client: Queryable, hash: string) =>
  (
    await client.query<{ id: bigint }>(
      `select id from import_batch b where file_hash = $1
      and (status in ('draft', 'verified', 'committed') or exists (select 1 from import_candidate c where c.batch_id = b.id and c.record_id is not null))
      order by id limit 1`,
      [hash],
    )
  ).rows[0]?.id

export const openBatch = (client: Client, actor: Actor, file: ImportFile) =>
  write(client, actor, async (ledger) => {
    if (!formats.includes(file.format)) throw new RuleError(`unsupported format ${file.format}`)
    if (!/^[0-9a-f]{64}$/.test(file.hash)) throw new RuleError('hash must be a sha-256 hex digest')
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [file.hash])
    const existing = await batchOfFile(client, file.hash)
    if (existing) throw new RuleError(`this file is already in import batch ${existing}`)
    const row = await ledger.create('import_batch', { file_name: maskDigits(file.name), format: file.format, file_hash: file.hash })
    return row.id as bigint
  })

export const chunkKey = (source: string, offset = 0) => `${source}@${offset}`

const issues = (error: { issues: { path: PropertyKey[]; message: string }[] }) =>
  error.issues
    .slice(0, 5)
    .map(({ path, message }) => `${path.map(String).join('.') || 'output'}: ${message}`)
    .join('; ')

export type Staging = { usage?: Usage; origin?: Origin; failures?: Failure[]; retried?: string[] }

type Keyed = { chunk?: string }
type Batch = { status: string; input_tokens: bigint; output_tokens: bigint; cost_usd_micros: bigint; totals: Keyed[]; failures: Failure[] }

export const stageOutput = (client: Client, actor: Actor, batchId: bigint, output: unknown, { usage, origin, failures = [], retried }: Staging = {}) =>
  write(client, actor, async (ledger) => {
    const parsed = importOutput.safeParse(output)
    if (!parsed.success) throw new RuleError(`invalid import output: ${issues(parsed.error)}`)
    const { rows } = await client.query<Batch>('select status, input_tokens, output_tokens, cost_usd_micros, totals, failures from import_batch where id = $1 and closed_at is null for update', [batchId])
    const batch = rows[0]
    const open = retried ? ['draft', 'verified'] : ['draft']
    if (!batch || !open.includes(batch.status)) throw new RuleError(`import batch ${batchId} is not an open draft`)
    const failed = new Set(failures.map(({ source, offset }) => chunkKey(source, offset)))
    const replaced = (retried ?? []).filter((key) => !failed.has(key))
    const closed = await replaceChunks(client, ledger, batchId, replaced)
    const keptTotals = batch.totals.filter((item) => !item.chunk || !replaced.includes(item.chunk))
    const keptFailures = batch.failures.filter(({ source, offset }) => !retried?.includes(chunkKey(source, offset)))
    const spent = usage && usage.inputTokens + usage.outputTokens + usage.costUsdMicros > 0
    const changes = {
      ...(spent && {
        input_tokens: batch.input_tokens + BigInt(usage.inputTokens),
        output_tokens: batch.output_tokens + BigInt(usage.outputTokens),
        cost_usd_micros: batch.cost_usd_micros + BigInt(usage.costUsdMicros),
      }),
      ...((parsed.data.totals.length > 0 || keptTotals.length < batch.totals.length) && { totals: JSON.stringify([...keptTotals, ...parsed.data.totals.map((item, index) => ({ ...item, chunk: origin?.totals[index] }))]) }),
      ...((failures.length > 0 || keptFailures.length < batch.failures.length) && { failures: JSON.stringify([...keptFailures, ...failures]) }),
      ...(batch.status === 'verified' && replaced.length > 0 && { status: 'draft' }),
    }
    if (Object.keys(changes).length > 0) await ledger.update('import_batch', batchId, changes)
    const candidates: bigint[] = []
    for (const [index, { kind, source, confidence, payload }] of parsed.data.candidates.entries()) {
      const row = await ledger.create('import_candidate', { batch_id: batchId, kind, source, confidence, payload, chunk: origin?.candidates[index] ?? null })
      candidates.push(row.id as bigint)
    }
    const questions: bigint[] = []
    for (const [index, item] of parsed.data.questions.entries()) {
      const row = await ledger.create('import_question', {
        batch_id: batchId,
        candidate_id: item.candidate === undefined ? null : candidates[item.candidate],
        question: maskDigits(item.question),
        options: JSON.stringify(item.options.map(maskDigits)),
        source: item.source ?? null,
        chunk: origin?.questions[index] ?? null,
      })
      questions.push(row.id as bigint)
    }
    return { candidates, questions, replaced: closed }
  })

const replaceChunks = async (client: Client, ledger: Writer, batchId: bigint, chunks: string[]) => {
  if (chunks.length === 0) return []
  const stale = await client.query<{ id: bigint }>("select id from import_candidate where batch_id = $1 and closed_at is null and status = 'pending' and chunk = any($2) order by id", [batchId, chunks])
  const ids = stale.rows.map((row) => row.id)
  const questions = await client.query<{ id: bigint }>('select id from import_question where batch_id = $1 and closed_at is null and (chunk = any($2) or candidate_id = any($3)) order by id', [batchId, chunks, ids])
  for (const { id } of questions.rows) await ledger.close('import_question', id)
  for (const id of ids) await ledger.close('import_candidate', id, { status: 'replaced' })
  return ids
}
