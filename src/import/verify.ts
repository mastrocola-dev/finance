import type { Client } from 'pg'
import { type Actor, write } from '../db/write.ts'
import { RuleError } from '../ledger/rule.ts'
import { type CandidateKind, payloads } from './candidate.ts'
import { maskDigits } from './staging.ts'

export const confidenceThreshold = 0.8

export type Check = { code: string; detail?: string }
export type Staged = { id: bigint; kind: CandidateKind; source: string; confidence: number; payload: Record<string, unknown>; checks: Check[] }
export type Named = { name: string; kind?: string }
export type LedgerRow = { id: bigint; key: string }
export type References = { members: string[]; accounts: Named[]; categories: Named[]; reserves: string[]; existing: LedgerRow[] }
export type Ask = { name: string; reference: Reference; candidate: bigint; kind?: string }
type Reference = 'member' | 'account' | 'category' | 'reserve'

export const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export const duplicateKey = (kind: CandidateKind, payload: Record<string, unknown>) => {
  const part = (key: string) => normalize(String(payload[key] ?? ''))
  if (kind === 'entry') return `entry|${payload.date}|${payload.amountCents}|${part('description')}`
  if (kind === 'account') return `account|${part('institution')}|${payload.lastFour}|${payload.kind}`
  if (kind === 'category') return `category|${part('name')}|${payload.kind}`
  if (kind === 'income' || kind === 'recurring_expense') return `${kind}|${payload.amountCents}|${part('description')}`
  if (kind === 'debt') return `debt|${part('creditor')}|${part('description')}`
  return `${kind}|${part('name')}`
}

const categoryKind = (kind: CandidateKind, payload: Record<string, unknown>) => (kind === 'entry' ? String(payload.direction) : kind === 'income' ? 'income' : 'expense')

const referencesOf = (kind: CandidateKind, payload: Record<string, unknown>) => {
  const wanted: { reference: Reference; name: string; kind?: string }[] = []
  const member = text(payload.member)
  if (member && !same(member, 'joint')) wanted.push({ reference: 'member', name: member })
  const account = text(payload.account)
  if (account) wanted.push({ reference: 'account', name: account })
  const category = text(payload.category)
  if (category) wanted.push({ reference: 'category', name: category, kind: categoryKind(kind, payload) })
  const reserve = text(payload.reserve)
  if (reserve) wanted.push({ reference: 'reserve', name: reserve })
  return wanted
}

export const findChecks = (candidates: Staged[], references: References, threshold = confidenceThreshold) => {
  const live = (kind: CandidateKind) => candidates.filter((item) => item.kind === kind && payloads[kind].safeParse(item.payload).success)
  const stagedAccounts = live('account').map((item) => String(item.payload.nickname))
  const stagedCategories = live('category').map((item) => ({ name: String(item.payload.name), kind: String(item.payload.kind) }))
  const stagedReserves = live('reserve').map((item) => String(item.payload.name))
  const known = {
    member: (name: string) => references.members.some((item) => same(item, name)),
    account: (name: string) => [...references.accounts.map((item) => item.name), ...stagedAccounts].some((item) => same(item, name)),
    category: (name: string, kind?: string) => [...references.categories, ...stagedCategories].some((item) => same(item.name, name) && item.kind === kind),
    reserve: (name: string) => [...references.reserves, ...stagedReserves].some((item) => same(item, name)),
  }
  const ledger = new Map(references.existing.map((row) => [row.key, row.id]))
  const seen = new Map<string, string>()
  const asks: Ask[] = []
  const checks = new Map<bigint, Check[]>()
  for (const item of candidates) {
    const found: Check[] = []
    const parsed = payloads[item.kind].safeParse(item.payload)
    if (!parsed.success) found.push({ code: 'invalid', detail: parsed.error.issues.map(({ path, message }) => `${path.join('.') || 'payload'}: ${message}`).join('; ') })
    if (item.confidence < threshold) found.push({ code: 'low_confidence', detail: item.confidence.toFixed(2) })
    if (parsed.success) {
      for (const wanted of referencesOf(item.kind, item.payload)) {
        if (known[wanted.reference](wanted.name, wanted.kind)) continue
        found.push({ code: `unknown_${wanted.reference}`, detail: wanted.name })
        asks.push({ ...wanted, candidate: item.id })
      }
      const key = duplicateKey(item.kind, item.payload)
      const earlier = seen.get(key)
      if (earlier) found.push({ code: 'duplicate_in_file', detail: earlier })
      else seen.set(key, item.source)
      const existing = ledger.get(key)
      if (existing !== undefined) found.push({ code: 'duplicate_in_ledger', detail: `${item.kind} ${existing}` })
    }
    checks.set(item.id, found)
  }
  return { checks, asks: uniqueAsks(asks) }
}

const uniqueAsks = (asks: Ask[]) => {
  const first = new Map<string, Ask>()
  for (const ask of asks) {
    const key = `${ask.reference}|${ask.kind ?? ''}|${ask.name.trim().toLowerCase()}`
    if (!first.has(key)) first.set(key, ask)
  }
  return [...first.values()]
}

const labels = { member: ['Quem é', 'Conjunto'], account: ['Qual conta é', 'Nova conta'], category: ['Qual categoria é', 'Nova categoria'], reserve: ['Qual reserva é', 'Nova reserva'] } as const

export const questionFor = (ask: Ask, references: References) => {
  const [prompt, fresh] = labels[ask.reference]
  const choices = {
    member: references.members,
    account: references.accounts.map((item) => item.name),
    category: references.categories.filter((item) => item.kind === ask.kind).map((item) => item.name),
    reserve: references.reserves,
  }[ask.reference]
  return { question: maskDigits(`${prompt} "${ask.name.trim()}"?`), options: [...choices.slice(0, 5), fresh].map(maskDigits) }
}

const loadReferences = async (client: Client, candidates: Staged[]): Promise<References> => {
  const names = async (sql: string) => (await client.query<Named>(sql)).rows
  const dates = candidates.filter((item) => item.kind === 'entry' && payloads.entry.safeParse(item.payload).success).map((item) => item.payload.date)
  const keyed = async (kind: CandidateKind, sql: string, values: unknown[] = []) => (await client.query<{ id: bigint; payload: Record<string, unknown> }>(sql, values)).rows.map((row) => ({ id: row.id, key: duplicateKey(kind, row.payload) }))
  const existing = [
    ...(await keyed('entry', "select id, jsonb_build_object('date', due_on::text, 'amountCents', amount_cents::text, 'description', description) as payload from entry where closed_at is null and due_on = any($1::date[])", [dates])),
    ...(await keyed('account', "select id, jsonb_build_object('institution', institution, 'lastFour', last_four, 'kind', kind) as payload from account where closed_at is null")),
    ...(await keyed('category', "select id, jsonb_build_object('name', name, 'kind', kind) as payload from category where closed_at is null")),
    ...(await keyed('income', "select id, jsonb_build_object('amountCents', amount_cents::text, 'description', description) as payload from income where closed_at is null")),
    ...(await keyed('recurring_expense', "select id, jsonb_build_object('amountCents', amount_cents::text, 'description', description) as payload from recurring_expense where closed_at is null")),
    ...(await keyed('debt', "select id, jsonb_build_object('creditor', creditor, 'description', description) as payload from debt where closed_at is null")),
    ...(await keyed('reserve', "select id, jsonb_build_object('name', name) as payload from reserve where closed_at is null")),
    ...(await keyed('goal', "select id, jsonb_build_object('name', name) as payload from goal where closed_at is null")),
  ]
  return {
    members: (await names('select name from member where closed_at is null order by id')).map((row) => row.name),
    accounts: await names('select nickname as name from account where closed_at is null order by id'),
    categories: await names('select name, kind from category where closed_at is null order by name'),
    reserves: (await names('select name from reserve where closed_at is null order by id')).map((row) => row.name),
    existing,
  }
}

const sameChecks = (a: Check[], b: Check[]) => JSON.stringify(a) === JSON.stringify(b)

export const verifyBatch = (client: Client, actor: Actor, batchId: bigint, threshold = confidenceThreshold) =>
  write(client, actor, async (ledger) => {
    const batch = (await client.query<{ status: string }>('select status from import_batch where id = $1 and closed_at is null for update', [batchId])).rows[0]
    if (batch?.status !== 'draft' && batch?.status !== 'verified') throw new RuleError(`import batch ${batchId} is not open for verification`)
    const { rows } = await client.query<Omit<Staged, 'confidence'> & { confidence: string }>("select id, kind, source, confidence, payload, checks from import_candidate where batch_id = $1 and closed_at is null and status <> 'rejected' order by id", [batchId])
    const candidates = rows.map((row) => ({ ...row, confidence: Number(row.confidence) }))
    const references = await loadReferences(client, candidates)
    const { checks, asks } = findChecks(candidates, references, threshold)
    for (const item of candidates) {
      const found = checks.get(item.id) ?? []
      if (!sameChecks(found, item.checks)) await ledger.update('import_candidate', item.id, { checks: JSON.stringify(found) })
    }
    const open = (await client.query<{ question: string; candidate_id: bigint | null }>('select question, candidate_id from import_question where batch_id = $1 and closed_at is null', [batchId])).rows
    const covered = (ask: Ask, question: string) => open.some((item) => item.question === question || (item.candidate_id === ask.candidate && normalize(item.question).includes(normalize(ask.name))))
    const questions: bigint[] = []
    for (const ask of asks) {
      const { question, options } = questionFor(ask, references)
      if (covered(ask, question)) continue
      const row = await ledger.create('import_question', { batch_id: batchId, candidate_id: ask.candidate, question, options: JSON.stringify(options), source: candidates.find((item) => item.id === ask.candidate)?.source ?? null })
      questions.push(row.id as bigint)
    }
    if (batch.status === 'draft') await ledger.update('import_batch', batchId, { status: 'verified' })
    const failed = candidates.filter((item) => checks.get(item.id)?.some((check) => check.code !== 'low_confidence')).map((item) => item.id)
    const lowConfidence = candidates
      .filter((item) => item.confidence < threshold)
      .sort((a, b) => a.confidence - b.confidence)
      .map((item) => item.id)
    return { checked: candidates.length, failed, lowConfidence, questions }
  })
