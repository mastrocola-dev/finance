import type { Client } from 'pg'
import * as z from 'zod'
import type { Queryable } from '../db/connection.ts'
import { type Actor, type Row, write } from '../db/write.ts'
import { balance, type CandidateKind, dayOfMonth, payloads, text } from '../import/candidate.ts'
import { resolver, rowOf } from '../import/commit.ts'
import { RuleError } from './rule.ts'

export const setupKinds = ['category', 'account', 'reserve', 'income', 'recurring_expense', 'debt', 'goal'] as const satisfies CandidateKind[]

export type SetupKind = (typeof setupKinds)[number]

export type SetupRecord = { kind: SetupKind; id: string; name: string; detail: string | null; amount: bigint | null; day: number | null; member: string | null; category: string | null; account: string | null }

const columns: Record<SetupKind, { name: string; amount?: string; day?: true; account?: true; category?: 'income' | 'expense' }> = {
  category: { name: 'name' },
  account: { name: 'nickname' },
  reserve: { name: 'name', amount: 'balance_cents', account: true },
  income: { name: 'description', amount: 'amount_cents', day: true, account: true, category: 'income' },
  recurring_expense: { name: 'description', amount: 'amount_cents', day: true, account: true, category: 'expense' },
  debt: { name: 'creditor', amount: 'balance_cents', account: true },
  goal: { name: 'name', amount: 'target_cents' },
}

export const recordChanges = z
  .strictObject({
    name: text('New name, description, nickname or creditor'),
    amountCents: balance('New amount: monthly amount, balance of a reserve or debt, target of a goal'),
    dayOfMonth,
    account: text('Account nickname').nullable().describe('Account nickname, null to clear'),
    category: text('Category name'),
  })
  .partial()

export type RecordChanges = z.output<typeof recordChanges>

const label = (kind: SetupKind) => kind.replace('_', ' ')

const uniqueViolation = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'

const unique = async <T>(kind: SetupKind, name: string, work: () => Promise<T>) => {
  try {
    return await work()
  } catch (error) {
    if (uniqueViolation(error)) throw new RuleError(`${label(kind)} ${name} already exists`)
    throw error
  }
}

const invalid = (kind: SetupKind, issues: z.core.$ZodIssue[]) => new RuleError(`invalid ${kind} payload: ${issues.map((issue) => `${issue.path.join('.') || kind}: ${issue.message}`).join('; ')}`)

export const registerRecord = (client: Client, actor: Actor, kind: SetupKind, input: unknown) =>
  write(client, actor, async (ledger) => {
    const parsed = payloads[kind].safeParse(input)
    if (!parsed.success) throw invalid(kind, parsed.error.issues)
    const payload = parsed.data as Record<string, unknown>
    const name = String(payload[columns[kind].name])
    const row = await rowOf(resolver(client), kind, payload)
    return unique(kind, name, async () => (await ledger.create(kind, row)).id as bigint)
  })

export const editRecord = (client: Client, actor: Actor, kind: SetupKind, id: bigint, input: unknown) =>
  write(client, actor, async (ledger) => {
    const parsed = recordChanges.safeParse(input)
    if (!parsed.success) throw invalid(kind, parsed.error.issues)
    const changes = parsed.data
    const fields = columns[kind]
    const allowed = { name: true, amountCents: fields.amount, dayOfMonth: fields.day, account: fields.account, category: fields.category }
    const refused = Object.keys(changes).filter((field) => !allowed[field as keyof RecordChanges])
    if (refused.length) throw new RuleError(`${label(kind)} has no ${refused.join(', ')} to change`)
    if (!Object.keys(changes).length) throw new RuleError('nothing to change')
    const resolve = resolver(client)
    const row: Row = {}
    if (changes.name !== undefined) row[fields.name] = changes.name
    if (changes.amountCents !== undefined && fields.amount) {
      if (changes.amountCents === 0 && !fields.amount.startsWith('balance')) throw new RuleError(`${label(kind)} amount must be positive`)
      row[fields.amount] = changes.amountCents
    }
    if (changes.dayOfMonth !== undefined) row.day_of_month = changes.dayOfMonth
    if (changes.account !== undefined) row.account_id = changes.account === null ? null : await resolve.account(changes.account)
    if (changes.category !== undefined && fields.category) row.category_id = await resolve.category(changes.category, fields.category)
    return unique(kind, changes.name ?? '', async () => (await ledger.update(kind, id, row)).id as bigint)
  })

export const closeRecord = (client: Client, actor: Actor, kind: SetupKind, id: bigint) =>
  write(client, actor, async (ledger) => {
    await ledger.close(kind, id)
    return id
  })

const records = `
  select 'category' as kind, c.id::text, c.name, c.kind as detail, null::bigint as amount, null::int as day, null as member, null as category, null as account, c.id as sort
  from category c where c.closed_at is null
  union all
  select 'account', a.id::text, a.nickname, a.institution || ' · ' || a.kind || ' · ' || a.last_four, null, null, m.name, null, null, a.id
  from account a left join member m on m.id = a.member_id where a.closed_at is null
  union all
  select 'reserve', r.id::text, r.name, null, r.balance_cents, null, null, null, a.nickname, r.id
  from reserve r left join account a on a.id = r.account_id where r.closed_at is null
  union all
  select 'income', i.id::text, i.description, null, i.amount_cents, i.day_of_month, m.name, c.name, a.nickname, i.id
  from income i join member m on m.id = i.member_id left join category c on c.id = i.category_id left join account a on a.id = i.account_id where i.closed_at is null
  union all
  select 'recurring_expense', r.id::text, r.description, case when r.installments_total is null then null else r.installments_total::text end, r.amount_cents, r.day_of_month, m.name, c.name, a.nickname, r.id
  from recurring_expense r join category c on c.id = r.category_id left join member m on m.id = r.member_id left join account a on a.id = r.account_id where r.closed_at is null
  union all
  select 'debt', d.id::text, d.creditor, d.description, d.balance_cents, null, m.name, null, a.nickname, d.id
  from debt d left join member m on m.id = d.member_id left join account a on a.id = d.account_id where d.closed_at is null
  union all
  select 'goal', g.id::text, g.name, r.name, g.target_cents, null, null, null, null, g.id
  from goal g left join reserve r on r.id = g.reserve_id where g.closed_at is null
`

export const listSetup = async (client: Queryable) => {
  const { rows } = await client.query<SetupRecord & { sort: bigint }>(`select * from (${records}) s order by kind, lower(name), sort`)
  return rows.map(({ sort, ...record }) => record)
}
