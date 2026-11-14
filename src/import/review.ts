import type { Client } from 'pg'
import { type Actor, type Writer, write } from '../db/write.ts'
import { RuleError } from '../ledger/rule.ts'
import { type CandidateKind, categoryPayload, payloads } from './candidate.ts'
import { maskDigits } from './staging.ts'
import { categoryKind, loadReferences, normalize, type References, type Staged, same, verifyWithin } from './verify.ts'

export const reviewDecisions = { accept: 'accepted', reject: 'rejected' } as const

export type ReviewDecision = keyof typeof reviewDecisions

type Open = Omit<Staged, 'confidence'> & { confidence: string; status: string; accepted_by_model: boolean }
type Reference = 'member' | 'account' | 'category' | 'reserve'
type Asked = { reference: Reference; name: string }

const reviewing = <T>(client: Client, actor: Actor, batchId: bigint, work: (ledger: Writer, candidates: Open[]) => Promise<T>) =>
  write(client, actor, async (ledger) => {
    const status = (await client.query<{ status: string }>('select status from import_batch where id = $1 and closed_at is null for update', [batchId])).rows[0]?.status
    if (status !== 'verified') throw new RuleError(`import batch ${batchId} is not open for review`)
    const { rows } = await client.query<Open>('select id, kind, source, confidence, payload, checks, status, accepted_by_model from import_candidate where batch_id = $1 and closed_at is null order by id', [batchId])
    const result = await work(ledger, rows)
    await verifyWithin(client, ledger, batchId)
    return result
  })

const candidateOf = (candidates: Open[], id: bigint) => {
  const found = candidates.find((item) => item.id === id)
  if (!found) throw new RuleError(`candidate ${id} is not open in import batch`)
  return found
}

export const reviewCandidates = (client: Client, actor: Actor, batchId: bigint, ids: bigint[], decision: ReviewDecision) =>
  reviewing(client, actor, batchId, async (ledger, candidates) => {
    const status = reviewDecisions[decision]
    const chosen = [...new Set(ids)].map((id) => candidateOf(candidates, id))
    for (const item of chosen) {
      if (decision === 'accept' && !payloads[item.kind].safeParse(item.payload).success) throw new RuleError(`candidate ${item.id} has an invalid payload; edit it first`)
      const unchanged = (item.status === status && !item.accepted_by_model) || (decision === 'accept' && item.status === 'edited')
      if (!unchanged) await ledger.update('import_candidate', item.id, { status, accepted_by_model: false })
    }
    return chosen.map((item) => item.id)
  })

const issues = (error: { issues: { path: PropertyKey[]; message: string }[] }) => error.issues.map(({ path, message }) => `${path.map(String).join('.') || 'payload'}: ${message}`).join('; ')

export const editCandidate = (client: Client, actor: Actor, batchId: bigint, candidateId: bigint, payload: unknown) =>
  reviewing(client, actor, batchId, async (ledger, candidates) => {
    const item = candidateOf(candidates, candidateId)
    const parsed = payloads[item.kind].safeParse(payload)
    if (!parsed.success) throw new RuleError(`invalid ${item.kind} payload: ${issues(parsed.error)}`)
    await ledger.update('import_candidate', item.id, { payload: parsed.data, status: 'edited', accepted_by_model: false })
    return item.id
  })

type Renamable = { category?: unknown; direction?: unknown; kind?: unknown; to?: unknown }

const renamed = <T extends Renamable>(items: T[], field: 'category' | 'to', from: string, to: string, kind: string) =>
  items.map((item) => {
    const of = field === 'to' ? item.kind : item.direction
    const value = item[field]
    return typeof value === 'string' && of === kind && normalize(value) === normalize(from) ? { ...item, [field]: to } : item
  })

export const renameCategory = (client: Client, actor: Actor, batchId: bigint, candidateId: bigint, name: string) =>
  reviewing(client, actor, batchId, async (ledger, candidates) => {
    const item = candidateOf(candidates, candidateId)
    if (item.kind !== 'category' || item.status === 'rejected') throw new RuleError(`candidate ${candidateId} is not a new category of import batch ${batchId}`)
    const parsed = categoryPayload.safeParse({ ...item.payload, name: maskDigits(name) })
    if (!parsed.success) throw new RuleError(`invalid category name: ${issues(parsed.error)}`)
    const { name: to, kind } = parsed.data
    const from = String(item.payload.name)
    if (to === from) return []
    const open = (await client.query<{ name: string }>('select name from category where closed_at is null and kind = $1', [kind])).rows.map((row) => row.name)
    const staged = candidates.filter((other) => other.id !== item.id && other.kind === 'category' && other.status !== 'rejected' && other.payload.kind === kind).map((other) => String(other.payload.name))
    if (normalize(to) !== normalize(from) && [...open, ...staged].some((taken) => normalize(taken) === normalize(to))) throw new RuleError(`category ${to} is already open; answer or edit the items to use it`)
    await ledger.update('import_candidate', item.id, { payload: parsed.data })
    const users = candidates.filter((other) => other.kind !== 'category' && typeof other.payload.category === 'string' && categoryKind(other.kind as CandidateKind, other.payload) === kind && normalize(other.payload.category) === normalize(from))
    for (const other of users) await ledger.update('import_candidate', other.id, { payload: { ...other.payload, category: to } })
    const batch = (await client.query<{ totals: Renamable[]; consolidation: { merges: Renamable[]; unchecked: Renamable[] } }>('select totals, consolidation from import_batch where id = $1', [batchId])).rows[0]
    if (batch) {
      const totals = renamed(batch.totals, 'category', from, to, kind)
      const consolidation = { ...batch.consolidation, merges: renamed(batch.consolidation.merges, 'to', from, to, kind), unchecked: renamed(batch.consolidation.unchecked, 'category', from, to, kind) }
      if (JSON.stringify({ totals, consolidation }) !== JSON.stringify(batch)) await ledger.update('import_batch', batchId, { totals: JSON.stringify(totals), consolidation: JSON.stringify(consolidation) })
    }
    return [item.id, ...users.map((other) => other.id)]
  })

const namedCheck = /^(?:unknown|matched)_(member|account|category|reserve)$|^(member|account)_unmatched$/

const words = (value: string) => ` ${normalize(value)} `

export const askedNames = (question: string, candidates: Pick<Staged, 'checks'>[]) => {
  const asked = new Map<string, Asked>()
  for (const { code, detail } of candidates.flatMap((item) => item.checks)) {
    const reference = code.match(namedCheck)?.slice(1).find(Boolean) as Reference | undefined
    const name = detail?.split(' → ')[0]
    if (!reference || !name || !normalize(name) || !words(question).includes(words(name))) continue
    asked.set(`${reference}|${normalize(name)}`, { reference, name })
  }
  return [...asked.values()]
}

const staged = (candidates: Open[], kind: string, field: string) => candidates.filter((item) => item.kind === kind && item.status !== 'rejected' && payloads[item.kind].safeParse(item.payload).success).map((item) => String(item.payload[field]))

export const canonicalName = (reference: Reference, answer: string, known: References, candidates: Open[]) => {
  if (reference === 'member') return ['Conjunto', 'joint'].some((name) => same(name, answer)) ? 'joint' : known.members.find((name) => same(name, answer))
  const names = {
    account: [...known.accounts.map((item) => item.name), ...staged(candidates, 'account', 'nickname')],
    category: [...known.categories.map((item) => item.name), ...staged(candidates, 'category', 'name')],
    reserve: [...known.reserves, ...staged(candidates, 'reserve', 'name')],
  }[reference]
  return names.find((name) => same(name, answer))
}

const applyAnswer = async (client: Client, ledger: Writer, candidates: Open[], question: string, answer: string) => {
  const known = await loadReferences(client, [])
  const resolved: bigint[] = []
  for (const { reference, name } of askedNames(question, candidates)) {
    const canonical = canonicalName(reference, answer, known, candidates)
    if (!canonical) continue
    for (const item of candidates) {
      const current = item.payload[reference]
      if (typeof current !== 'string' || !same(current, name) || current === canonical) continue
      item.payload = { ...item.payload, [reference]: canonical }
      await ledger.update('import_candidate', item.id, { payload: item.payload })
      resolved.push(item.id)
    }
  }
  return [...new Set(resolved)]
}

export const answerQuestion = (client: Client, actor: Actor, batchId: bigint, questionId: bigint, answer: string) =>
  reviewing(client, actor, batchId, async (ledger, candidates) => {
    const text = maskDigits(answer.trim())
    if (!text || text.length > 200) throw new RuleError('answer must have 1 to 200 characters')
    const question = (await client.query<{ question: string; answer: string | null }>('select question, answer from import_question where id = $1 and batch_id = $2 and closed_at is null', [questionId, batchId])).rows[0]
    if (!question) throw new RuleError(`question ${questionId} is not open in import batch ${batchId}`)
    if (question.answer !== null) throw new RuleError(`question ${questionId} is already answered`)
    await ledger.update('import_question', questionId, { answer: text })
    return { questionId, resolved: await applyAnswer(client, ledger, candidates, question.question, text) }
  })

export const decideQuestions = async (client: Client, ledger: Writer, batchId: bigint) => {
  const { rows } = await client.query<{ id: bigint; question: string; options: string[] }>('select id, question, options from import_question where batch_id = $1 and closed_at is null and answer is null and jsonb_array_length(options) > 0 order by id', [batchId])
  if (rows.length === 0) return []
  const candidates = (await client.query<Open>('select id, kind, source, confidence, payload, checks, status, accepted_by_model from import_candidate where batch_id = $1 and closed_at is null order by id', [batchId])).rows
  for (const { id, question, options } of rows) {
    const [first = ''] = options
    await ledger.update('import_question', id, { answer: first, decided_by_model: true })
    await applyAnswer(client, ledger, candidates, question, first)
  }
  return rows.map((row) => row.id)
}
