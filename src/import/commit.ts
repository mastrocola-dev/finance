import type { Client } from 'pg'
import type * as z from 'zod'
import { type Actor, type Closable, type Row, write } from '../db/write.ts'
import { RuleError } from '../ledger/rule.ts'
import { competenceOf } from '../ledger/summary.ts'
import { type CandidateKind, payloads } from './candidate.ts'
import { type Check, verifyWithin } from './verify.ts'

type Chosen = { id: bigint; kind: CandidateKind; payload: Record<string, unknown>; checks: Check[] }
type Payload<K extends CandidateKind> = z.output<(typeof payloads)[K]>

export const commitOrder: CandidateKind[] = ['category', 'account', 'reserve', 'income', 'recurring_expense', 'debt', 'goal', 'entry']

const unique: CandidateKind[] = ['account', 'category', 'reserve', 'goal']

const blocking = (kind: CandidateKind) => (check: Check) => check.code === 'invalid' || check.code.startsWith('unknown_') || (unique.includes(kind) && check.code.startsWith('duplicate_'))

export const resolver = (client: Client) => {
  const one = async (sql: string, values: unknown[], missing: string) => {
    const [row] = (await client.query<{ id: bigint }>(sql, values)).rows
    if (!row) throw new RuleError(missing)
    return row.id
  }
  const member = async (name: string | undefined) => {
    if (name === undefined || name.trim().toLowerCase() === 'joint') return null
    return one('select id from member where closed_at is null and lower(name) = lower($1)', [name.trim()], `unknown member ${name}`)
  }
  const account = async (nickname: string | undefined) => (nickname === undefined ? null : one('select id from account where closed_at is null and lower(nickname) = lower($1)', [nickname.trim()], `unknown account ${nickname}`))
  const category = async (name: string | undefined, kind: string) => (name === undefined ? null : one('select id from category where closed_at is null and lower(name) = lower($1) and kind = $2', [name.trim(), kind], `unknown ${kind} category ${name}`))
  const reserve = async (name: string | undefined) => (name === undefined ? null : one('select id from reserve where closed_at is null and lower(name) = lower($1)', [name.trim()], `unknown reserve ${name}`))
  return { member, account, category, reserve }
}

export const rowOf = async (resolve: ReturnType<typeof resolver>, kind: CandidateKind, payload: Record<string, unknown>): Promise<Row> => {
  if (kind === 'category') {
    const item = payload as Payload<'category'>
    return { name: item.name, kind: item.kind }
  }
  if (kind === 'account') {
    const item = payload as Payload<'account'>
    return { institution: item.institution, nickname: item.nickname, last_four: item.lastFour, kind: item.kind, member_id: await resolve.member(item.member) }
  }
  if (kind === 'reserve') {
    const item = payload as Payload<'reserve'>
    return { name: item.name, balance_cents: item.balanceCents, target_cents: item.targetCents ?? null, account_id: await resolve.account(item.account) }
  }
  if (kind === 'goal') {
    const item = payload as Payload<'goal'>
    return { name: item.name, target_cents: item.targetCents, saved_cents: item.savedCents, due_on: item.dueOn ?? null, reserve_id: await resolve.reserve(item.reserve) }
  }
  if (kind === 'income') {
    const item = payload as Payload<'income'>
    const member = await resolve.member(item.member)
    if (member === null) throw new RuleError(`income ${item.description} needs a member`)
    const plan = { amount_cents: item.amountCents, day_of_month: item.dayOfMonth, starts_on: item.startsOn, ends_on: item.endsOn ?? null }
    return { description: item.description, member_id: member, category_id: await resolve.category(item.category, 'income'), account_id: await resolve.account(item.account), ...plan }
  }
  if (kind === 'recurring_expense') {
    const item = payload as Payload<'recurring_expense'>
    const plan = { amount_cents: item.amountCents, day_of_month: item.dayOfMonth, starts_on: item.startsOn, ends_on: item.endsOn ?? null, installments_total: item.installmentsTotal ?? null }
    return { description: item.description, category_id: await resolve.category(item.category, 'expense'), account_id: await resolve.account(item.account), member_id: await resolve.member(item.member), ...plan }
  }
  if (kind === 'debt') {
    const item = payload as Payload<'debt'>
    return {
      creditor: item.creditor,
      description: item.description,
      member_id: await resolve.member(item.member),
      account_id: await resolve.account(item.account),
      principal_cents: item.principalCents,
      balance_cents: item.balanceCents,
      monthly_rate_percent: item.monthlyRatePercent ?? null,
      installment_cents: item.installmentCents ?? null,
      installments_total: item.installmentsTotal ?? null,
      installments_paid: item.installmentsPaid ?? 0,
      starts_on: item.startsOn,
    }
  }
  const item = payload as Payload<'entry'>
  return {
    competence: competenceOf(item.date),
    due_on: item.date,
    description: item.description,
    direction: item.direction,
    amount_cents: item.amountCents,
    category_id: await resolve.category(item.category, item.direction),
    account_id: await resolve.account(item.account),
    member_id: await resolve.member(item.member),
    installment_number: item.installment?.number ?? null,
    status: item.paid ? 'paid' : 'planned',
    paid_on: item.paid ? item.date : null,
    origin: 'import',
  }
}

export const commitBatch = (client: Client, actor: Actor, batchId: bigint) =>
  write(client, actor, async (ledger) => {
    const status = (await client.query<{ status: string }>('select status from import_batch where id = $1 and closed_at is null for update', [batchId])).rows[0]?.status
    if (status !== 'verified') throw new RuleError(`import batch ${batchId} is not verified`)
    await verifyWithin(client, ledger, batchId)
    const { rows } = await client.query<Chosen>("select id, kind, payload, checks from import_candidate where batch_id = $1 and closed_at is null and status in ('accepted', 'edited') order by id", [batchId])
    if (rows.length === 0) throw new RuleError(`import batch ${batchId} has no accepted candidates`)
    const blocked = rows.filter((item) => item.checks.some(blocking(item.kind)))
    if (blocked.length > 0) throw new RuleError(`candidates ${blocked.map((item) => item.id).join(', ')} have failed checks; edit, answer or reject them first`)
    const resolve = resolver(client)
    const committed: { candidate: bigint; kind: CandidateKind; record: bigint }[] = []
    for (const kind of commitOrder) {
      for (const item of rows.filter((row) => row.kind === kind)) {
        const payload = payloads[kind].parse(item.payload) as Record<string, unknown>
        const record = await ledger.create(kind as Closable, { ...(await rowOf(resolve, kind, payload)), import_batch_id: batchId })
        await ledger.update('import_candidate', item.id, { record_id: record.id })
        committed.push({ candidate: item.id, kind, record: record.id as bigint })
      }
    }
    await ledger.update('import_batch', batchId, { status: 'committed' })
    return committed
  })
