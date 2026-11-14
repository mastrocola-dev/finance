import type { Client } from 'pg'
import * as z from 'zod'
import type { Queryable } from '../db/connection.ts'
import { type Actor, type Writer, write } from '../db/write.ts'
import { RuleError } from '../ledger/rule.ts'
import { ExtractionError, type Usage, usage } from './agent.ts'
import { type CandidateKind, text } from './candidate.ts'
import { normalize } from './match.ts'
import { maskDigits } from './staging.ts'
import { categoryKind, same } from './verify.ts'

export type Kind = 'income' | 'expense'
export type Named = { name: string; kind: Kind }
export type ConsolidateTask = { maxTokens: number; target: number; categories: (Named & { samples: string[] })[]; existing: Named[] }
export type Consolidator = { consolidate: (task: ConsolidateTask) => Promise<{ output: unknown; usage: Usage }> }
export type Merge = Named & { to: string; candidates: number }
export type Consolidation = { merges: Merge[]; unchecked: Record<string, unknown>[]; failure: string | null }

export const categoryTarget = 20
export const sampleLimit = 3

const kind = z.enum(['income', 'expense'])
export const consolidationOutput = z.strictObject({ categories: z.array(z.strictObject({ name: z.string().min(1).max(200), kind, to: text('Canonical category name') })).max(500) })

type Row = { id: bigint; kind: string; status: string; payload: Record<string, unknown> }

const nothing: Usage = { inputTokens: 0, outputTokens: 0, costUsdMicros: 0 }
const keyOf = (name: string, of: string) => `${of}|${normalize(name)}`
const categoryOf = (row: Row) => (row.kind !== 'category' && typeof row.payload.category === 'string' ? keyOf(row.payload.category, categoryKind(row.kind as CandidateKind, row.payload)) : undefined)
const described = (row: Row) => [row.payload.description, row.payload.name].find((value) => typeof value === 'string') as string | undefined

const staged = async (client: Queryable, batchId: bigint) => {
  const { rows } = await client.query<Row>("select id, kind, status, payload from import_candidate where batch_id = $1 and closed_at is null and status <> 'rejected' order by id", [batchId])
  const existing = (await client.query<Named>('select name, kind from category where closed_at is null order by kind, name')).rows
  return { categories: rows.filter((row) => row.kind === 'category'), users: rows.filter((row) => row.kind !== 'category'), existing }
}

const taskOf = ({ categories, users, existing }: Awaited<ReturnType<typeof staged>>, maxTokens: number): ConsolidateTask => ({
  maxTokens,
  target: categoryTarget,
  categories: categories.map(({ payload }) => {
    const name = String(payload.name)
    const of = payload.kind as Kind
    const samples = [...new Set(users.filter((row) => categoryOf(row) === keyOf(name, of)).flatMap((row) => described(row) ?? []))]
    return { name: maskDigits(name), kind: of, samples: samples.slice(0, sampleLimit).map(maskDigits) }
  }),
  existing: existing.map(({ name, kind: of }) => ({ name: maskDigits(name), kind: of })),
})

const mergePlan = (categories: Row[], existing: Named[], answer: z.infer<typeof consolidationOutput>) => {
  const wanted = new Map(answer.categories.map((item) => [keyOf(item.name, item.kind), item.to.trim()]))
  const canonical = (name: string, of: string) => existing.find((item) => keyOf(item.name, item.kind) === keyOf(name, of))?.name ?? name
  const targets = categories.map((row) => {
    const name = String(row.payload.name)
    const of = String(row.payload.kind)
    return { row, name, kind: of as Kind, to: canonical(wanted.get(keyOf(name, of)) ?? name, of) }
  })
  const kept = new Map<string, Row>()
  for (const target of [...targets].sort((a, b) => Number(!same(a.name, a.to)) - Number(!same(b.name, b.to)))) {
    const key = keyOf(target.to, target.kind)
    if (!existing.some((item) => keyOf(item.name, item.kind) === key) && !kept.has(key)) kept.set(key, target.row)
  }
  const renames = new Map(targets.map(({ name, kind: of, to }) => [keyOf(name, of), to]))
  const sharing = (to: string, of: string) => targets.filter((target) => target.kind === of && keyOf(target.to, of) === keyOf(to, of)).length
  const sole = new Set(targets.filter(({ to, kind: of }) => kept.has(keyOf(to, of)) && sharing(to, of) === 1).map(({ name, kind: of }) => keyOf(name, of)))
  return { targets, kept: new Set(kept.values()), renames, sole }
}

const rewriteTotals = (totals: Record<string, unknown>[], renames: Map<string, string>, sole: Set<string>) => {
  const kept: Record<string, unknown>[] = []
  const unchecked: Record<string, unknown>[] = []
  for (const item of totals) {
    const key = typeof item.category === 'string' && item.direction !== 'net' ? keyOf(item.category, String(item.direction)) : undefined
    const to = key && renames.get(key)
    if (!key || !to || to === item.category) kept.push(item)
    else if (sole.has(key)) kept.push({ ...item, category: to })
    else unchecked.push(item)
  }
  return { totals: kept, unchecked }
}

const applyWithin = async (client: Client, ledger: Writer, batchId: bigint, answer: z.infer<typeof consolidationOutput>) => {
  const { categories, users, existing } = await staged(client, batchId)
  const { targets, kept, renames, sole } = mergePlan(categories, existing, answer)
  for (const { row, to } of targets) {
    if (!kept.has(row)) await ledger.close('import_candidate', row.id)
    else if (row.payload.name !== to) await ledger.update('import_candidate', row.id, { payload: { ...row.payload, name: to } })
  }
  const rewritten = new Map<string, number>()
  for (const row of users) {
    const key = categoryOf(row)
    const to = key && renames.get(key)
    if (!key || !to || to === row.payload.category || row.status === 'edited') continue
    await ledger.update('import_candidate', row.id, { payload: { ...row.payload, category: to } })
    rewritten.set(key, (rewritten.get(key) ?? 0) + 1)
  }
  const merges = targets.filter(({ name, to }) => name !== to).map(({ name, kind: of, to }) => ({ name, kind: of, to, candidates: rewritten.get(keyOf(name, of)) ?? 0 }))
  return { merges, renames, sole }
}

type Batch = { status: string; input_tokens: bigint; output_tokens: bigint; cost_usd_micros: bigint; totals: Record<string, unknown>[]; consolidation: Consolidation }
type Applied = { consolidation: Consolidation; totals?: Record<string, unknown>[] }

const record = (client: Client, actor: Actor, batchId: bigint, spent: Usage, apply: (ledger: Writer, batch: Batch) => Promise<Applied>) =>
  write(client, actor, async (ledger) => {
    const batch = (await client.query<Batch>('select status, input_tokens, output_tokens, cost_usd_micros, totals, consolidation from import_batch where id = $1 and closed_at is null for update', [batchId])).rows[0]
    if (batch?.status !== 'draft' && batch?.status !== 'verified') throw new RuleError(`import batch ${batchId} is not open for consolidation`)
    const { consolidation, totals } = await apply(ledger, batch)
    const charged = spent.inputTokens + spent.outputTokens + spent.costUsdMicros > 0
    await ledger.update('import_batch', batchId, {
      consolidation: JSON.stringify(consolidation),
      ...(totals && { totals: JSON.stringify(totals) }),
      ...(charged && { input_tokens: batch.input_tokens + BigInt(spent.inputTokens), output_tokens: batch.output_tokens + BigInt(spent.outputTokens), cost_usd_micros: batch.cost_usd_micros + BigInt(spent.costUsdMicros) }),
    })
    return consolidation
  })

const reason = (error: unknown) => maskDigits(error instanceof Error ? error.message : String(error)).slice(0, 300)

const failed = async (client: Client, actor: Actor, batchId: bigint, spent: Usage, failure: string) => {
  await record(client, actor, batchId, spent, async (_, batch) => ({ consolidation: { ...batch.consolidation, failure } }))
  return { merges: [], failure, usage: spent }
}

export const consolidateBatch = async (client: Client, actor: Actor, batchId: bigint, consolidator: Consolidator, budget: number) => {
  const found = await staged(client, batchId)
  if (found.categories.length === 0) return { merges: [], failure: null, usage: nothing }
  if (budget <= 0) return failed(client, actor, batchId, nothing, 'token cap')
  let reply: Awaited<ReturnType<Consolidator['consolidate']>>
  try {
    reply = await consolidator.consolidate(taskOf(found, budget))
  } catch (error) {
    return failed(client, actor, batchId, error instanceof ExtractionError ? usage.parse(error.usage) : nothing, reason(error))
  }
  const spent = usage.parse(reply.usage)
  const parsed = consolidationOutput.safeParse(reply.output)
  if (!parsed.success) return failed(client, actor, batchId, spent, `invalid output: ${parsed.error.issues[0]?.message ?? 'unknown'}`)
  let merges: Merge[] = []
  await record(client, actor, batchId, spent, async (ledger, batch) => {
    const applied = await applyWithin(client, ledger, batchId, parsed.data)
    merges = applied.merges
    const { totals, unchecked } = rewriteTotals(batch.totals, applied.renames, applied.sole)
    const consolidation = { merges: [...batch.consolidation.merges, ...merges], unchecked: [...batch.consolidation.unchecked, ...unchecked], failure: null }
    return { consolidation, ...(JSON.stringify(totals) !== JSON.stringify(batch.totals) && { totals }) }
  })
  return { merges, failure: null, usage: spent }
}
