import type { Client } from 'pg'
import { type Actor, write } from '../db/write.ts'
import { RuleError } from '../ledger/rule.ts'
import type { Usage } from './agent.ts'
import { importOutput } from './candidate.ts'

export const formats = ['xlsx', 'csv', 'json', 'xml', 'txt', 'ofx', 'pdf'] as const

export type ImportFile = { name: string; format: (typeof formats)[number]; hash: string }

const date = /^(19|20)\d\d(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(([01]\d|2[0-3])[0-5]\d([0-5]\d)?)?$/

export const maskDigits = (value: string) => value.replace(/\d{5,}/g, (digits, offset: number) => (date.test(digits) || /^[.,]\d\d(?!\d)/.test(value.slice(offset + digits.length)) ? digits : `•${digits.slice(-4)}`))

export const openBatch = (client: Client, actor: Actor, file: ImportFile) =>
  write(client, actor, async (ledger) => {
    if (!formats.includes(file.format)) throw new RuleError(`unsupported format ${file.format}`)
    if (!/^[0-9a-f]{64}$/.test(file.hash)) throw new RuleError('hash must be a sha-256 hex digest')
    const row = await ledger.create('import_batch', { file_name: maskDigits(file.name), format: file.format, file_hash: file.hash })
    return row.id as bigint
  })

const issues = (error: { issues: { path: PropertyKey[]; message: string }[] }) =>
  error.issues
    .slice(0, 5)
    .map(({ path, message }) => `${path.map(String).join('.') || 'output'}: ${message}`)
    .join('; ')

export const stageOutput = (client: Client, actor: Actor, batchId: bigint, output: unknown, usage?: Usage) =>
  write(client, actor, async (ledger) => {
    const parsed = importOutput.safeParse(output)
    if (!parsed.success) throw new RuleError(`invalid import output: ${issues(parsed.error)}`)
    const { rows } = await client.query<{ status: string; input_tokens: bigint; output_tokens: bigint; cost_usd_micros: bigint }>('select status, input_tokens, output_tokens, cost_usd_micros from import_batch where id = $1 and closed_at is null for update', [batchId])
    const batch = rows[0]
    if (batch?.status !== 'draft') throw new RuleError(`import batch ${batchId} is not an open draft`)
    if (usage && usage.inputTokens + usage.outputTokens + usage.costUsdMicros > 0)
      await ledger.update('import_batch', batchId, {
        input_tokens: batch.input_tokens + BigInt(usage.inputTokens),
        output_tokens: batch.output_tokens + BigInt(usage.outputTokens),
        cost_usd_micros: batch.cost_usd_micros + BigInt(usage.costUsdMicros),
      })
    const candidates: bigint[] = []
    for (const { kind, source, confidence, payload } of parsed.data.candidates) {
      const row = await ledger.create('import_candidate', { batch_id: batchId, kind, source, confidence, payload })
      candidates.push(row.id as bigint)
    }
    const questions: bigint[] = []
    for (const item of parsed.data.questions) {
      const row = await ledger.create('import_question', {
        batch_id: batchId,
        candidate_id: item.candidate === undefined ? null : candidates[item.candidate],
        question: maskDigits(item.question),
        options: JSON.stringify(item.options.map(maskDigits)),
        source: item.source ?? null,
      })
      questions.push(row.id as bigint)
    }
    return { candidates, questions }
  })
