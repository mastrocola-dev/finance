import type { Client } from 'pg'
import { type Actor, type Writer, write } from '../db/write.ts'
import { RuleError } from '../ledger/rule.ts'
import { payloads } from './candidate.ts'
import { maskDigits } from './staging.ts'
import { loadReferences, normalize, type References, type Staged, same, verifyWithin } from './verify.ts'

export const reviewDecisions = { accept: 'accepted', reject: 'rejected' } as const

export type ReviewDecision = keyof typeof reviewDecisions

type Open = Omit<Staged, 'confidence'> & { confidence: string; status: string }
type Reference = 'member' | 'account' | 'category' | 'reserve'
type Asked = { reference: Reference; name: string }

const reviewing = <T>(client: Client, actor: Actor, batchId: bigint, work: (ledger: Writer, candidates: Open[]) => Promise<T>) =>
  write(client, actor, async (ledger) => {
    const status = (await client.query<{ status: string }>('select status from import_batch where id = $1 and closed_at is null for update', [batchId])).rows[0]?.status
    if (status !== 'verified') throw new RuleError(`import batch ${batchId} is not open for review`)
    const { rows } = await client.query<Open>('select id, kind, source, confidence, payload, checks, status from import_candidate where batch_id = $1 and closed_at is null order by id', [batchId])
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
      const unchanged = item.status === status || (decision === 'accept' && item.status === 'edited')
      if (!unchanged) await ledger.update('import_candidate', item.id, { status })
    }
    return chosen.map((item) => item.id)
  })

const issues = (error: { issues: { path: PropertyKey[]; message: string }[] }) => error.issues.map(({ path, message }) => `${path.map(String).join('.') || 'payload'}: ${message}`).join('; ')

export const editCandidate = (client: Client, actor: Actor, batchId: bigint, candidateId: bigint, payload: unknown) =>
  reviewing(client, actor, batchId, async (ledger, candidates) => {
    const item = candidateOf(candidates, candidateId)
    const parsed = payloads[item.kind].safeParse(payload)
    if (!parsed.success) throw new RuleError(`invalid ${item.kind} payload: ${issues(parsed.error)}`)
    await ledger.update('import_candidate', item.id, { payload: parsed.data, status: 'edited' })
    return item.id
  })

const words = (value: string) => ` ${normalize(value)} `

export const askedNames = (question: string, candidates: Pick<Staged, 'checks'>[]) => {
  const asked = new Map<string, Asked>()
  for (const { code, detail } of candidates.flatMap((item) => item.checks)) {
    const reference = code.replace(/^unknown_/, '') as Reference
    if (!code.startsWith('unknown_') || !detail || !normalize(detail) || !words(question).includes(words(detail))) continue
    asked.set(`${reference}|${normalize(detail)}`, { reference, name: detail })
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

export const answerQuestion = (client: Client, actor: Actor, batchId: bigint, questionId: bigint, answer: string) =>
  reviewing(client, actor, batchId, async (ledger, candidates) => {
    const text = maskDigits(answer.trim())
    if (!text || text.length > 200) throw new RuleError('answer must have 1 to 200 characters')
    const question = (await client.query<{ question: string; answer: string | null }>('select question, answer from import_question where id = $1 and batch_id = $2 and closed_at is null', [questionId, batchId])).rows[0]
    if (!question) throw new RuleError(`question ${questionId} is not open in import batch ${batchId}`)
    if (question.answer !== null) throw new RuleError(`question ${questionId} is already answered`)
    await ledger.update('import_question', questionId, { answer: text })
    const known = await loadReferences(client, [])
    const resolved: bigint[] = []
    for (const { reference, name } of askedNames(question.question, candidates)) {
      const canonical = canonicalName(reference, text, known, candidates)
      if (!canonical) continue
      for (const item of candidates) {
        const current = item.payload[reference]
        if (typeof current !== 'string' || !same(current, name) || current === canonical) continue
        item.payload = { ...item.payload, [reference]: canonical }
        await ledger.update('import_candidate', item.id, { payload: item.payload })
        resolved.push(item.id)
      }
    }
    return { questionId, resolved: [...new Set(resolved)] }
  })
